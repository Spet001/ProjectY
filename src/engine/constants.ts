// Constantes do ygopro-core usadas pelo cliente (subconjunto de common.h)
export const LOCATION = {
  DECK: 0x01,
  HAND: 0x02,
  MZONE: 0x04,
  SZONE: 0x08,
  GRAVE: 0x10,
  REMOVED: 0x20,
  EXTRA: 0x40,
  OVERLAY: 0x80,
  ONFIELD: 0x0c,
} as const;

export const POS = {
  FACEUP_ATTACK: 0x1,
  FACEDOWN_ATTACK: 0x2,
  FACEUP_DEFENSE: 0x4,
  FACEDOWN_DEFENSE: 0x8,
  FACEUP: 0x5,
  FACEDOWN: 0xa,
  ATTACK: 0x3,
  DEFENSE: 0xc,
} as const;

export const TYPE = {
  MONSTER: 0x1,
  SPELL: 0x2,
  TRAP: 0x4,
  NORMAL: 0x10,
  EFFECT: 0x20,
  FUSION: 0x40,
  RITUAL: 0x80,
  TRAPMONSTER: 0x100,
  SPIRIT: 0x200,
  UNION: 0x400,
  GEMINI: 0x800,
  TUNER: 0x1000,
  SYNCHRO: 0x2000,
  TOKEN: 0x4000,
  QUICKPLAY: 0x10000,
  CONTINUOUS: 0x20000,
  EQUIP: 0x40000,
  FIELD: 0x80000,
  COUNTER: 0x100000,
  FLIP: 0x200000,
  TOON: 0x400000,
  XYZ: 0x800000,
  PENDULUM: 0x1000000,
  SPSUMMON: 0x2000000,
  LINK: 0x4000000,
} as const;

export const EXTRA_DECK_TYPES = TYPE.FUSION | TYPE.SYNCHRO | TYPE.XYZ | TYPE.LINK;

export const PHASE = {
  DRAW: 0x01,
  STANDBY: 0x02,
  MAIN1: 0x04,
  BATTLE_START: 0x08,
  BATTLE_STEP: 0x10,
  DAMAGE: 0x20,
  DAMAGE_CAL: 0x40,
  BATTLE: 0x80,
  MAIN2: 0x100,
  END: 0x200,
} as const;

// Flags de consulta (query_card / query_field_card)
export const QUERY = {
  CODE: 0x1,
  POSITION: 0x2,
  ALIAS: 0x4,
  TYPE: 0x8,
  LEVEL: 0x10,
  RANK: 0x20,
  ATTRIBUTE: 0x40,
  RACE: 0x80,
  ATTACK: 0x100,
  DEFENSE: 0x200,
  BASE_ATTACK: 0x400,
  BASE_DEFENSE: 0x800,
  REASON: 0x1000,
  REASON_CARD: 0x2000,
  EQUIP_CARD: 0x4000,
  TARGET_CARD: 0x8000,
  OVERLAY_CARD: 0x10000,
  COUNTERS: 0x20000,
  OWNER: 0x40000,
  STATUS: 0x80000,
  LSCALE: 0x200000,
  RSCALE: 0x400000,
  LINK: 0x800000,
} as const;

/** Master Rule 2020 (regra atual) */
export const DUEL_RULE_MR5 = 5;
