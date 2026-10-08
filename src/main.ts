import { createOcgcoreWrapper, ZipScriptReader, SqljsCardReader } from 'koishipro-core.js';
import initSqlJs from 'sql.js';
import { CardDatabase, type CardData, getCardTypeInfo } from './engine/card-database';
import { parseYdk } from './engine/ydk';
import { DuelRunner, type DuelEvent } from './engine/duel-runner';
import { ThreeBoard } from './render/three-board';
import { PHASE, POS, TYPE } from './engine/constants';
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
import { MainMenu } from './ui/main-menu';
import { DeckEditor } from './ui/deck-editor';
import { deckStore } from './ui/deck-store';

async function bootstrap() {
  const mainMenuContainer = document.getElementById('main-menu-container')!;
  const duelContainer = document.getElementById('duel-container')!;
  const deckEditorContainer = document.getElementById('deck-editor-container')!;
  const boardContainer = document.getElementById('board-container')!;
  const popover = document.getElementById('card-action-popover')!;
  const selectModal = document.getElementById('card-select-modal')!;
  const promptModal = document.getElementById('prompt-modal')!;
  const promptTitle = document.getElementById('prompt-title')!;
  const promptOptions = document.getElementById('prompt-options')!;
  const logDrawer = document.getElementById('log-drawer')!;

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

  // 5. Initialize Deck Editor
  const deckEditor = new DeckEditor(deckEditorContainer, cardDb, {
    onClose: () => {
      deckEditorContainer.innerHTML = '';
      deckEditorContainer.classList.add('hidden');
      mainMenuContainer.classList.remove('hidden');
    },
    onCardInspect: (card) => {
      inspectCard(card);
    },
    onDeckSaved: (name) => {
      const p = mainMenu.getProfile();
      p.playerDeckName = 'custom:' + name;
      mainMenu.saveProfile();
    },
  });
  deckEditor.setPrebuiltDecks(prebuiltDecks);

  // 6. Duel Runner & Board State
  let runner: DuelRunner | null = null;
  let board: ThreeBoard | null = null;
  let currentPrompt: any = null;
  let autoPlayInterval: number | null = null;
  let selectedCardsForPrompt: Array<{ index: number; code: number; cardMesh?: CardMesh }> = [];

  // Master Duel Phase Button Visibility Helper
  const updatePhaseButtons = (bp = false, m2 = false, ep = false) => {
    const btnBp = document.getElementById('btn-to-bp');
    const btnM2 = document.getElementById('btn-to-m2');
    const btnEp = document.getElementById('btn-to-ep');
    if (btnBp) btnBp.classList.toggle('hidden', !bp);
    if (btnM2) btnM2.classList.toggle('hidden', !m2);
    if (btnEp) btnEp.classList.toggle('hidden', !ep);
  };

  // Authentic Master Duel Card Inspector (Screenshot 3)
  const inspectCard = (card: CardData | null, code?: number) => {
    const imgEl = document.getElementById('inspect-img') as HTMLImageElement;
    const nameEl = document.getElementById('inspect-name');
    const attrEl = document.getElementById('inspect-attr');
    const levelEl = document.getElementById('inspect-level');
    const statsEl = document.getElementById('inspect-stats');
    const atkEl = document.getElementById('inspect-atk');
    const defEl = document.getElementById('inspect-def');
    const typeBarEl = document.getElementById('inspect-type-bar');
    const descEl = document.getElementById('inspect-desc');

    const cardCode = card?.id ?? code ?? 89631139;
    if (imgEl) imgEl.src = `/pics/${cardCode}.jpg`;
    if (nameEl) nameEl.textContent = card?.name ?? `Card #${cardCode}`;

    if (card) {
      const typeInfo = getCardTypeInfo(card);

      if (typeInfo.category === 'Monster') {
        const attr = cardDb.getAttributeName(card.attribute);
        const levelPrefix = (card.type & TYPE.XYZ)
          ? `Rank ${card.level}`
          : (card.type & TYPE.LINK)
          ? `Link-${card.level}`
          : `★ ${card.level}`;

        if (attrEl) attrEl.textContent = attr;
        if (levelEl) levelEl.textContent = levelPrefix;
        if (statsEl) statsEl.style.display = 'flex';
        if (atkEl) atkEl.textContent = card.atk === -2 ? '?' : String(card.atk ?? 0);
        if (defEl) defEl.textContent = (card.type & TYPE.LINK) ? `LINK-${card.level}` : (card.def === -2 ? '?' : String(card.def ?? 0));
        if (typeBarEl) typeBarEl.textContent = `【${cardDb.getRaceName(card.race)} / ${typeInfo.subType}】`;
      } else {
        // Spell or Trap
        if (attrEl) attrEl.textContent = typeInfo.category.toUpperCase();
        if (levelEl) levelEl.textContent = typeInfo.subType;
        if (statsEl) statsEl.style.display = 'none';
        if (typeBarEl) typeBarEl.textContent = typeInfo.formattedType;
      }
      if (descEl) descEl.textContent = card.desc;
    } else {
      if (attrEl) attrEl.textContent = 'UNKNOWN';
      if (levelEl) levelEl.textContent = '-';
      if (statsEl) statsEl.style.display = 'none';
      if (typeBarEl) typeBarEl.textContent = '【Unknown Card】';
      if (descEl) descEl.textContent = 'Details not available.';
    }
  };

  // Phase UI Highlighter: Updates the round Master Duel Phase Orb (Screenshot 2 & 3)
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
    board?.clearCardHighlights();
  };

  const closeSelectionModal = () => {
    selectModal.classList.add('hidden');
    selectModal.querySelector('#card-select-list')!.innerHTML = '';
    selectedCardsForPrompt = [];
    board?.clearCardHighlights();
  };

  const sendHumanResponse = async (responseBytes: Uint8Array) => {
    currentPrompt = null;
    updatePhaseButtons(false, false, false);
    closePopover();
    closeSelectionModal();
    promptModal.classList.add('hidden');
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

  // 7. Interactive 3D Card Click Handling
  const handleCardClick = (card: CardMesh) => {
    audio.playHover();
    if (card.cardData) {
      inspectCard(card.cardData, card.code);
    }

    if (!currentPrompt) return;

    // A. If IdleCmd is pending, show available card actions directly over the card
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
      const spIdx = msg.spSummonableCards.findIndex(matchesCard);
      if (spIdx !== -1) {
        actions.push({
          label: 'Special Summon',
          icon: '/texture/GUI_T_DuelButtonActIcon03_1.png',
          cls: 'spsummon',
          onClick: () => sendHumanResponse(msg.prepareResponse(IdleCmdType.SPSUMMON, IndexResponse(spIdx))),
        });
      }

      // Activatable
      const actIdx = msg.activatableCards.findIndex(matchesCard);
      if (actIdx !== -1) {
        actions.push({
          label: 'Activate Effect',
          icon: '/texture/GUI_T_DuelButtonActIcon04_1.png',
          cls: 'activate',
          onClick: () => sendHumanResponse(msg.prepareResponse(IdleCmdType.ACTIVATE, IndexResponse(actIdx))),
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
        const isDef = (card.position === POS.FACEUP_DEFENSE || card.position === POS.FACEDOWN_DEFENSE);
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
        popover.style.top = `${screenPos.y - 70}px`;
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

        const cancelWrap = document.createElement('div');
        cancelWrap.className = 'md-action-btn-wrap';
        cancelWrap.title = 'Cancel';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'md-action-circle-btn cancel';
        const cancelImg = document.createElement('img');
        cancelImg.src = '/texture/GUI_T_DuelButtonActIcon17_1.png';
        cancelImg.alt = 'Cancel';
        cancelBtn.appendChild(cancelImg);
        const cancelLbl = document.createElement('span');
        cancelLbl.className = 'md-action-label';
        cancelLbl.textContent = 'Cancel';
        cancelWrap.appendChild(cancelBtn);
        cancelWrap.appendChild(cancelLbl);
        cancelWrap.onclick = (e) => {
          e.stopPropagation();
          closePopover();
        };
        popover.appendChild(cancelWrap);

        popover.classList.remove('hidden');
        return;
      }
    }

    // B. If BattleCmd is pending, check if card can attack
    if (currentPrompt instanceof YGOProMsgSelectBattleCmd) {
      const msg = currentPrompt;
      const atkIdx = msg.attackableCards.findIndex(
        (c: any) => c.location === card.location && (c.sequence === card.sequence || (card.code > 0 && c.code === card.code))
      );
      if (atkIdx !== -1) {
        board?.clearCardHighlights();
        card.setSelected(true);

        const screenPos = board!.getScreenPosition(card);
        popover.style.left = `${screenPos.x}px`;
        popover.style.top = `${screenPos.y - 70}px`;
        popover.innerHTML = '';

        const wrap = document.createElement('div');
        wrap.className = 'md-action-btn-wrap';
        wrap.title = 'Declare Attack';

        const atkBtn = document.createElement('button');
        atkBtn.className = 'md-action-circle-btn attack';
        const atkImg = document.createElement('img');
        atkImg.src = '/texture/GUI_T_DuelButtonActIcon01_1.png';
        atkImg.alt = 'Attack';
        atkBtn.appendChild(atkImg);

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

        const cancelWrap = document.createElement('div');
        cancelWrap.className = 'md-action-btn-wrap';
        cancelWrap.title = 'Cancel';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'md-action-circle-btn cancel';
        const cancelImg = document.createElement('img');
        cancelImg.src = '/texture/GUI_T_DuelButtonActIcon17_1.png';
        cancelImg.alt = 'Cancel';
        cancelBtn.appendChild(cancelImg);
        const cancelLbl = document.createElement('span');
        cancelLbl.className = 'md-action-label';
        cancelLbl.textContent = 'Cancel';
        cancelWrap.appendChild(cancelBtn);
        cancelWrap.appendChild(cancelLbl);
        cancelWrap.onclick = (e) => {
          e.stopPropagation();
          closePopover();
        };
        popover.appendChild(cancelWrap);

        popover.classList.remove('hidden');
        return;
      }
    }

    // C. If SelectUnselectCard is pending (Fusion/Tribute Materials)
    if (currentPrompt instanceof YGOProMsgSelectUnselectCard) {
      const msg = currentPrompt;
      const selIdx = msg.selectableCards.findIndex(
        (c: any) => c.controller === card.controller && c.location === card.location && c.sequence === card.sequence
      );
      if (selIdx !== -1) {
        sendHumanResponse(msg.prepareResponse(IndexResponse(selIdx)));
        return;
      }
      const unselIdx = msg.unselectableCards.findIndex(
        (c: any) => c.controller === card.controller && c.location === card.location && c.sequence === card.sequence
      );
      if (unselIdx !== -1) {
        sendHumanResponse(msg.prepareResponse(IndexResponse(msg.selectableCount + unselIdx)));
        return;
      }
      return;
    }

    // D. If SelectCard / SelectTribute / SelectSum is pending, toggle card selection!
    if (
      currentPrompt instanceof YGOProMsgSelectCard ||
      currentPrompt instanceof YGOProMsgSelectTribute ||
      currentPrompt instanceof YGOProMsgSelectSum
    ) {
      toggleCardSelection(card);
    }
  };

  // Toggle selection of a card in 3D or in dialog
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
        (c: any) => c.location === cardMesh!.location && c.sequence === cardMesh!.sequence
      );
    }

    if (index === -1) return;

    const existingIdx = selectedCardsForPrompt.findIndex((s) => s.index === index);
    if (existingIdx !== -1) {
      // Unselect
      selectedCardsForPrompt.splice(existingIdx, 1);
      cardMesh?.setSelected(false);
    } else {
      // Select
      const max = currentPrompt.max ?? 1;
      if (selectedCardsForPrompt.length >= max) {
        // Replace or limit
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

    countBadge.textContent = `${selectedCardsForPrompt.length} Selected (Required: ${min}${min === max ? '' : ` - ${max}`})`;

    const isValid = selectedCardsForPrompt.length >= min && selectedCardsForPrompt.length <= max;
    confirmBtn.disabled = !isValid;
    confirmBtn.style.opacity = isValid ? '1' : '0.5';

    // Highlight dialog thumbnails
    selectModal.querySelectorAll('.select-card-badge').forEach((el) => {
      const idx = Number(el.getAttribute('data-idx'));
      if (selectedCardsForPrompt.some((s) => s.index === idx)) {
        el.classList.add('chosen');
      } else {
        el.classList.remove('chosen');
      }
    });
  };

  // 8. Prompt UI Handler
  const showPromptUI = (msg: any) => {
    currentPrompt = msg;
    closePopover();
    promptOptions.innerHTML = '';
    promptModal.classList.add('hidden');

    // Prompt A: SelectIdleCmd (Master Duel Native 3D Flow - Screenshot 3)
    if (msg instanceof YGOProMsgSelectIdleCmd) {
      board?.clearCardHighlights();

      const highlightCard = (c: any) => {
        let card = board?.findCard(c.controller, c.location, c.sequence);
        if (!card && c.code > 0) {
          card = board?.getCards().find((m) => m.controller === c.controller && m.location === c.location && m.code === c.code);
        }
        card?.setSelectable(true);
      };

      msg.summonableCards.forEach(highlightCard);
      msg.spSummonableCards.forEach(highlightCard);
      msg.activatableCards.forEach(highlightCard);
      msg.ssetableCards.forEach(highlightCard);
      msg.msetableCards.forEach(highlightCard);
      msg.reposableCards?.forEach(highlightCard);

      // In Master Duel: Board is clean and unobstructed. Phase transition buttons appear by the Phase Orb.
      updatePhaseButtons(Boolean(msg.canBp), false, Boolean(msg.canEp));
      return;
    }

    // Prompt B: SelectBattleCmd (Master Duel Native 3D Attack Flow)
    if (msg instanceof YGOProMsgSelectBattleCmd) {
      board?.clearCardHighlights();

      msg.attackableCards.forEach((c: any) => {
        let card = board?.findCard(c.controller, c.location, c.sequence);
        if (!card && c.code > 0) {
          card = board?.getCards().find((m) => m.controller === c.controller && m.location === c.location && m.code === c.code);
        }
        card?.setSelectable(true, 0xff2244);
      });

      // Update Phase Orb buttons: "Main 2" and "End Turn"
      updatePhaseButtons(false, Boolean(msg.canM2), Boolean(msg.canEp));
      return;
    }

    // All other prompts hide the Phase Orb action buttons
    updatePhaseButtons(false, false, false);

    // Prompt C1: Interactive Fusion / Material Resolution (SelectUnselectCard)
    if (msg instanceof YGOProMsgSelectUnselectCard) {
      board?.clearCardHighlights();
      selectedCardsForPrompt = [];

      const titleEl = selectModal.querySelector('#card-select-title')!;
      titleEl.textContent = msg.finishable
        ? 'Confirm Fusion Materials (or Select More)'
        : 'Select Fusion / Effect Material';

      const countBadge = selectModal.querySelector('#card-select-count')!;
      countBadge.textContent = `${msg.unselectableCount} Material(s) Chosen`;

      const listEl = selectModal.querySelector('#card-select-list')!;
      listEl.innerHTML = '';

      // Section 1: Chosen materials (unselectableCards)
      if (msg.unselectableCount > 0) {
        const chosenHeader = document.createElement('div');
        chosenHeader.className = 'select-section-title';
        chosenHeader.textContent = 'Chosen Materials (Click to Remove):';
        listEl.appendChild(chosenHeader);

        const chosenRow = document.createElement('div');
        chosenRow.className = 'select-cards-row chosen-row';
        msg.unselectableCards.forEach((c: any, idx: number) => {
          const mesh = board?.findCard(c.controller, c.location, c.sequence);
          mesh?.setSelectable(true, 0xffcc00); // Gold highlight on board

          const cardItem = document.createElement('div');
          cardItem.className = 'select-card-badge chosen-material';
          const cName = cardDb.getName(c.code);
          cardItem.title = `${cName} (Click to remove)`;
          cardItem.innerHTML = `<img src="/pics/${c.code}.jpg" alt="${cName}" /><span class="material-tag">✓ Chosen</span>`;
          cardItem.onclick = () => {
            sendHumanResponse(msg.prepareResponse(IndexResponse(msg.selectableCount + idx)));
          };
          chosenRow.appendChild(cardItem);
        });
        listEl.appendChild(chosenRow);
      }

      // Section 2: Available candidates (selectableCards)
      if (msg.selectableCount > 0) {
        const availHeader = document.createElement('div');
        availHeader.className = 'select-section-title';
        availHeader.textContent = 'Available Candidates (Click to Select):';
        listEl.appendChild(availHeader);

        const availRow = document.createElement('div');
        availRow.className = 'select-cards-row avail-row';
        msg.selectableCards.forEach((c: any, idx: number) => {
          const mesh = board?.findCard(c.controller, c.location, c.sequence);
          mesh?.setSelectable(true, 0x00e5ff); // Cyan highlight on board

          const cardItem = document.createElement('div');
          cardItem.className = 'select-card-badge candidate';
          const cName = cardDb.getName(c.code);
          cardItem.title = `${cName} (Click to select)`;
          cardItem.innerHTML = `<img src="/pics/${c.code}.jpg" alt="${cName}" /><span class="material-tag select-tag">+ Select</span>`;
          cardItem.onclick = () => {
            sendHumanResponse(msg.prepareResponse(IndexResponse(idx)));
          };
          availRow.appendChild(cardItem);
        });
        listEl.appendChild(availRow);
      }

      const cancelBtn = selectModal.querySelector('#btn-cancel-card-select') as HTMLElement;
      if (msg.cancelable) {
        cancelBtn.style.display = 'inline-block';
        cancelBtn.onclick = () => sendHumanResponse(msg.prepareResponse(null));
      } else {
        cancelBtn.style.display = 'none';
      }

      const confirmBtn = selectModal.querySelector('#btn-confirm-card-select') as HTMLButtonElement;
      if (msg.finishable) {
        confirmBtn.style.display = 'inline-block';
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
        confirmBtn.textContent = 'Finish Selection (Summon)';
        confirmBtn.onclick = () => sendHumanResponse(msg.prepareResponse(null));
      } else {
        confirmBtn.style.display = 'inline-block';
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.5';
        confirmBtn.textContent = 'Select a Material';
      }

      selectModal.classList.remove('hidden');
      return;
    }

    // Prompt C2: Interactive Multi-Card Selection (SelectCard, SelectTribute, SelectSum)
    if (
      msg instanceof YGOProMsgSelectCard ||
      msg instanceof YGOProMsgSelectTribute ||
      msg instanceof YGOProMsgSelectSum
    ) {
      board?.clearCardHighlights();
      selectedCardsForPrompt = [];

      const rawCards = msg.cards;
      const title =
        msg instanceof YGOProMsgSelectTribute
          ? 'Select Tribute Cards'
          : msg instanceof YGOProMsgSelectSum
          ? 'Select Material Cards'
          : `Select Card (${msg.min === msg.max ? msg.min : `${msg.min} - ${msg.max}`})`;

      const titleEl = selectModal.querySelector('#card-select-title')!;
      titleEl.textContent = title;

      const listEl = selectModal.querySelector('#card-select-list')!;
      listEl.innerHTML = '';

      rawCards.forEach((c: any, idx: number) => {
        // Highlight on board if present
        const mesh = board?.findCard(c.controller, c.location, c.sequence);
        mesh?.setSelectable(true);

        const cardItem = document.createElement('div');
        cardItem.className = 'select-card-badge';
        cardItem.setAttribute('data-idx', String(idx));
        const cName = cardDb.getName(c.code);
        cardItem.title = cName;
        cardItem.innerHTML = `<img src="/pics/${c.code}.jpg" alt="${cName}" />`;

        cardItem.onclick = () => {
          toggleCardSelection(idx);
        };
        listEl.appendChild(cardItem);
      });

      const cancelBtn = selectModal.querySelector('#btn-cancel-card-select') as HTMLElement;
      const isCancelable = 'cancelable' in msg ? Boolean((msg as any).cancelable) : false;
      if (isCancelable) {
        cancelBtn.style.display = 'inline-block';
        cancelBtn.onclick = () => sendHumanResponse((msg as any).prepareResponse(null));
      } else {
        cancelBtn.style.display = 'none';
      }

      const confirmBtn = selectModal.querySelector('#btn-confirm-card-select') as HTMLElement;
      confirmBtn.textContent = 'Confirm Selection';
      confirmBtn.onclick = () => {
        const resp = selectedCardsForPrompt.map((s) => IndexResponse(s.index));
        sendHumanResponse(msg.prepareResponse(resp));
      };

      updateSelectionUI();
      selectModal.classList.remove('hidden');
      return;
    }

    // Prompt D: SelectChain
    if (msg instanceof YGOProMsgSelectChain) {
      promptTitle.textContent = 'Chain Response?';

      msg.chains.forEach((c: any, idx: number) => {
        const btn = document.createElement('button');
        btn.className = 'prompt-option-btn';
        btn.textContent = `⚡ Chain: ${cardDb.getName(c.code)}`;
        btn.onclick = () => sendHumanResponse(msg.prepareResponse(IndexResponse(idx)));
        promptOptions.appendChild(btn);
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'prompt-option-btn';
      cancelBtn.textContent = 'Pass (Do Not Chain)';
      cancelBtn.onclick = () => sendHumanResponse(msg.prepareResponse(null));
      promptOptions.appendChild(cancelBtn);

      promptModal.classList.remove('hidden');
      return;
    }

    // Prompt E: SelectPosition
    if (msg instanceof YGOProMsgSelectPosition) {
      promptTitle.textContent = 'Choose Battle Position';

      if (msg.positions & POS.FACEUP_ATTACK) {
        const btn = document.createElement('button');
        btn.className = 'prompt-option-btn';
        btn.textContent = '⚔ Face-Up Attack Position';
        btn.onclick = () => sendHumanResponse(msg.prepareResponse(POS.FACEUP_ATTACK));
        promptOptions.appendChild(btn);
      }
      if (msg.positions & POS.FACEUP_DEFENSE) {
        const btn = document.createElement('button');
        btn.className = 'prompt-option-btn';
        btn.textContent = '🛡 Face-Up Defense Position';
        btn.onclick = () => sendHumanResponse(msg.prepareResponse(POS.FACEUP_DEFENSE));
        promptOptions.appendChild(btn);
      }

      promptModal.classList.remove('hidden');
      return;
    }

    // Prompt F: SelectYesNo / SelectEffectYn
    if (msg instanceof YGOProMsgSelectYesNo || msg instanceof YGOProMsgSelectEffectYn) {
      promptTitle.textContent = 'Activate Effect?';

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

    // Prompt G: SelectOption
    if (msg instanceof YGOProMsgSelectOption) {
      promptTitle.textContent = 'Choose Option';

      msg.options.forEach((_opt: number, idx: number) => {
        const btn = document.createElement('button');
        btn.className = 'prompt-option-btn';
        btn.textContent = `Option #${idx + 1}`;
        btn.onclick = () => sendHumanResponse(msg.prepareResponse(IndexResponse(idx)));
        promptOptions.appendChild(btn);
      });

      promptModal.classList.remove('hidden');
      return;
    }

    // Prompt H: SelectPlace
    if (msg instanceof YGOProMsgSelectPlace) {
      promptTitle.textContent = 'Select Zone Placement';
      const places = msg.getSelectablePlaces();
      places.forEach((p: any) => {
        const btn = document.createElement('button');
        btn.className = 'prompt-option-btn';
        btn.textContent = `Zone Sequence #${p.sequence}`;
        btn.onclick = () => sendHumanResponse(msg.prepareResponse([p]));
        promptOptions.appendChild(btn);
      });
      promptModal.classList.remove('hidden');
      return;
    }

    // Prompt I: SortCard (Deck Order Resolution)
    if (msg instanceof YGOProMsgSortCard) {
      promptTitle.textContent = 'Confirm Deck Order (Top / Bottom)';
      const listContainer = document.createElement('div');
      listContainer.className = 'select-cards-container';
      msg.cards.forEach((c: any) => {
        const item = document.createElement('div');
        item.className = 'select-card-badge chosen';
        const cName = cardDb.getName(c.code);
        item.title = cName;
        item.innerHTML = `<img src="/pics/${c.code}.jpg" alt="${cName}" /><span class="material-tag">${cName}</span>`;
        listContainer.appendChild(item);
      });
      promptOptions.appendChild(listContainer);

      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'prompt-option-btn';
      confirmBtn.textContent = 'Confirm Order';
      confirmBtn.onclick = () => sendHumanResponse(msg.defaultResponse());
      promptOptions.appendChild(confirmBtn);

      promptModal.classList.remove('hidden');
      return;
    }

    // Default Fallback
    const btn = document.createElement('button');
    btn.className = 'prompt-option-btn';
    btn.textContent = 'Confirm Action';
    btn.onclick = () => sendHumanResponse((msg as any).defaultResponse?.() ?? new Uint8Array([0]));
    promptOptions.appendChild(btn);
    promptModal.classList.remove('hidden');
  };

  // 9. Start Duel Workflow
  const startDuel = async (config: {
    playerDeckName: string;
    aiDeckName: string;
    playerName: string;
    aiName: string;
    playerAvatar: string;
    aiAvatar: string;
    field?: string;
    mate?: string;
  }) => {
    // Hide menus, show duel arena
    mainMenuContainer.classList.add('hidden');
    deckEditorContainer.classList.add('hidden');
    duelContainer.classList.remove('hidden');

    // Update Player Cards in HUD
    document.getElementById('p0-name')!.textContent = config.playerName;
    document.getElementById('p1-name')!.textContent = config.aiName;
    (document.getElementById('p0-avatar-img') as HTMLImageElement).src = `/icon/${config.playerAvatar}`;
    (document.getElementById('p1-avatar-img') as HTMLImageElement).src = `/icon/${config.aiAvatar}`;

    // Get Deck Texts
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

    // Setup 3D Board
    if (!board) {
      board = new ThreeBoard(boardContainer, cardDb, {
        onCardClick: (card) => {
          handleCardClick(card);
        },
        onCardHover: (card) => {
          if (card?.cardData) {
            inspectCard(card.cardData, card.code);
          }
        },
        onMateClick: () => {
          audio.playSelect();
        },
      });
    } else {
      board.clear();
    }
    (window as any).__board = board;
    (window as any).__handleCardClick = handleCardClick;

    if (config.field) {
      board.setField(config.field);
    }
    if (config.mate) {
      board.setMate(config.mate);
    }

    // Play BGM
    audio.playBGM('BGM_DUEL_NORMAL_01.ogg');

    // Setup Duel Runner
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
        const pct = Math.max(0, Math.min(100, (event.lp / 8000) * 100)) + '%';
        if (event.player === 0) {
          document.getElementById('p0-lp')!.textContent = String(event.lp);
          const bar = document.getElementById('p0-lp-bar');
          if (bar) bar.style.width = pct;
        } else {
          document.getElementById('p1-lp')!.textContent = String(event.lp);
          const bar = document.getElementById('p1-lp-bar');
          if (bar) bar.style.width = pct;
        }
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
      } else if (event.type === 'chain') {
        audio.playActivate();
      } else if (event.type === 'attack') {
        audio.playAttack();
      } else if (event.type === 'damage') {
        audio.playDamage();
      } else if (event.type === 'prompt') {
        showPromptUI(event.message);
      }
    });

    logDrawer.innerHTML = '';
    appendLog('=== DUEL COMMENCED ===');
    await stepUntilPrompt();
  };

  // 10. Phase Orb Step Action Buttons (Screenshot 2 & 3)
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

  // 11. Circular Bottom-Right HUD Buttons (Screenshot 2 & 3)
  const autoPlayBtn = document.getElementById('btn-auto-play');
  autoPlayBtn?.addEventListener('click', () => {
    if (autoPlayInterval) {
      clearInterval(autoPlayInterval);
      autoPlayInterval = null;
      autoPlayBtn.classList.remove('active');
      runner?.setPlayer0Bot(false);
    } else {
      promptModal.classList.add('hidden');
      closePopover();
      closeSelectionModal();
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

  // Toggle Auto QE Mode
  const qeBtn = document.getElementById('btn-qe-auto');
  qeBtn?.addEventListener('click', () => {
    qeBtn.classList.toggle('active');
    audio.playSelect();
  });

  // Toggle Duel Event Log Drawer
  const logBtn = document.getElementById('btn-toggle-log');
  logBtn?.addEventListener('click', () => {
    logDrawer.classList.toggle('hidden');
    audio.playSelect();
  });

  // Toggle Card Inspector Drawer
  const inspectToggleBtn = document.getElementById('btn-toggle-inspect');
  const cardInspector = document.getElementById('card-inspector');
  inspectToggleBtn?.addEventListener('click', () => {
    cardInspector?.classList.toggle('hidden');
    audio.playSelect();
  });

  // Return to Menu
  document.getElementById('btn-menu-return')?.addEventListener('click', () => {
    if (confirm('Return to Main Menu? Duel in progress will be closed.')) {
      if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
      }
      duelContainer.classList.add('hidden');
      mainMenuContainer.classList.remove('hidden');
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

  // 11. Initialize Main Menu
  const mainMenu = new MainMenu(mainMenuContainer, audio, {
    onStartDuel: (config) => {
      startDuel(config);
    },
    onOpenDeckEditor: () => {
      mainMenuContainer.classList.add('hidden');
      deckEditorContainer.classList.remove('hidden');
      const p = mainMenu.getProfile();
      const currentDeckText = deckStore.get(p.playerDeckName) ?? '';
      deckEditor.loadDeckFromYdk(p.playerDeckName.replace(/^custom:/, ''), currentDeckText);
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
