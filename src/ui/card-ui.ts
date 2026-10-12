import { TYPE, LOCATION } from '../engine/constants';
import { type CardData, type CardDatabase, getCardTypeInfo, RACE_NAMES } from '../engine/card-database';
import { getFrameTextureName } from '../render/card-texture';

export function getAttributeIconUrl(card: CardData | null): string {
  if (!card) return '/texture/GUI_T_Icon1_Attr01.png';
  if (card.type & TYPE.SPELL) return '/texture/GUI_T_Icon1_Attr08.png';
  if (card.type & TYPE.TRAP) return '/texture/GUI_T_Icon1_Attr09.png';

  switch (card.attribute) {
    case 0x10:
      return '/texture/GUI_T_Icon1_Attr01.png'; // LIGHT
    case 0x20:
      return '/texture/GUI_T_Icon1_Attr02.png'; // DARK
    case 0x02:
      return '/texture/GUI_T_Icon1_Attr03.png'; // WATER
    case 0x04:
      return '/texture/GUI_T_Icon1_Attr04.png'; // FIRE
    case 0x01:
      return '/texture/GUI_T_Icon1_Attr05.png'; // EARTH
    case 0x08:
      return '/texture/GUI_T_Icon1_Attr06.png'; // WIND
    case 0x40:
      return '/texture/GUI_T_Icon1_Attr07.png'; // DIVINE
    default:
      return '/texture/GUI_T_Icon1_Attr01.png';
  }
}

export function getRaceIconUrl(race: number): string {
  const bitIndex = Math.round(Math.log2(race || 1)) + 1;
  const idx = Math.max(1, Math.min(26, bitIndex));
  return `/texture/GUI_T_Icon1_Type${String(idx).padStart(2, '0')}.png`;
}

export function getSpellTrapSubIconUrl(type: number): string | null {
  if (type & TYPE.EQUIP) return '/texture/GUI_T_Icon1_Icon01.png';
  if (type & TYPE.FIELD) return '/texture/GUI_T_Icon1_Icon02.png';
  if (type & TYPE.QUICKPLAY) return '/texture/GUI_T_Icon1_Icon03.png';
  if (type & TYPE.RITUAL) return '/texture/GUI_T_Icon1_Icon04.png';
  if (type & TYPE.CONTINUOUS) return '/texture/GUI_T_Icon1_Icon05.png';
  if (type & TYPE.COUNTER) return '/texture/GUI_T_Icon1_Icon06.png';
  return null;
}

export function getCardRarity(card: CardData | null, code: number): 'UR' | 'SR' | 'R' | 'N' {
  if (!card) return 'N';
  if (card.type & (TYPE.FUSION | TYPE.SYNCHRO | TYPE.XYZ | TYPE.LINK)) {
    return (code % 3 === 0) ? 'SR' : 'UR';
  }
  if ((card.atk ?? 0) >= 2500 || (card.level ?? 0) >= 8) return 'UR';
  if ((card.atk ?? 0) >= 1800 || (card.type & TYPE.RITUAL)) return 'SR';
  const h = code % 10;
  if (h < 2) return 'UR';
  if (h < 5) return 'SR';
  if (h < 8) return 'R';
  return 'N';
}

export function getLocationBadgeInfo(loc?: number): { label: string; cls: string } | null {
  if (!loc) return null;
  if (loc & LOCATION.DECK) return { label: 'DECK', cls: 'loc-deck' };
  if (loc & LOCATION.EXTRA) return { label: 'EX', cls: 'loc-extra' };
  if (loc & LOCATION.GRAVE) return { label: 'GY', cls: 'loc-grave' };
  if (loc & LOCATION.REMOVED) return { label: 'BAN', cls: 'loc-banish' };
  if (loc & LOCATION.HAND) return { label: 'HAND', cls: 'loc-hand' };
  if (loc & (LOCATION.MZONE | LOCATION.SZONE)) return { label: 'FIELD', cls: 'loc-field' };
  return null;
}

export interface FramedCardOptions {
  showRarity?: boolean;
  location?: number;
  copyCount?: number;
  limitCount?: number;
  extraClass?: string;
  showLevelOverlay?: boolean;
}

/**
 * Renders a Yu-Gi-Oh! card with its authentic Master Duel border/frame + artwork + badges.
 */
export function renderFramedCardHTML(
  card: CardData | null,
  code: number,
  opts: FramedCardOptions = {}
): string {
  const frameFile = getFrameTextureName(card);
  const isPendulum = Boolean(card && (card.type & TYPE.PENDULUM));
  const isMonster = Boolean(card && (card.type & TYPE.MONSTER));
  const isLink = Boolean(card && (card.type & TYPE.LINK));
  const isXyz = Boolean(card && (card.type & TYPE.XYZ));
  const rarity = getCardRarity(card, code);
  const locInfo = getLocationBadgeInfo(opts.location);
  const attrIcon = getAttributeIconUrl(card);
  const titleColor =
    card && (card.type & (TYPE.SPELL | TYPE.TRAP | TYPE.XYZ | TYPE.LINK | TYPE.FUSION | TYPE.RITUAL))
      ? '#ffffff'
      : '#141414';

  let levelBadgeHTML = '';
  if (opts.showLevelOverlay !== false && card && isMonster) {
    const lv = card.level & 0xff;
    const lvIcon = isLink
      ? '/texture/GUI_T_Icon1_Other_Link.png'
      : isXyz
      ? '/texture/GUI_T_Icon1_Other_Rank.png'
      : '/texture/GUI_T_Icon1_Other_Level.png';
    levelBadgeHTML = `
      <div class="framed-card-lv-badge">
        <img src="${lvIcon}" class="lv-badge-icon" alt="" />
        <span>${lv}</span>
      </div>
    `;
  }

  let statMiniHTML = '';
  if (card && isMonster) {
    const atkStr = card.atk === -2 ? '?' : String(card.atk ?? 0);
    const defStr = isLink ? `LINK-${card.level & 0xff}` : card.def === -2 ? '?' : String(card.def ?? 0);
    statMiniHTML = `<div class="framed-card-mini-stats">${atkStr}/${defStr}</div>`;
  }

  return `
    <div class="md-framed-card-wrap ${opts.extraClass ?? ''}" data-code="${code}">
      ${locInfo ? `<div class="md-card-loc-tab ${locInfo.cls}">${locInfo.label}</div>` : ''}
      ${opts.showRarity !== false ? `<div class="md-rarity-pill rarity-${rarity.toLowerCase()}">${rarity}</div>` : ''}
      ${opts.limitCount !== undefined && opts.limitCount < 3 ? `<div class="md-limit-badge limit-${opts.limitCount}">${opts.limitCount}</div>` : ''}
      <div class="md-framed-card ${isPendulum ? 'is-pendulum' : ''}">
        <img src="/pics/${code}.jpg" class="md-framed-art" alt="${card?.name ?? code}" loading="lazy" />
        <img src="/texture/${frameFile}" class="md-framed-border" alt="" />
        <div class="md-framed-title-bar" style="color: ${titleColor};">
          <span class="md-framed-title-text">${card?.name ?? ''}</span>
          <img src="${attrIcon}" class="md-framed-attr-icon" alt="" />
        </div>
        <div class="md-framed-lore-lines">
          <div class="lore-line"></div>
          <div class="lore-line"></div>
          <div class="lore-line short"></div>
        </div>
        ${statMiniHTML}
      </div>
      ${levelBadgeHTML}
      ${opts.copyCount !== undefined ? `<div class="md-copy-count-badge">${opts.copyCount}</div>` : ''}
    </div>
  `;
}

/**
 * Splits a card's description into individual effect clauses so active effects can be highlighted.
 */
export function splitCardEffects(desc: string): string[] {
  if (!desc) return [];
  const normalized = desc.replace(/\r\n/g, '\n').trim();

  // Check if bulleted with ●
  if (normalized.includes('●')) {
    const parts = normalized.split(/(?=●)/g).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // Split by newlines first
  const lines = normalized.split('\n').map((s) => s.trim()).filter(Boolean);
  const clauses: string[] = [];

  for (const line of lines) {
    // Split sentences that start a new activated/trigger effect
    const subParts = line
      .split(/(?<=\.)\s+(?=(?:You can|If |When |During |Once per turn|Quick Effect|\(Quick Effect\)|Cannot |Must ))/g)
      .map((s) => s.trim())
      .filter(Boolean);
    clauses.push(...subParts);
  }

  return clauses.length > 0 ? clauses : [normalized];
}

function getEffectPoolForCard(card: CardData | null): string[] {
  const clauses = card ? splitCardEffects(card.desc) : [];
  // Filter clauses that look like actual effects (skip pure material line like "1 'Tearlaments' monster + 1 Aqua monster")
  const effectClauses = clauses.filter(
    (c, idx) =>
      !(
        idx === 0 &&
        clauses.length > 1 &&
        c.length < 95 &&
        !c.includes(':') &&
        !c.includes(';')
      ) && !/^You can only use /i.test(c)
  );
  return effectClauses.length > 0 ? effectClauses : clauses;
}

/**
 * Resolves the true owner CardData from an array of YGOPro effect description codes (`aux.Stringid(id, i)` = `id * 16 + i`).
 */
export function resolveCardFromDescriptions(
  rawDescriptions: number[],
  fallbackCard: CardData | null,
  cardDb: CardDatabase
): CardData | null {
  for (const d of rawDescriptions) {
    if (d > 10000) {
      const ownerId = Math.floor(d / 16);
      const found = cardDb.getCard(ownerId);
      if (found) return found;
    }
  }
  return fallbackCard;
}

/**
 * Extracts human-readable effect options for a card when multiple effects or options are available.
 */
export function extractCardEffectOptions(
  card: CardData | null,
  rawDescriptions: number[],
  cardDb: CardDatabase
): string[] {
  const defaultPool = getEffectPoolForCard(card);

  if (!rawDescriptions || rawDescriptions.length === 0) {
    return defaultPool.length > 0 ? defaultPool : [card?.desc || 'Activate this card\'s effect.'];
  }

  return rawDescriptions.map((d, idx) => {
    // 1. Card-specific str1..str16 encoded via aux.Stringid(id, i) = (id * 16) + i
    if (d > 10000) {
      const ownerId = Math.floor(d / 16);
      const effectOffset = d % 16; // 0-indexed effect slot
      const targetCard = cardDb.getCard(ownerId) ?? card;
      const pool = getEffectPoolForCard(targetCard);

      const strKey = `str${effectOffset + 1}` as keyof CardData;
      const cardStr = targetCard?.[strKey];
      const matchedClause = pool[effectOffset] ?? pool[idx] ?? pool[pool.length - 1];

      if (typeof cardStr === 'string' && cardStr.trim().length > 0) {
        return matchedClause && matchedClause.length > cardStr.length && !matchedClause.includes(cardStr)
          ? `${cardStr} — ${matchedClause}`
          : cardStr;
      }
      if (matchedClause) return matchedClause;
    }

    // 2. System strings (e.g. 1190 = "Add to hand", 1191 = "Send to GY")
    // Return system string directly without concatenating unrelated card clauses!
    if (d > 0 && d <= 10000) {
      const sys = cardDb.getSystemString(d);
      if (sys && sys.trim().length > 0) {
        return sys;
      }
    }

    // 3. Fallback to effect clause from card description
    return defaultPool[idx] ?? defaultPool[defaultPool.length - 1] ?? card?.desc ?? `Effect #${idx + 1}`;
  });
}

export interface InspectorHighlightInfo {
  activeEffectIndex?: number;
  activeEffectText?: string;
  highlightActivatable?: boolean;
}

/**
 * Renders the Master Duel Left Card Inspector (Screenshots 2, 4, 5, mutiplos efeitos.png).
 */
export function renderCardInspectorHTML(
  card: CardData | null,
  code: number,
  highlight?: InspectorHighlightInfo
): string {
  const cardCode = card?.id ?? code ?? 89631139;
  const name = card?.name ?? `Card #${cardCode}`;
  const attrIcon = getAttributeIconUrl(card);

  if (!card) {
    return `
      <div class="md-inspector-panel">
        <div class="md-inspector-title-bar">
          <span class="md-inspector-name">${name}</span>
          <img src="${attrIcon}" class="md-inspector-attr-img" alt="" />
        </div>
        <div class="md-inspector-top-body">
          <div class="md-inspector-card-col">
            ${renderFramedCardHTML(null, cardCode, { showRarity: false })}
          </div>
          <div class="md-inspector-stats-col"></div>
        </div>
        <div class="md-inspector-type-bar">[Unknown Card]</div>
        <div class="md-inspector-desc-box">Hover over a card to view its details.</div>
      </div>
    `;
  }

  const typeInfo = getCardTypeInfo(card);
  const isMonster = typeInfo.category === 'Monster';
  const isLink = Boolean(card.type & TYPE.LINK);
  const isXyz = Boolean(card.type & TYPE.XYZ);

  let rightStatsHTML = '';
  let typeBarText = '';
  let typeBarClass = 'effect';

  if (isMonster) {
    const lv = card.level & 0xff;
    const lvIcon = isLink
      ? '/texture/GUI_T_Icon1_Other_Link.png'
      : isXyz
      ? '/texture/GUI_T_Icon1_Other_Rank.png'
      : '/texture/GUI_T_Icon1_Other_Level.png';
    const raceIcon = getRaceIconUrl(card.race);
    const atkStr = card.atk === -2 ? '?' : String(card.atk ?? 0);
    const defStr = card.def === -2 ? '?' : String(card.def ?? 0);

    rightStatsHTML = `
      <div class="md-stat-line level-race-line">
        <div class="md-stat-pair">
          <img src="${lvIcon}" class="md-stat-icon" alt="Level" />
          <span class="md-stat-num">${lv}</span>
        </div>
        <img src="${raceIcon}" class="md-race-icon" title="${RACE_NAMES[card.race] ?? ''}" alt="" />
      </div>
      <div class="md-stat-line">
        <span class="md-stat-symbol atk-sym">⚔</span>
        <span class="md-stat-num">${atkStr}</span>
      </div>
      ${
        !isLink
          ? `
        <div class="md-stat-line">
          <span class="md-stat-symbol def-sym">🛡</span>
          <span class="md-stat-num">${defStr}</span>
        </div>
      `
          : ''
      }
    `;

    const raceName = RACE_NAMES[card.race] ?? 'Monster';
    typeBarText = `[${raceName}/${typeInfo.subType.replace(/\s*\/\s*/g, '/')}]`;
    if (card.type & TYPE.NORMAL) typeBarClass = 'normal';
    else if (card.type & TYPE.FUSION) typeBarClass = 'fusion';
    else if (card.type & TYPE.SYNCHRO) typeBarClass = 'synchro';
    else if (card.type & TYPE.XYZ) typeBarClass = 'xyz';
    else if (card.type & TYPE.LINK) typeBarClass = 'link';
    else if (card.type & TYPE.RITUAL) typeBarClass = 'ritual';
  } else {
    const subIcon = getSpellTrapSubIconUrl(card.type);
    const labelEn =
      typeInfo.category === 'Spell'
        ? typeInfo.subType === 'Quick-Play'
          ? 'Quick-Play Spell'
          : typeInfo.subType === 'Continuous'
          ? 'Continuous Spell'
          : typeInfo.subType === 'Field'
          ? 'Field Spell'
          : typeInfo.subType === 'Equip'
          ? 'Equip Spell'
          : typeInfo.subType === 'Ritual'
          ? 'Ritual Spell'
          : 'Normal Spell'
        : typeInfo.subType === 'Continuous'
        ? 'Continuous Trap'
        : typeInfo.subType === 'Counter'
        ? 'Counter Trap'
        : 'Normal Trap';

    rightStatsHTML = `
      <div class="md-stat-line spell-trap-line">
        ${subIcon ? `<img src="${subIcon}" class="md-stat-icon" alt="" />` : ''}
        <span class="md-st-label">${labelEn}</span>
      </div>
    `;
    typeBarText = typeInfo.category === 'Spell' ? '[Spell Card]' : '[Trap Card]';
    typeBarClass = typeInfo.category === 'Spell' ? 'spell' : 'trap';
  }

  // Format description and highlight active effect in cyan (#38e8ff)
  const clauses = splitCardEffects(card.desc);
  let targetHighlightIdx = -1;

  if (highlight?.activeEffectText) {
    // Strip any prefix before " — " if present
    const cleanTarget = highlight.activeEffectText.includes(' — ')
      ? highlight.activeEffectText.split(' — ').slice(1).join(' — ')
      : highlight.activeEffectText;
    const found = clauses.findIndex(
      (c) => c.includes(cleanTarget) || cleanTarget.includes(c)
    );
    if (found !== -1) targetHighlightIdx = found;
  }
  if (targetHighlightIdx === -1 && highlight?.activeEffectIndex !== undefined) {
    const offset =
      clauses.length > 1 && clauses[0].length < 95 && !clauses[0].includes(':') && !clauses[0].includes(';')
        ? 1
        : 0;
    targetHighlightIdx = Math.min(clauses.length - 1, highlight.activeEffectIndex + offset);
  }
  if (targetHighlightIdx === -1 && highlight?.highlightActivatable && clauses.length > 0) {
    const firstActionable = clauses.findIndex(
      (c) => c.includes(':') || c.includes(';') || /you can|if |when |during /i.test(c)
    );
    targetHighlightIdx = firstActionable !== -1 ? firstActionable : 0;
  }

  const descHTML = clauses
    .map((clause, i) => {
      const isHighlighted = i === targetHighlightIdx;
      return `<p class="md-desc-clause ${isHighlighted ? 'active-effect-highlight' : ''}">${clause}</p>`;
    })
    .join('');

  return `
    <div class="md-inspector-panel">
      <div class="md-inspector-title-bar">
        <span class="md-inspector-name" title="${name}">${name}</span>
        <img src="${attrIcon}" class="md-inspector-attr-img" alt="" />
      </div>
      <div class="md-inspector-top-body">
        <div class="md-inspector-card-col">
          ${renderFramedCardHTML(card, cardCode, { showRarity: true, showLevelOverlay: false })}
        </div>
        <div class="md-inspector-stats-col">
          ${rightStatsHTML}
        </div>
      </div>
      <div class="md-inspector-type-bar type-${typeBarClass}">${typeBarText}</div>
      <div class="md-inspector-desc-box">${descHTML}</div>
    </div>
  `;
}

/**
 * Renders a 2D face-down card back for hidden opponent cards in targeting drawers.
 */
export function renderHiddenFramedCardHTML(extraClass = 'size-md', location?: number): string {
  const locInfo = getLocationBadgeInfo(location);
  return `
    <div class="md-framed-card-wrap ${extraClass}" data-code="0">
      ${locInfo ? `<div class="md-card-loc-tab ${locInfo.cls}">${locInfo.label}</div>` : ''}
      <div class="md-framed-card">
        <img src="/texture/DefaultProtector.png" class="md-framed-border" alt="Face-Down Card" />
      </div>
    </div>
  `;
}

/**
 * Renders the Left Card Inspector for a hidden opponent card (Opponent's Hand / Face-Down Set Card).
 */
export function renderHiddenCardInspectorHTML(location: number): string {
  const zoneLabel =
    location & LOCATION.HAND
      ? "Opponent's Hand"
      : location & LOCATION.MZONE
      ? 'Face-Down Monster (Set)'
      : location & LOCATION.SZONE
      ? 'Face-Down Spell / Trap (Set)'
      : location & LOCATION.EXTRA
      ? "Opponent's Extra Deck"
      : 'Face-Down Card';

  return `
    <div class="md-inspector-panel">
      <div class="md-inspector-title-bar">
        <span class="md-inspector-name">??? (Hidden Card)</span>
      </div>
      <div class="md-inspector-top-body">
        <div class="md-inspector-card-col">
          ${renderHiddenFramedCardHTML('size-md')}
        </div>
        <div class="md-inspector-stats-col">
          <div class="md-stat-line">
            <span style="color: #8b9bb4; font-size: 12px;">${zoneLabel}</span>
          </div>
          <div class="md-stat-line">
            <span class="md-stat-symbol atk-sym">ATK</span>
            <span class="md-stat-num">?</span>
          </div>
          <div class="md-stat-line">
            <span class="md-stat-symbol def-sym">DEF</span>
            <span class="md-stat-num">?</span>
          </div>
        </div>
      </div>
      <div class="md-inspector-type-bar">[Hidden Knowledge]</div>
      <div class="md-inspector-desc-box">
        <p class="md-desc-clause" style="color: #94a3b8;">
          This card is face-down or in your opponent's hand. Its identity will be revealed when it is flipped face-up or activated.
        </p>
      </div>
    </div>
  `;
}

