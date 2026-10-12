import { createOcgcoreWrapper, ZipScriptReader, SqljsCardReader } from 'koishipro-core.js';
import initSqlJs from 'sql.js';
import { CardDatabase, type CardData } from './engine/card-database';
import { parseYdk } from './engine/ydk';
import { DuelRunner, type DuelEvent } from './engine/duel-runner';
import { ThreeBoard } from './render/three-board';
import { LOCATION, PHASE, POS } from './engine/constants';
import {
  YGOProMsgSelectIdleCmd,
  YGOProMsgSelectBattleCmd,
  YGOProMsgSelectChain,
  YGOProMsgSelectCard,
  YGOProMsgSelectUnselectCard,
  YGOProMsgSelectTribute,
  YGOProMsgSelectSum,
  YGOProMsgSelectPosition,
  YGOProMsgSelectOption,
  YGOProMsgSelectYesNo,
  YGOProMsgSelectEffectYn,
  YGOProMsgSelectPlace,
  YGOProMsgSortCard,
  IdleCmdType,
  BattleCmdType,
  IndexResponse,
} from 'ygopro-msg-encode';
import type { CardMesh } from './render/card-mesh';
import { AudioManager } from './audio/audio-manager';
import { MainMenu, type MainMenuCallbacks } from './ui/main-menu';
import { DeckEditor } from './ui/deck-editor';
import { deckStore } from './ui/deck-store';
import { customAssets } from './ui/custom-assets';
import {
  renderFramedCardHTML,
  renderCardInspectorHTML,
  renderHiddenFramedCardHTML,
  renderHiddenCardInspectorHTML,
  extractCardEffectOptions,
  resolveCardFromDescriptions,
  type InspectorHighlightInfo,
} from './ui/card-ui';

type DuelStartConfig = Parameters<MainMenuCallbacks['onStartDuel']>[0];
type CardLocation = { controller: number; location: number; sequence: number };

function formatLocationLabel(loc: number): { name: string; cls: string } {
  if (loc & LOCATION.DECK) return { name: 'DECK', cls: 'loc-deck' };
  if (loc & LOCATION.HAND) return { name: 'HAND', cls: 'loc-hand' };
  if (loc & LOCATION.ONFIELD) return { name: 'FIELD', cls: 'loc-field' };
  if (loc & LOCATION.GRAVE) return { name: 'GY', cls: 'loc-gy' };
  if (loc & LOCATION.REMOVED) return { name: 'BANISHED', cls: 'loc-banished' };
  if (loc & LOCATION.EXTRA) return { name: 'EXTRA', cls: 'loc-extra' };
  return { name: 'ZONE', cls: 'loc-field' };
}

function isCardHiddenForHuman(controller: number, location: number, position: number = 0): boolean {
  if (controller === 0) return false;
  if ((location & LOCATION.HAND) !== 0) {
    return (position & POS.FACEUP) === 0;
  }
  if ((location & LOCATION.EXTRA) !== 0) {
    return (position & POS.FACEUP) === 0;
  }
  if ((location & (LOCATION.ONFIELD | LOCATION.REMOVED)) !== 0) {
    return (position & POS.FACEDOWN) !== 0;
  }
  return false;
}

async function bootstrap() {
  await customAssets.preloadAll();

  const mainMenuContainer = document.getElementById('main-menu-container')!;
  const duelContainer = document.getElementById('duel-container')!;
  const deckEditorContainer = document.getElementById('deck-editor-container')!;
  const boardContainer = document.getElementById('board-container')!;
  const popover = document.getElementById('card-action-popover')!;
  const extraPopover = document.getElementById('extra-deck-action-popover')!;
  const extraDrawer = document.getElementById('extra-deck-drawer')!;
  const extraDrawerList = document.getElementById('extra-drawer-list')!;
  const extraDrawerTitle = document.getElementById('extra-drawer-title')!;
  const chainOverlay = document.getElementById('chain-overlay')!;
  const cardMoveFeed = document.getElementById('card-move-feed')!;
  const zoneSelectBanner = document.getElementById('zone-select-banner')!;
  const zoneSelectText = document.getElementById('zone-select-text')!;
  const multiEffectModal = document.getElementById('multi-effect-modal')!;
  const battlePosModal = document.getElementById('battle-pos-modal')!;
  const selectModal = document.getElementById('card-select-modal')!;
  const promptModal = document.getElementById('prompt-modal')!;
  const promptTitle = document.getElementById('prompt-title')!;
  const promptOptions = document.getElementById('prompt-options')!;
  const logDrawer = document.getElementById('log-drawer')!;
  const cardInspector = document.getElementById('card-inspector')!;
  const duelResultOverlay = document.getElementById('duel-result-overlay')!;
  const duelResultBadge = document.getElementById('duel-result-badge')!;
  const duelResultWinner = document.getElementById('duel-result-winner')!;
  const duelResultReason = document.getElementById('duel-result-reason')!;

  const appendLog = (msg: string) => {
    const el = document.createElement('div');
    el.className = 'log-entry';
    el.textContent = msg;
    logDrawer.appendChild(el);
    logDrawer.scrollTop = logDrawer.scrollHeight;
  };

  // 1. Audio Manager
  const audio = new AudioManager();

  // 2. Fetch WASM and game assets
  const wasmRes = await fetch('/wasm/libocgcore.wasm');
  const wasmBinary = new Uint8Array(await wasmRes.arrayBuffer());
  const wrapper = await createOcgcoreWrapper({ wasmBinary });

  const zipRes = await fetch('/data/script.zip');
  const zipBytes = new Uint8Array(await zipRes.arrayBuffer());
  wrapper.setScriptReader(await ZipScriptReader(zipBytes), true);

  // 3. Initialize sql.js with local wasm
  const SQL = await initSqlJs({
    locateFile: () => '/wasm/sql-wasm.wasm',
  });
  const cdbRes = await fetch('/data/locales/en-US/cards.cdb');
  const cdbBytes = new Uint8Array(await cdbRes.arrayBuffer());
  const db = new SQL.Database(cdbBytes);
  wrapper.setCardReader(SqljsCardReader(db), true);

  const stringsRes = await fetch('/data/locales/en-US/strings.conf');
  const stringsText = await stringsRes.text();
  const cardDb = new CardDatabase(db, stringsText);

  // 4. Pre-built Decks
  let prebuiltDecks: Record<string, string> = {};
  try {
    prebuiltDecks = await fetch('/api/decks').then((r) => r.json());
  } catch {}
  deckStore.setPrebuilt(prebuiltDecks);

  // 5. Duel Runner & Board State
  let runner: DuelRunner | null = null;
  let board: ThreeBoard | null = null;
  let currentPrompt: any = null;
  let lastInspectedCard: CardData | null = null;
  let activeEffectCard: CardData | null = null;
  let autoPlayInterval: number | null = null;
  let selectedCardsForPrompt: Array<{ index: number; code: number; cardMesh?: CardMesh }> = [];
  let activeChainLinks: Array<{
    chainCount: number;
    code: number;
    player: number;
    status?: 'pending' | 'solving' | 'solved';
  }> = [];
  let chainHideTimeout: number | null = null;

  // Authentic Master Duel Left Card Inspector
  const inspectCard = (
    card: CardData | null,
    code?: number,
    highlightInfo?: InspectorHighlightInfo & { descCode?: number },
  ) => {
    const resolved = card ?? (code ? cardDb.getCard(code) : null);
    const cardCode = resolved?.id ?? code ?? 89631139;
    if (resolved) lastInspectedCard = resolved;

    let finalHighlight: InspectorHighlightInfo | undefined = highlightInfo
      ? { ...highlightInfo }
      : undefined;

    if (highlightInfo?.descCode && resolved) {
      const extracted = extractCardEffectOptions(resolved, [highlightInfo.descCode], cardDb);
      if (extracted[0]) {
        finalHighlight = {
          ...finalHighlight,
          activeEffectText: extracted[0],
          highlightActivatable: true,
        };
      }
    }

    // Auto-detect if this card has an activatable effect in currentPrompt to highlight in cyan
    if (!finalHighlight && resolved && currentPrompt) {
      if (currentPrompt instanceof YGOProMsgSelectIdleCmd) {
        const actMatch = currentPrompt.activatableCards.find((c: any) => c.code === resolved.id);
        if (actMatch) {
          const extracted = extractCardEffectOptions(resolved, [actMatch.desc], cardDb);
          finalHighlight = {
            activeEffectText: extracted[0],
            highlightActivatable: true,
          };
        }
      } else if (currentPrompt instanceof YGOProMsgSelectChain) {
        const chainMatch = currentPrompt.chains.find((c: any) => c.code === resolved.id);
        if (chainMatch) {
          const extracted = extractCardEffectOptions(resolved, [chainMatch.desc], cardDb);
          finalHighlight = {
            activeEffectText: extracted[0],
            highlightActivatable: true,
          };
        }
      } else if (currentPrompt instanceof YGOProMsgSelectEffectYn) {
        if ((currentPrompt as any).code === resolved.id) {
          const extracted = extractCardEffectOptions(resolved, [(currentPrompt as any).desc], cardDb);
          finalHighlight = {
            activeEffectText: extracted[0],
            highlightActivatable: true,
          };
        }
      }
    }

    cardInspector.innerHTML = renderCardInspectorHTML(resolved, cardCode, finalHighlight);
  };

  const inspectHiddenCard = (location: number = 0) => {
    cardInspector.innerHTML = renderHiddenCardInspectorHTML(location);
  };

  // Initialize default inspector card
  inspectCard(cardDb.getCard(89631139), 89631139);

  // 6. Initialize Deck Editor
  const deckEditor = new DeckEditor(deckEditorContainer, cardDb, {
    onClose: () => {
      deckEditorContainer.innerHTML = '';
      deckEditorContainer.classList.add('hidden');
      mainMenuContainer.classList.remove('hidden');
      audio.playBGM(mainMenu.getProfile().mainBgm || 'BGM_MENU_01.ogg');
    },
    onCardInspect: (card) => {
      inspectCard(card, card.id);
    },
    onDeckSaved: (name) => {
      const p = mainMenu.getProfile();
      p.playerDeckName = 'custom:' + name;
      mainMenu.saveProfile();
    },
  });
  deckEditor.setPrebuiltDecks(prebuiltDecks);

  // Master Duel Phase Button Visibility Helper
  const updatePhaseButtons = (bp = false, m2 = false, ep = false) => {
    const btnBp = document.getElementById('btn-to-bp');
    const btnM2 = document.getElementById('btn-to-m2');
    const btnEp = document.getElementById('btn-to-ep');
    if (btnBp) btnBp.classList.toggle('hidden', !bp);
    if (btnM2) btnM2.classList.toggle('hidden', !m2);
    if (btnEp) btnEp.classList.toggle('hidden', !ep);
  };

  const phaseNames: Record<number, string> = {
    [PHASE.DRAW]: 'Draw',
    [PHASE.STANDBY]: 'Standby',
    [PHASE.MAIN1]: 'Main 1',
    [PHASE.BATTLE_START]: 'Battle',
    [PHASE.BATTLE_STEP]: 'Battle',
    [PHASE.DAMAGE]: 'Damage',
    [PHASE.DAMAGE_CAL]: 'Damage',
    [PHASE.BATTLE]: 'Battle',
    [PHASE.MAIN2]: 'Main 2',
    [PHASE.END]: 'End',
  };
  const updatePhaseUI = (phase: number) => {
    const phaseNameEl = document.getElementById('phase-name');
    if (phaseNameEl) {
      phaseNameEl.textContent = phaseNames[phase] ?? 'Main 1';
    }
  };

  const closePopover = () => {
    popover.classList.add('hidden');
    popover.innerHTML = '';
  };

  const closeAllPromptOverlays = () => {
    closePopover();
    extraPopover.classList.add('hidden');
    extraPopover.innerHTML = '';
    multiEffectModal.classList.add('hidden');
    battlePosModal.classList.add('hidden');
    zoneSelectBanner.classList.add('hidden');
    selectModal.classList.add('hidden');
    selectModal.classList.remove('minimized');
    promptModal.classList.add('hidden');
    selectedCardsForPrompt = [];
    board?.clearCardHighlights();
    board?.clearZoneHighlights();
    board?.setExtraDeckGlow(false);
  };

  const sendHumanResponse = async (responseBytes: Uint8Array) => {
    currentPrompt = null;
    updatePhaseButtons(false, false, false);
    closeAllPromptOverlays();
    audio.playSelect();
    runner?.respond(responseBytes);
    await stepUntilPrompt();
  };

  const stepDuel = async () => {
    if (!runner || runner.isEnded) return;
    try {
      await runner.step();
    } catch (e) {
      console.error('Error during duel step:', e);
    }
  };

  const stepUntilPrompt = async () => {
    if (!runner) return;
    while (!runner.isEnded && !runner.currentPrompt) {
      const res = await runner.step();
      if (res.awaitingHuman || runner.isEnded) break;
    }
  };

  // Toggle Minimize on Bottom-Center Card Selection Drawer
  document.getElementById('btn-minimize-select-modal')?.addEventListener('click', () => {
    selectModal.classList.toggle('minimized');
  });

  // Close Right-Side Extra Deck Drawer
  document.getElementById('btn-close-extra-drawer')?.addEventListener('click', () => {
    extraDrawer.classList.add('hidden');
  });

  /**
   * Opens the Right-Side Extra Deck (or Graveyard / Banished) Preview Drawer
   */
  const openExtraDeckPreviewDrawer = (player: number = 0, location: number = LOCATION.EXTRA) => {
    if (!runner) return;
    const cards = runner.queryLocationCards(player, location);
    const spSummonableCodes = new Set<number>();
    if (player === 0 && currentPrompt instanceof YGOProMsgSelectIdleCmd) {
      currentPrompt.spSummonableCards
        .filter((c: any) => c.location === location)
        .forEach((c: any) => spSummonableCodes.add(c.code));
    }

    extraDrawerTitle.textContent =
      location === LOCATION.EXTRA
        ? `Extra Deck (${cards.length})`
        : location === LOCATION.GRAVE
        ? `Graveyard (${cards.length})`
        : `Banished (${cards.length})`;

    extraDrawerList.innerHTML = cards
      .map((item) => {
        const isHidden = isCardHiddenForHuman(player, location, item.position);
        if (isHidden) {
          return `
            <div class="md-extra-drawer-item" data-code="0" data-hidden="1">
              ${renderHiddenFramedCardHTML('size-sm', location)}
              <div class="md-extra-drawer-item-info">
                <div class="md-extra-drawer-item-name">??? (Face-Down)</div>
              </div>
            </div>
          `;
        }
        const cData = cardDb.getCard(item.code);
        const canSp = spSummonableCodes.has(item.code);
        return `
          <div class="md-extra-drawer-item ${canSp ? 'can-summon' : ''}" data-code="${item.code}">
            ${renderFramedCardHTML(cData, item.code, { extraClass: `size-sm ${canSp ? 'md-glow-gold' : ''}` })}
            <div class="md-extra-drawer-item-info">
              <div class="md-extra-drawer-item-name">${cData?.name ?? `#${item.code}`}</div>
              ${canSp ? `<span class="md-extra-summon-tag">✨ Summonable</span>` : ''}
            </div>
          </div>
        `;
      })
      .join('');

    extraDrawerList.querySelectorAll<HTMLElement>('.md-extra-drawer-item').forEach((el) => {
      const isHidden = el.dataset.hidden === '1';
      const code = Number(el.dataset.code);
      el.addEventListener('mouseenter', () => {
        if (isHidden) {
          inspectHiddenCard(location);
        } else {
          inspectCard(cardDb.getCard(code), code);
        }
      });
      el.addEventListener('click', () => {
        if (isHidden) {
          inspectHiddenCard(location);
          return;
        }
        inspectCard(cardDb.getCard(code), code);
        if (player === 0 && currentPrompt instanceof YGOProMsgSelectIdleCmd && location === LOCATION.EXTRA) {
          const extraSp = currentPrompt.spSummonableCards
            .map((c: any, idx: number) => ({ ...c, spIdx: idx }))
            .filter((c: any) => c.location === LOCATION.EXTRA);
          if (extraSp.length > 0) {
            openExtraDeckSummonModal(currentPrompt, extraSp);
          }
        }
      });
    });

    extraDrawer.classList.remove('hidden');
  };

  /**
   * Opens the Bottom-Center Extra Deck Special Summon Modal
   */
  const openExtraDeckSummonModal = (
    msg: YGOProMsgSelectIdleCmd,
    extraSpCards: Array<{ code: number; controller: number; location: number; sequence: number; spIdx: number }>,
  ) => {
    let chosenSpIdx = extraSpCards[0]?.spIdx ?? 0;

    const titleEl = selectModal.querySelector('#card-select-title')!;
    titleEl.textContent = 'Special Summon from Extra Deck';

    const countBadge = selectModal.querySelector('#card-select-count')!;
    countBadge.textContent = `${extraSpCards.length} Available`;

    updateDrawerLocationTabs([LOCATION.EXTRA]);

    const listEl = selectModal.querySelector('#card-select-list')!;
    listEl.innerHTML = '';

    extraSpCards.forEach((c, idx) => {
      const cData = cardDb.getCard(c.code);
      const item = document.createElement('div');
      item.className = `select-card-badge md-drawer-card ${idx === 0 ? 'chosen' : ''}`;
      item.innerHTML = renderFramedCardHTML(cData, c.code, {
        extraClass: 'size-md',
        location: LOCATION.EXTRA,
      });
      item.addEventListener('mouseenter', () => {
        inspectCard(cData, c.code);
      });
      item.addEventListener('click', () => {
        chosenSpIdx = c.spIdx;
        inspectCard(cData, c.code);
        listEl.querySelectorAll('.md-drawer-card').forEach((el) => el.classList.remove('chosen'));
        item.classList.add('chosen');
      });
      listEl.appendChild(item);
    });

    if (extraSpCards[0]) {
      inspectCard(cardDb.getCard(extraSpCards[0].code), extraSpCards[0].code);
    }

    const cancelBtn = selectModal.querySelector('#btn-cancel-card-select') as HTMLElement;
    cancelBtn.style.display = 'inline-block';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => {
      selectModal.classList.add('hidden');
    };

    const confirmBtn = selectModal.querySelector('#btn-confirm-card-select') as HTMLButtonElement;
    confirmBtn.style.display = 'inline-block';
    confirmBtn.disabled = false;
    confirmBtn.style.opacity = '1';
    confirmBtn.textContent = 'Select';
    confirmBtn.onclick = () => {
      sendHumanResponse(msg.prepareResponse(IdleCmdType.SPSUMMON, IndexResponse(chosenSpIdx)));
    };

    selectModal.classList.remove('hidden');
  };

  /**
   * Opens the Multi-Effect Tabbed Modal
   */
  const openMultiEffectModal = (
    cardData: CardData | null,
    options: Array<{
      label: string;
      text: string;
      descCode?: number;
      cardData?: CardData | null;
      onConfirm: () => void;
    }>,
    cancelable = true,
  ) => {
    let activeIdx = 0;
    const titleEl = document.getElementById('multi-effect-title')!;
    const tabsEl = document.getElementById('multi-effect-tabs')!;
    const descEl = document.getElementById('multi-effect-desc')!;
    const cancelBtn = document.getElementById('btn-multi-effect-cancel') as HTMLButtonElement;
    const okBtn = document.getElementById('btn-multi-effect-ok') as HTMLButtonElement;

    const renderTabs = () => {
      tabsEl.innerHTML = options
        .map(
          (_opt, idx) =>
            `<button class="md-effect-tab-btn ${idx === activeIdx ? 'active' : ''}" data-idx="${idx}">${idx + 1}</button>`,
        )
        .join('');

      tabsEl.querySelectorAll<HTMLButtonElement>('.md-effect-tab-btn').forEach((btn) => {
        btn.onclick = () => {
          activeIdx = Number(btn.dataset.idx);
          renderTabs();
        };
      });

      const currentOpt = options[activeIdx];
      const currentCard = currentOpt?.cardData ?? cardData;

      titleEl.textContent = currentCard
        ? `Which effect of "${currentCard.name}" do you want to use?`
        : 'Which effect do you want to use?';

      descEl.textContent = currentOpt?.text || 'Activate this effect.';
      if (currentCard) {
        inspectCard(currentCard, currentCard.id, {
          descCode: currentOpt?.descCode,
          activeEffectIndex: activeIdx,
          activeEffectText: currentOpt?.text,
          highlightActivatable: true,
        });
      }
    };

    renderTabs();

    cancelBtn.style.display = cancelable ? 'inline-block' : 'none';
    cancelBtn.onclick = () => {
      multiEffectModal.classList.add('hidden');
    };

    okBtn.onclick = () => {
      multiEffectModal.classList.add('hidden');
      options[activeIdx]?.onConfirm();
    };

    multiEffectModal.classList.remove('hidden');
  };

  /**
   * Updates the location tabs on the Bottom-Center Card Selection Drawer
   */
  const updateDrawerLocationTabs = (locations: number[]) => {
    const hasLoc = (mask: number) => locations.some((l) => (l & mask) !== 0);
    document.querySelectorAll<HTMLElement>('#card-select-loc-tabs .md-loc-tab').forEach((tab) => {
      const mask = Number(tab.dataset.loc);
      tab.classList.toggle('active', hasLoc(mask));
    });
  };

  /**
   * Renders a visual toast in #card-move-feed whenever a card moves between zones
   */
  const showCardMoveToast = (code: number, from: CardLocation, to: CardLocation) => {
    if (from.location === to.location) return;
    if (from.location === 0 || to.location === 0) return;

    const fromInfo = formatLocationLabel(from.location);
    const toInfo = formatLocationLabel(to.location);
    const cData = code > 0 ? cardDb.getCard(code) : null;
    const cardName = cData?.name ?? 'Card';
    const artSrc = code > 0 ? `/pics/${code}.jpg` : '/texture/DefaultProtector.png';
    const playerBadge = to.controller === 0 ? 'YOU' : 'OPP';

    const toast = document.createElement('div');
    toast.className = `md-move-toast ${to.controller === 0 ? 'p0' : 'p1'} to-${toInfo.cls}`;
    toast.innerHTML = `
      <img src="${artSrc}" class="md-move-toast-art" onerror="this.src='/texture/DefaultProtector.png'" />
      <div class="md-move-toast-info">
        <div class="md-move-toast-header">
          <span class="md-move-player-tag ${to.controller === 0 ? 'p0' : 'p1'}">${playerBadge}</span>
          <span class="md-move-card-name">${cardName}</span>
        </div>
        <div class="md-move-route">
          <span class="md-loc-pill ${fromInfo.cls}">${fromInfo.name}</span>
          <span class="md-move-arrow">➔</span>
          <span class="md-loc-pill ${toInfo.cls}">${toInfo.name}</span>
        </div>
      </div>
    `;

    cardMoveFeed.appendChild(toast);

    while (cardMoveFeed.children.length > 4) {
      cardMoveFeed.firstElementChild?.remove();
    }

    window.setTimeout(() => {
      toast.classList.add('fade-out');
      window.setTimeout(() => toast.remove(), 350);
    }, 2400);
  };

  /**
   * Renders the Chain Formation & Resolution Visual Overlay
   */
  const renderChainOverlay = (bannerText: string, bannerMode: 'start' | 'link' | 'solving' | 'end', holdMs = 1750) => {
    const visibleLinks = activeChainLinks.slice(-4);

    chainOverlay.innerHTML = `
      <div class="md-chain-status-banner mode-${bannerMode}">${bannerText}</div>
      <div class="md-chain-stage">
        ${visibleLinks
          .map((link) => {
            const cData = cardDb.getCard(link.code);
            const stateCls =
              link.status === 'solving' ? 'resolving' : link.status === 'solved' ? 'resolved' : '';
            return `
              <div class="md-chain-card-node ${link.player === 0 ? 'p0' : 'p1'} ${stateCls}">
                <div class="md-chain-links-bg"></div>
                <div class="md-chain-framed-wrap">
                  ${renderFramedCardHTML(cData, link.code, { extraClass: 'size-md' })}
                </div>
                <div class="md-chain-number">${link.chainCount}</div>
              </div>
            `;
          })
          .join('<div class="md-chain-connector">⚡</div>')}
      </div>
    `;
    chainOverlay.classList.remove('hidden');

    if (chainHideTimeout) {
      clearTimeout(chainHideTimeout);
    }
    chainHideTimeout = window.setTimeout(() => {
      chainOverlay.classList.add('hidden');
      if (bannerMode === 'end') {
        activeChainLinks = [];
      }
    }, holdMs);
  };

  const handleChainActivated = (chainCount: number, code: number, player: number) => {
    const existingIdx = activeChainLinks.findIndex((c) => c.chainCount === chainCount);
    if (existingIdx !== -1) {
      activeChainLinks = activeChainLinks.slice(0, existingIdx);
    }
    activeChainLinks.push({ chainCount, code, player, status: 'pending' });
    const banner =
      chainCount <= 1 ? '⚡ CHAIN START — LINK 1' : `⚡ CHAIN BUILDING — LINK ${chainCount}`;
    renderChainOverlay(banner, chainCount <= 1 ? 'start' : 'link', 1750);
  };

  const handleChainSolving = (chainCount: number) => {
    for (const link of activeChainLinks) {
      if (link.chainCount === chainCount) {
        link.status = 'solving';
        const cData = cardDb.getCard(link.code);
        if (cData) {
          activeEffectCard = cData;
          inspectCard(cData, link.code, { highlightActivatable: true });
        }
      } else if (link.chainCount > chainCount) {
        link.status = 'solved';
      }
    }
    renderChainOverlay(`✨ RESOLVING CHAIN LINK ${chainCount}`, 'solving', 1600);
  };

  const handleChainSolved = (chainCount: number) => {
    const link = activeChainLinks.find((c) => c.chainCount === chainCount);
    if (link) link.status = 'solved';
  };

  const handleChainEnd = () => {
    if (activeChainLinks.length > 0) {
      activeChainLinks.forEach((l) => (l.status = 'solved'));
      renderChainOverlay('✓ CHAIN RESOLVED', 'end', 950);
    } else {
      chainOverlay.classList.add('hidden');
    }
  };

  // 7. Interactive 3D Card Click Handling
  const handleCardClick = (card: CardMesh) => {
    audio.playHover();
    if (card.isFaceHidden() || isCardHiddenForHuman(card.controller, card.location, card.position)) {
      inspectHiddenCard(card.location);
    } else if (card.cardData) {
      inspectCard(card.cardData, card.code);
    }

    if (!currentPrompt) return;

    // A. If IdleCmd is pending, show circular Master Duel action buttons directly over the card
    if (currentPrompt instanceof YGOProMsgSelectIdleCmd) {
      const msg = currentPrompt;
      const actions: Array<{ label: string; icon: string; cls: string; onClick: () => void }> = [];

      const matchesCard = (c: any) =>
        c.location === card.location && (c.sequence === card.sequence || (card.code > 0 && c.code === card.code));

      // Summonable (Normal Summon)
      const sumIdx = msg.summonableCards.findIndex(matchesCard);
      if (sumIdx !== -1) {
        actions.push({
          label: 'Normal Summon',
          icon: '/texture/GUI_T_DuelButtonActIcon04_1.png',
          cls: 'summon',
          onClick: () => sendHumanResponse(msg.prepareResponse(IdleCmdType.SUMMON, IndexResponse(sumIdx))),
        });
      }

      // SpSummonable (Special Summon)
      const spIndices = msg.spSummonableCards
        .map((c: any, idx: number) => ({ ...c, spIdx: idx }))
        .filter(matchesCard);
      if (spIndices.length > 0) {
        actions.push({
          label: 'Special Summon',
          icon: '/texture/GUI_T_DuelButtonActIcon03_1.png',
          cls: 'spsummon',
          onClick: () => sendHumanResponse(msg.prepareResponse(IdleCmdType.SPSUMMON, IndexResponse(spIndices[0].spIdx))),
        });
      }

      // Activatable (Single or Multi-Effect!)
      const actMatches = msg.activatableCards
        .map((c: any, idx: number) => ({ ...c, actIdx: idx }))
        .filter(matchesCard);

      if (actMatches.length > 0) {
        inspectCard(card.cardData, card.code, {
          descCode: actMatches[0].desc,
          highlightActivatable: true,
        });

        actions.push({
          label: 'Activate Effect',
          icon: '/texture/GUI_T_DuelButtonActIcon04_1.png',
          cls: 'activate',
          onClick: () => {
            if (actMatches.length === 1) {
              activeEffectCard = cardDb.getCard(actMatches[0].code) ?? card.cardData;
              sendHumanResponse(msg.prepareResponse(IdleCmdType.ACTIVATE, IndexResponse(actMatches[0].actIdx)));
            } else {
              closePopover();
              openMultiEffectModal(
                card.cardData,
                actMatches.map((m: any, i: number) => {
                  const ownerCard =
                    resolveCardFromDescriptions([m.desc], cardDb.getCard(m.code) ?? card.cardData, cardDb) ??
                    card.cardData;
                  const extracted = extractCardEffectOptions(ownerCard, [m.desc], cardDb);
                  return {
                    label: `${i + 1}`,
                    text: extracted[0] || `Activate effect #${i + 1}`,
                    descCode: m.desc,
                    cardData: ownerCard,
                    onConfirm: () => {
                      activeEffectCard = ownerCard;
                      sendHumanResponse(msg.prepareResponse(IdleCmdType.ACTIVATE, IndexResponse(m.actIdx)));
                    },
                  };
                }),
                true,
              );
            }
          },
        });
      }

      // SSetable (Spell / Trap Set)
      const ssetIdx = msg.ssetableCards.findIndex(matchesCard);
      if (ssetIdx !== -1) {
        actions.push({
          label: 'Set',
          icon: '/texture/GUI_T_DuelButtonActIcon05_1.png',
          cls: 'set',
          onClick: () => sendHumanResponse(msg.prepareResponse(IdleCmdType.SSET, IndexResponse(ssetIdx))),
        });
      }

      // MSetable (Monster Set face-down)
      const msetIdx = msg.msetableCards.findIndex(matchesCard);
      if (msetIdx !== -1) {
        actions.push({
          label: 'Set (DEF)',
          icon: '/texture/GUI_T_DuelButtonActIcon07_1.png',
          cls: 'set',
          onClick: () => sendHumanResponse(msg.prepareResponse(IdleCmdType.MSET, IndexResponse(msetIdx))),
        });
      }

      // Reposable (Position Change)
      const reposIdx = msg.reposableCards.findIndex(matchesCard);
      if (reposIdx !== -1) {
        const isDef = card.position === POS.FACEUP_DEFENSE || card.position === POS.FACEDOWN_DEFENSE;
        actions.push({
          label: isDef ? 'Attack Position' : 'Defense Position',
          icon: isDef ? '/texture/GUI_T_DuelButtonActIcon08_1.png' : '/texture/GUI_T_DuelButtonActIcon09_1.png',
          cls: 'repos',
          onClick: () => sendHumanResponse(msg.prepareResponse(IdleCmdType.REPOS, IndexResponse(reposIdx))),
        });
      }

      if (actions.length > 0) {
        board?.clearCardHighlights();
        card.setSelected(true);

        const screenPos = board!.getScreenPosition(card);
        popover.style.left = `${screenPos.x}px`;
        popover.style.top = `${screenPos.y - 68}px`;
        popover.innerHTML = '';

        actions.forEach((act) => {
          const wrap = document.createElement('div');
          wrap.className = 'md-action-btn-wrap';
          wrap.title = act.label;

          const btn = document.createElement('button');
          btn.className = `md-action-circle-btn ${act.cls}`;
          const img = document.createElement('img');
          img.src = act.icon;
          img.alt = act.label;
          btn.appendChild(img);

          const lbl = document.createElement('span');
          lbl.className = 'md-action-label';
          lbl.textContent = act.label;

          wrap.appendChild(btn);
          wrap.appendChild(lbl);
          wrap.onclick = (e) => {
            e.stopPropagation();
            act.onClick();
          };
          popover.appendChild(wrap);
        });

        popover.classList.remove('hidden');
        return;
      }
    }

    // B. If BattleCmd is pending, check if card can attack or activate effect
    if (currentPrompt instanceof YGOProMsgSelectBattleCmd) {
      const msg = currentPrompt;
      const matchesCard = (c: any) =>
        c.location === card.location && (c.sequence === card.sequence || (card.code > 0 && c.code === card.code));

      const atkIdx = msg.attackableCards.findIndex(matchesCard);
      const actIdx = msg.activatableCards?.findIndex(matchesCard) ?? -1;

      if (atkIdx !== -1 || actIdx !== -1) {
        board?.clearCardHighlights();
        card.setSelected(true);

        const screenPos = board!.getScreenPosition(card);
        popover.style.left = `${screenPos.x}px`;
        popover.style.top = `${screenPos.y - 68}px`;
        popover.innerHTML = '';

        if (atkIdx !== -1) {
          const wrap = document.createElement('div');
          wrap.className = 'md-action-btn-wrap';
          const atkBtn = document.createElement('button');
          atkBtn.className = 'md-action-circle-btn attack';
          atkBtn.innerHTML = `<img src="/texture/GUI_T_DuelButtonActIcon01_1.png" alt="Attack" />`;
          const atkLbl = document.createElement('span');
          atkLbl.className = 'md-action-label';
          atkLbl.textContent = 'Attack';
          wrap.appendChild(atkBtn);
          wrap.appendChild(atkLbl);
          wrap.onclick = (e) => {
            e.stopPropagation();
            sendHumanResponse(msg.prepareResponse(BattleCmdType.ATTACK, IndexResponse(atkIdx)));
          };
          popover.appendChild(wrap);
        }

        if (actIdx !== -1) {
          const wrap = document.createElement('div');
          wrap.className = 'md-action-btn-wrap';
          const actBtn = document.createElement('button');
          actBtn.className = 'md-action-circle-btn activate';
          actBtn.innerHTML = `<img src="/texture/GUI_T_DuelButtonActIcon04_1.png" alt="Activate" />`;
          const actLbl = document.createElement('span');
          actLbl.className = 'md-action-label';
          actLbl.textContent = 'Activate Effect';
          wrap.appendChild(actBtn);
          wrap.appendChild(actLbl);
          wrap.onclick = (e) => {
            e.stopPropagation();
            activeEffectCard = card.cardData;
            sendHumanResponse(msg.prepareResponse(BattleCmdType.ACTIVATE, IndexResponse(actIdx)));
          };
          popover.appendChild(wrap);
        }

        popover.classList.remove('hidden');
        return;
      }
    }

    // C. If SelectUnselectCard is pending
    if (currentPrompt instanceof YGOProMsgSelectUnselectCard) {
      const msg = currentPrompt;
      const selIdx = msg.selectableCards.findIndex(
        (c: any) => c.controller === card.controller && c.location === card.location && c.sequence === card.sequence,
      );
      if (selIdx !== -1) {
        sendHumanResponse(msg.prepareResponse(IndexResponse(selIdx)));
        return;
      }
      const unselIdx = msg.unselectableCards.findIndex(
        (c: any) => c.controller === card.controller && c.location === card.location && c.sequence === card.sequence,
      );
      if (unselIdx !== -1) {
        sendHumanResponse(msg.prepareResponse(IndexResponse(msg.selectableCount + unselIdx)));
        return;
      }
      return;
    }

    // D. If SelectCard / SelectTribute / SelectSum is pending, toggle card selection
    if (
      currentPrompt instanceof YGOProMsgSelectCard ||
      currentPrompt instanceof YGOProMsgSelectTribute ||
      currentPrompt instanceof YGOProMsgSelectSum
    ) {
      toggleCardSelection(card);
    }
  };

  const toggleCardSelection = (cardOrIndex: CardMesh | number) => {
    let index = -1;
    let cardMesh: CardMesh | undefined;
    let code = 0;

    if (typeof cardOrIndex === 'number') {
      index = cardOrIndex;
      const cardInfo = (currentPrompt.cards ?? currentPrompt.selectableCards)?.[index];
      code = cardInfo?.code ?? 0;
      cardMesh = board?.findCard(cardInfo?.controller ?? 0, cardInfo?.location ?? 0, cardInfo?.sequence ?? 0);
    } else {
      cardMesh = cardOrIndex;
      code = cardMesh.code;
      const cardsList = currentPrompt.cards ?? currentPrompt.selectableCards ?? [];
      index = cardsList.findIndex(
        (c: any) => c.location === cardMesh!.location && c.sequence === cardMesh!.sequence,
      );
    }

    if (index === -1) return;

    const existingIdx = selectedCardsForPrompt.findIndex((s) => s.index === index);
    if (existingIdx !== -1) {
      selectedCardsForPrompt.splice(existingIdx, 1);
      cardMesh?.setSelected(false);
    } else {
      const max = currentPrompt.max ?? 1;
      if (selectedCardsForPrompt.length >= max) {
        if (max === 1) {
          selectedCardsForPrompt[0]?.cardMesh?.setSelected(false);
          selectedCardsForPrompt = [];
        } else {
          return;
        }
      }
      selectedCardsForPrompt.push({ index, code, cardMesh });
      cardMesh?.setSelected(true);
    }

    updateSelectionUI();
  };

  const updateSelectionUI = () => {
    const min = currentPrompt?.min ?? 1;
    const max = currentPrompt?.max ?? 1;
    const countBadge = selectModal.querySelector('#card-select-count')!;
    const confirmBtn = selectModal.querySelector('#btn-confirm-card-select') as HTMLButtonElement;

    countBadge.textContent = `${selectedCardsForPrompt.length} / ${min === max ? min : `${min}-${max}`} Selected`;

    const isValid = selectedCardsForPrompt.length >= min && selectedCardsForPrompt.length <= max;
    confirmBtn.disabled = !isValid;
    confirmBtn.style.opacity = isValid ? '1' : '0.5';

    selectModal.querySelectorAll('.md-drawer-card').forEach((el) => {
      const idx = Number(el.getAttribute('data-idx'));
      el.classList.toggle('chosen', selectedCardsForPrompt.some((s) => s.index === idx));
    });
  };

  // 8. Master Duel Prompt UI Handler
  const showPromptUI = (msg: any) => {
    currentPrompt = msg;
    closeAllPromptOverlays();
    promptOptions.innerHTML = '';

    // Prompt A: SelectIdleCmd (Main Phase 1 / 2)
    if (msg instanceof YGOProMsgSelectIdleCmd) {
      const highlightCard = (c: any) => {
        let card = board?.findCard(c.controller, c.location, c.sequence);
        if (!card && c.code > 0) {
          card = board
            ?.getCards()
            .find((m) => m.controller === c.controller && m.location === c.location && m.code === c.code);
        }
        card?.setSelectable(true);
      };

      msg.summonableCards.forEach(highlightCard);
      msg.spSummonableCards.forEach(highlightCard);
      msg.activatableCards.forEach(highlightCard);
      msg.ssetableCards.forEach(highlightCard);
      msg.msetableCards.forEach(highlightCard);
      msg.reposableCards?.forEach(highlightCard);

      // Check if Extra Deck Special Summon is available
      const extraSpCards = msg.spSummonableCards
        .map((c: any, idx: number) => ({ ...c, spIdx: idx }))
        .filter((c: any) => c.location === LOCATION.EXTRA);

      if (extraSpCards.length > 0 && board) {
        board.setExtraDeckGlow(true);
        const extraPos = board.getExtraDeckScreenPosition(0);
        extraPopover.style.left = `${extraPos.x}px`;
        extraPopover.style.top = `${extraPos.y - 54}px`;
        extraPopover.innerHTML = `
          <div class="md-action-btn-wrap" title="Special Summon from Extra Deck">
            <button class="md-action-circle-btn spsummon">
              <img src="/texture/GUI_T_DuelButtonActIcon03_1.png" alt="Special Summon" />
            </button>
            <span class="md-action-label">Special Summon</span>
          </div>
        `;
        extraPopover.onclick = (e) => {
          e.stopPropagation();
          openExtraDeckSummonModal(msg, extraSpCards);
        };
        extraPopover.classList.remove('hidden');
      }

      // Check if Graveyard / Banished has activatable effects
      const gyActivatable = msg.activatableCards
        .map((c: any, idx: number) => ({ ...c, actIdx: idx }))
        .filter((c: any) => (c.location & (LOCATION.GRAVE | LOCATION.REMOVED | LOCATION.EXTRA)) !== 0);

      if (gyActivatable.length > 0 && extraSpCards.length === 0 && board) {
        const gyPos = board.getExtraDeckScreenPosition(0);
        extraPopover.style.left = `${window.innerWidth - 180}px`;
        extraPopover.style.top = `${gyPos.y - 60}px`;
        extraPopover.innerHTML = `
          <div class="md-action-btn-wrap" title="Activate Effect from GY / Banished">
            <button class="md-action-circle-btn activate">
              <img src="/texture/GUI_T_DuelButtonActIcon04_1.png" alt="Activate Effect" />
            </button>
            <span class="md-action-label">Effect (GY/Ban)</span>
          </div>
        `;
        extraPopover.onclick = (e) => {
          e.stopPropagation();
          openGyActivatableDrawer(msg, gyActivatable);
        };
        extraPopover.classList.remove('hidden');
      }

      updatePhaseButtons(Boolean(msg.canBp), false, Boolean(msg.canEp));
      return;
    }

    // Prompt B: SelectBattleCmd
    if (msg instanceof YGOProMsgSelectBattleCmd) {
      msg.attackableCards.forEach((c: any) => {
        let card = board?.findCard(c.controller, c.location, c.sequence);
        if (!card && c.code > 0) {
          card = board
            ?.getCards()
            .find((m) => m.controller === c.controller && m.location === c.location && m.code === c.code);
        }
        card?.setSelectable(true, 0xff2244);
      });

      msg.activatableCards?.forEach((c: any) => {
        const card = board?.findCard(c.controller, c.location, c.sequence);
        card?.setSelectable(true, 0x00e5ff);
      });

      updatePhaseButtons(false, Boolean(msg.canM2), Boolean(msg.canEp));
      return;
    }

    updatePhaseButtons(false, false, false);

    // Prompt C: SelectEffectYn (Optional Trigger Effect)
    if (msg instanceof YGOProMsgSelectEffectYn) {
      const code = (msg as any).code ?? 0;
      const desc = (msg as any).desc ?? 0;
      const loc = (msg as any).location ?? LOCATION.MZONE;
      const cData = cardDb.getCard(code);
      if (cData) activeEffectCard = cData;

      inspectCard(cData, code, { descCode: desc, highlightActivatable: true });
      updateDrawerLocationTabs([loc]);

      const titleEl = selectModal.querySelector('#card-select-title')!;
      titleEl.textContent = 'Activate Optional Effect?';

      const countBadge = selectModal.querySelector('#card-select-count')!;
      countBadge.textContent = cData?.name ?? `Card #${code}`;

      const listEl = selectModal.querySelector('#card-select-list')!;
      listEl.innerHTML = '';

      const item = document.createElement('div');
      item.className = 'select-card-badge md-drawer-card chosen';
      item.innerHTML = renderFramedCardHTML(cData, code, {
        extraClass: 'size-md',
        location: loc,
      });
      item.addEventListener('mouseenter', () => {
        inspectCard(cData, code, { descCode: desc, highlightActivatable: true });
      });
      listEl.appendChild(item);

      const cancelBtn = selectModal.querySelector('#btn-cancel-card-select') as HTMLElement;
      cancelBtn.style.display = 'inline-block';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.onclick = () => sendHumanResponse(msg.prepareResponse(false));

      const confirmBtn = selectModal.querySelector('#btn-confirm-card-select') as HTMLButtonElement;
      confirmBtn.style.display = 'inline-block';
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = '1';
      confirmBtn.textContent = 'Activate';
      confirmBtn.onclick = () => {
        if (cData) activeEffectCard = cData;
        sendHumanResponse(msg.prepareResponse(true));
      };

      selectModal.classList.remove('hidden');
      return;
    }

    // Prompt D: SelectChain (Optional Chain / Multiple Trigger Effects)
    if (msg instanceof YGOProMsgSelectChain) {
      let chosenChainIdx = 0;
      const locs = msg.chains.map((c: any) => c.location ?? LOCATION.MZONE);
      updateDrawerLocationTabs(locs);

      const titleEl = selectModal.querySelector('#card-select-title')!;
      titleEl.textContent = 'Select an Optional Effect (Chain)';

      const countBadge = selectModal.querySelector('#card-select-count')!;
      countBadge.textContent = `${msg.chains.length} Available`;

      const listEl = selectModal.querySelector('#card-select-list')!;
      listEl.innerHTML = '';

      msg.chains.forEach((c: any, idx: number) => {
        const cData = cardDb.getCard(c.code);
        const item = document.createElement('div');
        item.className = `select-card-badge md-drawer-card ${idx === 0 ? 'chosen' : ''}`;
        item.innerHTML = renderFramedCardHTML(cData, c.code, {
          extraClass: 'size-md',
          location: c.location ?? 0,
        });
        item.addEventListener('mouseenter', () => {
          inspectCard(cData, c.code, { descCode: c.desc, highlightActivatable: true });
        });
        item.addEventListener('click', () => {
          chosenChainIdx = idx;
          inspectCard(cData, c.code, { descCode: c.desc, highlightActivatable: true });
          listEl.querySelectorAll('.md-drawer-card').forEach((el) => el.classList.remove('chosen'));
          item.classList.add('chosen');
        });
        listEl.appendChild(item);
      });

      if (msg.chains[0]) {
        const first = msg.chains[0];
        inspectCard(cardDb.getCard(first.code), first.code, {
          descCode: first.desc,
          highlightActivatable: true,
        });
      }

      const cancelBtn = selectModal.querySelector('#btn-cancel-card-select') as HTMLElement;
      cancelBtn.style.display = 'inline-block';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.onclick = () => sendHumanResponse(msg.prepareResponse(null));

      const confirmBtn = selectModal.querySelector('#btn-confirm-card-select') as HTMLButtonElement;
      confirmBtn.style.display = 'inline-block';
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = '1';
      confirmBtn.textContent = 'Select';
      confirmBtn.onclick = () => {
        const chosen = msg.chains[chosenChainIdx];
        if (chosen) {
          activeEffectCard = cardDb.getCard(chosen.code);
        }
        sendHumanResponse(msg.prepareResponse(IndexResponse(chosenChainIdx)));
      };

      selectModal.classList.remove('hidden');
      return;
    }

    // Prompt E: SelectOption (Multiple Effect / Action Options)
    // Uses activeEffectCard + encoded card ID from msg.options so target cards clicked in SelectCard never overwrite the owner card!
    if (msg instanceof YGOProMsgSelectOption) {
      const ownerCard = resolveCardFromDescriptions(
        msg.options,
        activeEffectCard ?? lastInspectedCard,
        cardDb,
      );
      const effectTexts = extractCardEffectOptions(ownerCard, msg.options, cardDb);
      openMultiEffectModal(
        ownerCard,
        msg.options.map((optCode: number, idx: number) => {
          const optCard = resolveCardFromDescriptions([optCode], ownerCard, cardDb);
          return {
            label: `${idx + 1}`,
            text: effectTexts[idx] || cardDb.getSystemString(optCode) || `Option #${idx + 1}`,
            descCode: optCode,
            cardData: optCard,
            onConfirm: () => sendHumanResponse(msg.prepareResponse(IndexResponse(idx))),
          };
        }),
        false,
      );
      return;
    }

    // Prompt F: SelectPosition
    if (msg instanceof YGOProMsgSelectPosition) {
      const cData = cardDb.getCard(msg.code) ?? lastInspectedCard;
      const btnsEl = document.getElementById('battle-pos-buttons')!;
      btnsEl.innerHTML = '';

      const addPosBtn = (posFlag: number, label: string, isDefense: boolean) => {
        const btn = document.createElement('button');
        btn.className = 'md-battle-pos-circle';
        btn.innerHTML = `
          <div class="md-pos-card-icon ${isDefense ? 'defense-rot' : ''}">
            ${renderFramedCardHTML(cData, msg.code, { extraClass: 'size-sm', showRarity: false })}
          </div>
          <span class="md-battle-pos-label">${label}</span>
        `;
        btn.onclick = () => sendHumanResponse(msg.prepareResponse(posFlag));
        btnsEl.appendChild(btn);
      };

      if (msg.positions & POS.FACEUP_ATTACK) {
        addPosBtn(POS.FACEUP_ATTACK, 'Face-Up\nAttack Position', false);
      }
      if (msg.positions & POS.FACEUP_DEFENSE) {
        addPosBtn(POS.FACEUP_DEFENSE, 'Face-Up\nDefense Position', true);
      }
      if (msg.positions & POS.FACEDOWN_DEFENSE) {
        addPosBtn(POS.FACEDOWN_DEFENSE, 'Face-Down\nDefense Position', true);
      }
      if (msg.positions & POS.FACEDOWN_ATTACK) {
        addPosBtn(POS.FACEDOWN_ATTACK, 'Face-Down\nAttack Position', false);
      }

      battlePosModal.classList.remove('hidden');
      return;
    }

    // Prompt G: SelectPlace
    if (msg instanceof YGOProMsgSelectPlace) {
      const places = msg.getSelectablePlaces();
      const cardName = (activeEffectCard ?? lastInspectedCard)?.name ?? 'Card';
      zoneSelectText.textContent = `Select the zone for "${cardName}".`;
      zoneSelectBanner.classList.remove('hidden');

      board?.highlightSelectableZones(places);
      return;
    }

    // Prompt H: Interactive Material / Fusion Resolution (SelectUnselectCard)
    if (msg instanceof YGOProMsgSelectUnselectCard) {
      selectedCardsForPrompt = [];
      let highlightedIdx: { isUnselect: boolean; idx: number } | null = null;

      const allLocs = [
        ...msg.unselectableCards.map((c: any) => c.location ?? 0),
        ...msg.selectableCards.map((c: any) => c.location ?? 0),
      ];
      updateDrawerLocationTabs(allLocs);

      const titleEl = selectModal.querySelector('#card-select-title')!;
      titleEl.textContent = msg.finishable
        ? 'Confirm Materials or Select More'
        : 'Select Card / Material for Effect';

      const countBadge = selectModal.querySelector('#card-select-count')!;
      countBadge.textContent = `${msg.unselectableCount} Selected`;

      const listEl = selectModal.querySelector('#card-select-list')!;
      listEl.innerHTML = '';

      msg.unselectableCards.forEach((c: any, idx: number) => {
        const mesh = board?.findCard(c.controller, c.location, c.sequence);
        mesh?.setSelectable(true, 0xffcc00);
        const isHidden =
          c.code === 0 ||
          Boolean(mesh?.isFaceHidden()) ||
          isCardHiddenForHuman(c.controller ?? 0, c.location ?? 0, c.position ?? mesh?.position ?? 0);
        const cData = isHidden ? null : cardDb.getCard(c.code);

        const item = document.createElement('div');
        item.className = 'select-card-badge md-drawer-card chosen-material';
        item.innerHTML = isHidden
          ? renderHiddenFramedCardHTML('size-md', c.location ?? 0)
          : renderFramedCardHTML(cData, c.code, {
              extraClass: 'size-md',
              location: c.location ?? 0,
            });
        item.addEventListener('mouseenter', () => {
          if (isHidden) inspectHiddenCard(c.location ?? 0);
          else inspectCard(cData, c.code);
        });
        item.onclick = () => {
          sendHumanResponse(msg.prepareResponse(IndexResponse(msg.selectableCount + idx)));
        };
        listEl.appendChild(item);
      });

      msg.selectableCards.forEach((c: any, idx: number) => {
        const mesh = board?.findCard(c.controller, c.location, c.sequence);
        mesh?.setSelectable(true, 0x00e5ff);
        const isHidden =
          c.code === 0 ||
          Boolean(mesh?.isFaceHidden()) ||
          isCardHiddenForHuman(c.controller ?? 0, c.location ?? 0, c.position ?? mesh?.position ?? 0);
        const cData = isHidden ? null : cardDb.getCard(c.code);

        const item = document.createElement('div');
        item.className = `select-card-badge md-drawer-card candidate ${idx === 0 ? 'chosen' : ''}`;
        item.innerHTML = isHidden
          ? renderHiddenFramedCardHTML('size-md', c.location ?? 0)
          : renderFramedCardHTML(cData, c.code, {
              extraClass: 'size-md',
              location: c.location ?? 0,
            });
        item.addEventListener('mouseenter', () => {
          if (isHidden) inspectHiddenCard(c.location ?? 0);
          else inspectCard(cData, c.code);
        });
        item.onclick = () => {
          highlightedIdx = { isUnselect: false, idx };
          if (isHidden) inspectHiddenCard(c.location ?? 0);
          else inspectCard(cData, c.code);
          listEl.querySelectorAll('.md-drawer-card.candidate').forEach((el) => el.classList.remove('chosen'));
          item.classList.add('chosen');
          sendHumanResponse(msg.prepareResponse(IndexResponse(idx)));
        };
        listEl.appendChild(item);
      });

      if (msg.selectableCards[0]) {
        const first: any = msg.selectableCards[0];
        const firstMesh = board?.findCard(first.controller, first.location, first.sequence);
        const firstHidden =
          first.code === 0 ||
          Boolean(firstMesh?.isFaceHidden()) ||
          isCardHiddenForHuman(first.controller ?? 0, first.location ?? 0, first.position ?? firstMesh?.position ?? 0);
        highlightedIdx = { isUnselect: false, idx: 0 };
        if (firstHidden) inspectHiddenCard(first.location ?? 0);
        else inspectCard(cardDb.getCard(first.code), first.code);
      }

      const cancelBtn = selectModal.querySelector('#btn-cancel-card-select') as HTMLElement;
      if (msg.cancelable || msg.finishable) {
        cancelBtn.style.display = 'inline-block';
        cancelBtn.textContent = msg.finishable ? 'Finish Selection' : 'Cancel';
        cancelBtn.onclick = () => sendHumanResponse(msg.prepareResponse(null));
      } else {
        cancelBtn.style.display = 'none';
      }

      const confirmBtn = selectModal.querySelector('#btn-confirm-card-select') as HTMLButtonElement;
      confirmBtn.style.display = 'inline-block';
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = '1';
      confirmBtn.textContent = 'Select';
      confirmBtn.onclick = () => {
        if (highlightedIdx && !highlightedIdx.isUnselect) {
          sendHumanResponse(msg.prepareResponse(IndexResponse(highlightedIdx.idx)));
        } else if (msg.finishable) {
          sendHumanResponse(msg.prepareResponse(null));
        }
      };

      selectModal.classList.remove('hidden');
      return;
    }

    // Prompt I: Interactive Multi-Card Selection (SelectCard, SelectTribute, SelectSum)
    if (
      msg instanceof YGOProMsgSelectCard ||
      msg instanceof YGOProMsgSelectTribute ||
      msg instanceof YGOProMsgSelectSum
    ) {
      selectedCardsForPrompt = [];

      const rawCards = msg.cards ?? [];
      updateDrawerLocationTabs(rawCards.map((c: any) => c.location ?? 0));

      const title =
        msg instanceof YGOProMsgSelectTribute
          ? 'Select Tribute(s)'
          : msg instanceof YGOProMsgSelectSum
          ? 'Select Materials'
          : `Select Card(s) for Effect (${msg.min === msg.max ? msg.min : `${msg.min} - ${msg.max}`})`;

      const titleEl = selectModal.querySelector('#card-select-title')!;
      titleEl.textContent = title;

      const listEl = selectModal.querySelector('#card-select-list')!;
      listEl.innerHTML = '';

      rawCards.forEach((c: any, idx: number) => {
        const mesh = board?.findCard(c.controller, c.location, c.sequence);
        mesh?.setSelectable(true);
        const isHidden =
          c.code === 0 ||
          Boolean(mesh?.isFaceHidden()) ||
          isCardHiddenForHuman(c.controller ?? 0, c.location ?? 0, c.position ?? mesh?.position ?? 0);
        const cData = isHidden ? null : cardDb.getCard(c.code);

        const cardItem = document.createElement('div');
        cardItem.className = 'select-card-badge md-drawer-card';
        cardItem.setAttribute('data-idx', String(idx));
        cardItem.innerHTML = isHidden
          ? renderHiddenFramedCardHTML('size-md', c.location ?? 0)
          : renderFramedCardHTML(cData, c.code, {
              extraClass: 'size-md',
              location: c.location ?? 0,
            });

        cardItem.addEventListener('mouseenter', () => {
          if (isHidden) inspectHiddenCard(c.location ?? 0);
          else inspectCard(cData, c.code);
        });
        cardItem.onclick = () => {
          if (isHidden) inspectHiddenCard(c.location ?? 0);
          else inspectCard(cData, c.code);
          toggleCardSelection(idx);
        };
        listEl.appendChild(cardItem);
      });

      if (rawCards[0]) {
        const first: any = rawCards[0];
        const firstMesh = board?.findCard(first.controller, first.location, first.sequence);
        const firstHidden =
          first.code === 0 ||
          Boolean(firstMesh?.isFaceHidden()) ||
          isCardHiddenForHuman(first.controller ?? 0, first.location ?? 0, first.position ?? firstMesh?.position ?? 0);
        if (firstHidden) inspectHiddenCard(first.location ?? 0);
        else inspectCard(cardDb.getCard(first.code), first.code);
      }

      const cancelBtn = selectModal.querySelector('#btn-cancel-card-select') as HTMLElement;
      const isCancelable = 'cancelable' in msg ? Boolean((msg as any).cancelable) : false;
      if (isCancelable) {
        cancelBtn.style.display = 'inline-block';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => sendHumanResponse((msg as any).prepareResponse(null));
      } else {
        cancelBtn.style.display = 'none';
      }

      const confirmBtn = selectModal.querySelector('#btn-confirm-card-select') as HTMLButtonElement;
      confirmBtn.style.display = 'inline-block';
      confirmBtn.textContent = 'Select';
      confirmBtn.onclick = () => {
        const resp = selectedCardsForPrompt.map((s) => IndexResponse(s.index));
        sendHumanResponse(msg.prepareResponse(resp));
      };

      updateSelectionUI();
      selectModal.classList.remove('hidden');
      return;
    }

    // Prompt J: SelectYesNo
    if (msg instanceof YGOProMsgSelectYesNo) {
      promptTitle.textContent = 'Confirm Action?';

      const yesBtn = document.createElement('button');
      yesBtn.className = 'prompt-option-btn';
      yesBtn.textContent = 'Yes';
      yesBtn.onclick = () => sendHumanResponse(msg.prepareResponse(true));
      promptOptions.appendChild(yesBtn);

      const noBtn = document.createElement('button');
      noBtn.className = 'prompt-option-btn';
      noBtn.textContent = 'No';
      noBtn.onclick = () => sendHumanResponse(msg.prepareResponse(false));
      promptOptions.appendChild(noBtn);

      promptModal.classList.remove('hidden');
      return;
    }

    // Prompt K: SortCard (Deck Order Resolution)
    if (msg instanceof YGOProMsgSortCard) {
      promptTitle.textContent = 'Confirm Card Order';
      const listContainer = document.createElement('div');
      listContainer.className = 'select-cards-container';
      msg.cards.forEach((c: any) => {
        const cData = cardDb.getCard(c.code);
        const item = document.createElement('div');
        item.className = 'select-card-badge md-drawer-card chosen';
        item.innerHTML = renderFramedCardHTML(cData, c.code, { extraClass: 'size-sm' });
        item.addEventListener('mouseenter', () => inspectCard(cData, c.code));
        listContainer.appendChild(item);
      });
      promptOptions.appendChild(listContainer);

      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'prompt-option-btn';
      confirmBtn.textContent = 'Confirm';
      confirmBtn.onclick = () => sendHumanResponse(msg.defaultResponse());
      promptOptions.appendChild(confirmBtn);

      promptModal.classList.remove('hidden');
      return;
    }

    // Default Fallback
    const btn = document.createElement('button');
    btn.className = 'prompt-option-btn';
    btn.textContent = 'Confirm';
    btn.onclick = () => sendHumanResponse((msg as any).defaultResponse?.() ?? new Uint8Array([0]));
    promptOptions.appendChild(btn);
    promptModal.classList.remove('hidden');
  };

  /**
   * Opens drawer for activating effects of cards in Graveyard / Banished during Main Phase
   */
  const openGyActivatableDrawer = (
    msg: YGOProMsgSelectIdleCmd,
    gyCards: Array<{ code: number; controller: number; location: number; sequence: number; desc: number; actIdx: number }>,
  ) => {
    let chosenActIdx = gyCards[0]?.actIdx ?? 0;
    updateDrawerLocationTabs(gyCards.map((c) => c.location));

    const titleEl = selectModal.querySelector('#card-select-title')!;
    titleEl.textContent = 'Activate Effect (GY / Banished)';

    const countBadge = selectModal.querySelector('#card-select-count')!;
    countBadge.textContent = `${gyCards.length} Available`;

    const listEl = selectModal.querySelector('#card-select-list')!;
    listEl.innerHTML = '';

    gyCards.forEach((c, idx) => {
      const cData = cardDb.getCard(c.code);
      const item = document.createElement('div');
      item.className = `select-card-badge md-drawer-card ${idx === 0 ? 'chosen' : ''}`;
      item.innerHTML = renderFramedCardHTML(cData, c.code, {
        extraClass: 'size-md',
        location: c.location,
      });
      item.addEventListener('mouseenter', () => {
        inspectCard(cData, c.code, { descCode: c.desc, highlightActivatable: true });
      });
      item.addEventListener('click', () => {
        chosenActIdx = c.actIdx;
        inspectCard(cData, c.code, { descCode: c.desc, highlightActivatable: true });
        listEl.querySelectorAll('.md-drawer-card').forEach((el) => el.classList.remove('chosen'));
        item.classList.add('chosen');
      });
      listEl.appendChild(item);
    });

    if (gyCards[0]) {
      inspectCard(cardDb.getCard(gyCards[0].code), gyCards[0].code, {
        descCode: gyCards[0].desc,
        highlightActivatable: true,
      });
    }

    const cancelBtn = selectModal.querySelector('#btn-cancel-card-select') as HTMLElement;
    cancelBtn.style.display = 'inline-block';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => selectModal.classList.add('hidden');

    const confirmBtn = selectModal.querySelector('#btn-confirm-card-select') as HTMLButtonElement;
    confirmBtn.style.display = 'inline-block';
    confirmBtn.disabled = false;
    confirmBtn.style.opacity = '1';
    confirmBtn.textContent = 'Select';
    confirmBtn.onclick = () => {
      const chosen = gyCards.find((g) => g.actIdx === chosenActIdx);
      if (chosen) activeEffectCard = cardDb.getCard(chosen.code);
      sendHumanResponse(msg.prepareResponse(IdleCmdType.ACTIVATE, IndexResponse(chosenActIdx)));
    };

    selectModal.classList.remove('hidden');
  };

  // 9. Life Points HUD Animation & End-of-Duel Result Screen Helpers
  let lastDuelConfig: DuelStartConfig | null = null;
  const displayedLp: [number, number] = [8000, 8000];
  const lpAnimFrames: [number | null, number | null] = [null, null];

  const updatePlayerLpUI = (player: number, targetLp: number, immediate = false) => {
    const idx = player === 0 ? 0 : 1;
    const clampedLp = Math.max(0, Math.round(targetLp));
    const lpEl = document.getElementById(idx === 0 ? 'p0-lp' : 'p1-lp');
    const barEl = document.getElementById(idx === 0 ? 'p0-lp-bar' : 'p1-lp-bar');
    const pillEl = lpEl?.closest('.md-hud-pill');

    const pct = Math.max(0, Math.min(100, (clampedLp / 8000) * 100));
    if (barEl) {
      barEl.style.width = `${pct}%`;
      barEl.classList.toggle('lp-low', clampedLp > 0 && clampedLp <= 2000);
      barEl.classList.toggle('lp-mid', clampedLp > 2000 && clampedLp <= 4000);
    }

    if (lpAnimFrames[idx] !== null) {
      cancelAnimationFrame(lpAnimFrames[idx]!);
      lpAnimFrames[idx] = null;
    }

    if (immediate || displayedLp[idx] === clampedLp) {
      displayedLp[idx] = clampedLp;
      if (lpEl) lpEl.textContent = String(clampedLp);
      return;
    }

    const startLp = displayedLp[idx];
    const diff = clampedLp - startLp;
    if (diff < 0 && pillEl) {
      pillEl.classList.remove('lp-damage-flash');
      void (pillEl as HTMLElement).offsetWidth;
      pillEl.classList.add('lp-damage-flash');
      window.setTimeout(() => pillEl.classList.remove('lp-damage-flash'), 500);
    }

    const duration = 420;
    const startTime = performance.now();
    const stepAnim = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(startLp + diff * eased);
      displayedLp[idx] = current;
      if (lpEl) lpEl.textContent = String(current);
      if (t < 1) {
        lpAnimFrames[idx] = requestAnimationFrame(stepAnim);
      } else {
        displayedLp[idx] = clampedLp;
        if (lpEl) lpEl.textContent = String(clampedLp);
        lpAnimFrames[idx] = null;
      }
    };
    lpAnimFrames[idx] = requestAnimationFrame(stepAnim);
  };

  const showLpDeltaPopup = (player: number, delta: number) => {
    if (delta === 0) return;
    const lpEl = document.getElementById(player === 0 ? 'p0-lp' : 'p1-lp');
    const pillEl = lpEl?.closest('.md-hud-pill') as HTMLElement | null;
    if (!pillEl) return;

    const popup = document.createElement('div');
    popup.className = `md-lp-float-popup ${delta < 0 ? 'damage' : 'recover'}`;
    popup.textContent = delta < 0 ? `${delta}` : `+${delta}`;
    pillEl.appendChild(popup);
    window.setTimeout(() => popup.remove(), 1100);
  };

  const showDuelResultOverlay = (winner: number, reason: number) => {
    if (autoPlayInterval) {
      clearInterval(autoPlayInterval);
      autoPlayInterval = null;
      document.getElementById('btn-auto-play')?.classList.remove('active');
    }
    closeAllPromptOverlays();

    const isVictory = winner === 0;
    const isDefeat = winner === 1;

    duelResultBadge.className = `md-duel-result-badge ${
      isVictory ? 'victory' : isDefeat ? 'defeat' : 'draw'
    }`;
    duelResultBadge.textContent = isVictory ? 'VICTORY' : isDefeat ? 'DEFEAT' : 'DRAW';

    const p0Name = lastDuelConfig?.playerName || 'Duelist';
    const p1Name = lastDuelConfig?.aiName || 'AI Opponent';
    duelResultWinner.textContent = isVictory
      ? `${p0Name} Wins the Duel!`
      : isDefeat
      ? `${p1Name} Wins the Duel`
      : 'The Duel Ended in a Draw';

    let reasonText = 'Life Points reached 0';
    if (reason === 0x02) {
      reasonText = isVictory ? 'Opponent decked out (no cards left to draw)' : 'Deck out (no cards left to draw)';
    } else if (reason >= 0x10) {
      reasonText = 'Special Victory Condition achieved';
    } else if (isVictory) {
      reasonText = "Opponent's Life Points reached 0";
    } else if (isDefeat) {
      reasonText = 'Your Life Points reached 0';
    }
    duelResultReason.textContent = reasonText;

    if (isVictory) {
      audio.playWin();
    } else {
      audio.playLose();
    }

    duelResultOverlay.classList.remove('hidden');
  };

  // Start Duel Workflow
  const startDuel = async (config: DuelStartConfig) => {
    lastDuelConfig = config;
    duelResultOverlay.classList.add('hidden');
    mainMenuContainer.classList.add('hidden');
    deckEditorContainer.classList.add('hidden');
    duelContainer.classList.remove('hidden');

    updatePlayerLpUI(0, 8000, true);
    updatePlayerLpUI(1, 8000, true);
    document.getElementById('turn-badge')!.textContent = 'TURN 1';
    updatePhaseUI(PHASE.DRAW);

    document.getElementById('p0-name')!.textContent = config.playerName;
    document.getElementById('p1-name')!.textContent = config.aiName;
    const p0AvatarUrl =
      config.playerAvatar === 'custom_avatar'
        ? customAssets.getUrl('custom_avatar') || '/icon/ProfileIcon1010002_L.png'
        : config.playerAvatar.startsWith('/')
        ? config.playerAvatar
        : `/icon/${config.playerAvatar}`;
    (document.getElementById('p0-avatar-img') as HTMLImageElement).src = p0AvatarUrl;
    (document.getElementById('p1-avatar-img') as HTMLImageElement).src = config.aiAvatar.startsWith('/')
      ? config.aiAvatar
      : `/icon/${config.aiAvatar}`;

    let deck1Text = deckStore.get(config.playerDeckName);
    if (!deck1Text) {
      deck1Text = await fetch('/data/decks/AI_BlueEyes.ydk').then((r) => r.text());
    }

    let deck2Text = deckStore.get(config.aiDeckName);
    if (!deck2Text) {
      deck2Text = await fetch('/data/decks/AI_DarkMagician.ydk').then((r) => r.text());
    }

    const deck1 = parseYdk(deck1Text || '', config.playerName + ' Deck');
    const deck2 = parseYdk(deck2Text || '', config.aiName + ' Deck');

    if (!board) {
      board = new ThreeBoard(boardContainer, cardDb, {
        onCardClick: (card) => {
          handleCardClick(card);
        },
        onCardHover: (card) => {
          if (!card) return;
          if (card.isFaceHidden() || isCardHiddenForHuman(card.controller, card.location, card.position)) {
            inspectHiddenCard(card.location);
            return;
          }
          if (card.cardData) {
            inspectCard(card.cardData, card.code);
          }
        },
        onMateClick: () => {
          audio.playSelect();
        },
        onExtraDeckHover: (hovering, player) => {
          if (hovering && player === 0) {
            openExtraDeckPreviewDrawer(0, LOCATION.EXTRA);
          }
        },
        onExtraDeckClick: (player) => {
          if (player === 0) {
            openExtraDeckPreviewDrawer(0, LOCATION.EXTRA);
          }
        },
        onZoneClick: (player, location, sequence) => {
          if (currentPrompt instanceof YGOProMsgSelectPlace) {
            const places = currentPrompt.getSelectablePlaces();
            const match = places.find(
              (p: any) => p.player === player && p.location === location && p.sequence === sequence,
            );
            if (match) {
              sendHumanResponse(currentPrompt.prepareResponse([match]));
              return;
            }
          }
          if (location === LOCATION.GRAVE || location === LOCATION.REMOVED) {
            openExtraDeckPreviewDrawer(player, location);
          }
        },
      });
    } else {
      board.clear();
    }
    (window as any).__board = board;
    (window as any).__handleCardClick = handleCardClick;

    board.setField(config.field || 'FieldIcon1090001.png');
    board.setProtector(config.protector || 'DefaultProtector.png');
    board.setMate(config.mate || '1000001.png');

    audio.playDuelBGM(config.duelBgm || 'DUEL_01');

    runner = new DuelRunner({
      wrapper,
      cardDb,
      player0Deck: deck1,
      player1Deck: deck2,
      player0Name: config.playerName,
      player1Name: config.aiName,
      isPlayer0Bot: false,
      isPlayer1Bot: true,
    });

    runner.on((event: DuelEvent) => {
      if (event.type === 'sync') {
        board!.syncSnapshot(event.snapshot);
      } else if (event.type === 'log') {
        appendLog(event.text);
      } else if (event.type === 'turn') {
        document.getElementById('turn-badge')!.textContent = `TURN ${event.turnCount}`;
      } else if (event.type === 'phase') {
        updatePhaseUI(event.phase);
      } else if (event.type === 'lp') {
        updatePlayerLpUI(event.player, event.lp);
        audio.checkClimax(runner!.lp[0], runner!.lp[1]);
      } else if (event.type === 'draw') {
        audio.playDraw();
      } else if (event.type === 'summon') {
        audio.playSummon(false);
      } else if (event.type === 'spsummon') {
        audio.playSummon(true);
      } else if (event.type === 'set') {
        audio.playSet();
      } else if (event.type === 'posChange') {
        audio.playSet();
      } else if (event.type === 'move') {
        if (event.from.location !== event.to.location && event.from.location !== 0 && event.to.location !== 0) {
          audio.playCardMove(event.from.location, event.to.location);
          board!.playCardTransferAnimation(event.code, event.from, event.to);
          showCardMoveToast(event.code, event.from, event.to);
        }
      } else if (event.type === 'chain') {
        const cData = cardDb.getCard(event.code);
        if (cData) activeEffectCard = cData;
        if (event.chainCount <= 1) {
          audio.playChainStart();
        } else {
          audio.playChainLink();
        }
        inspectCard(cData, event.code, {
          descCode: event.desc,
          highlightActivatable: true,
        });
        handleChainActivated(event.chainCount, event.code, event.player);
      } else if (event.type === 'chainSolving') {
        audio.playChainResolve();
        handleChainSolving(event.chainCount);
      } else if (event.type === 'chainSolved') {
        handleChainSolved(event.chainCount);
      } else if (event.type === 'chainEnd') {
        audio.playChainEnd();
        handleChainEnd();
      } else if (event.type === 'attack') {
        audio.playAttack();
      } else if (event.type === 'damage') {
        audio.playDamage();
        showLpDeltaPopup(event.player, -event.amount);
      } else if (event.type === 'recover') {
        showLpDeltaPopup(event.player, event.amount);
      } else if (event.type === 'win') {
        showDuelResultOverlay(event.winner, event.reason);
      } else if (event.type === 'prompt') {
        showPromptUI(event.message);
      }
    });

    logDrawer.innerHTML = '';
    cardMoveFeed.innerHTML = '';
    appendLog('=== DUEL COMMENCED ===');
    await stepUntilPrompt();
  };

  // End-of-Duel Result Overlay Buttons
  document.getElementById('btn-duel-rematch')?.addEventListener('click', () => {
    audio.playSelect();
    duelResultOverlay.classList.add('hidden');
    if (lastDuelConfig) {
      startDuel(lastDuelConfig);
    }
  });

  document.getElementById('btn-duel-back-menu')?.addEventListener('click', () => {
    audio.playSelect();
    duelResultOverlay.classList.add('hidden');
    closeAllPromptOverlays();
    duelContainer.classList.add('hidden');
    mainMenuContainer.classList.remove('hidden');
    audio.playBGM(mainMenu.getProfile().mainBgm || 'BGM_MENU_01.ogg');
  });

  // 10. Phase Orb Step Action Buttons
  document.getElementById('btn-to-bp')?.addEventListener('click', () => {
    if (currentPrompt instanceof YGOProMsgSelectIdleCmd && currentPrompt.canBp) {
      sendHumanResponse(currentPrompt.prepareResponse(IdleCmdType.TO_BP));
    }
  });

  document.getElementById('btn-to-m2')?.addEventListener('click', () => {
    if (currentPrompt instanceof YGOProMsgSelectBattleCmd && currentPrompt.canM2) {
      sendHumanResponse(currentPrompt.prepareResponse(BattleCmdType.TO_M2));
    }
  });

  document.getElementById('btn-to-ep')?.addEventListener('click', () => {
    if (currentPrompt instanceof YGOProMsgSelectIdleCmd && currentPrompt.canEp) {
      sendHumanResponse(currentPrompt.prepareResponse(IdleCmdType.TO_EP));
    } else if (currentPrompt instanceof YGOProMsgSelectBattleCmd && currentPrompt.canEp) {
      sendHumanResponse(currentPrompt.prepareResponse(BattleCmdType.TO_EP));
    }
  });

  // 11. Circular Bottom-Right HUD Buttons
  const autoPlayBtn = document.getElementById('btn-auto-play');
  autoPlayBtn?.addEventListener('click', () => {
    if (autoPlayInterval) {
      clearInterval(autoPlayInterval);
      autoPlayInterval = null;
      autoPlayBtn.classList.remove('active');
      runner?.setPlayer0Bot(false);
    } else {
      closeAllPromptOverlays();
      autoPlayBtn.classList.add('active');
      runner?.setPlayer0Bot(true);
      autoPlayInterval = window.setInterval(() => {
        if (!runner || runner.isEnded) {
          clearInterval(autoPlayInterval!);
          autoPlayInterval = null;
          autoPlayBtn.classList.remove('active');
          return;
        }
        stepDuel();
      }, 500);
    }
  });

  const qeBtn = document.getElementById('btn-qe-auto');
  qeBtn?.addEventListener('click', () => {
    qeBtn.classList.toggle('active');
    audio.playSelect();
  });

  const logBtn = document.getElementById('btn-toggle-log');
  logBtn?.addEventListener('click', () => {
    logDrawer.classList.toggle('hidden');
    audio.playSelect();
  });

  const inspectToggleBtn = document.getElementById('btn-toggle-inspect');
  inspectToggleBtn?.addEventListener('click', () => {
    cardInspector?.classList.toggle('hidden');
    audio.playSelect();
  });

  document.getElementById('btn-menu-return')?.addEventListener('click', () => {
    if (confirm('Return to Main Menu? The current duel will end.')) {
      if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
      }
      duelResultOverlay.classList.add('hidden');
      closeAllPromptOverlays();
      duelContainer.classList.add('hidden');
      mainMenuContainer.classList.remove('hidden');
      audio.playBGM(mainMenu.getProfile().mainBgm || 'BGM_MENU_01.ogg');
    }
  });

  // 12. Live Real-time FPS Counter
  let frameCount = 0;
  let lastTime = performance.now();
  const fpsEl = document.getElementById('duel-fps');
  function updateDuelFps() {
    frameCount++;
    const now = performance.now();
    if (now - lastTime >= 500) {
      const fps = Math.round((frameCount * 1000) / (now - lastTime));
      if (fpsEl) fpsEl.textContent = `${fps}`;
      frameCount = 0;
      lastTime = now;
    }
    requestAnimationFrame(updateDuelFps);
  }
  requestAnimationFrame(updateDuelFps);

  // 13. Initialize Main Menu
  const mainMenu = new MainMenu(mainMenuContainer, audio, {
    onStartDuel: (config) => {
      startDuel(config);
    },
    onOpenDeckEditor: () => {
      mainMenuContainer.classList.add('hidden');
      deckEditorContainer.classList.remove('hidden');
      audio.playBGM('BGM_MENU_02.ogg'); // Play MENU Deck Editor BGM automatically
      deckEditor.openDeckList();
    },
    onAssetsLoaded: (assets) => {
      if (assets.deckCases && assets.deckCases.length > 0) {
        deckEditor.setDeckCases(assets.deckCases);
      }
    },
  });

  await mainMenu.init();
}

bootstrap().catch((err) => {
  console.error('Failed to bootstrap MDPro Web:', err);
  const logDrawer = document.getElementById('log-drawer');
  if (logDrawer) {
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'color: #ff334b; font-weight: bold; padding: 4px 0;';
    errDiv.textContent = `CRITICAL INITIALIZATION ERROR: ${err.message}`;
    logDrawer.appendChild(errDiv);
  }
});
