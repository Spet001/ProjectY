import type { Database } from 'sql.js';
import { TYPE } from './constants';

export interface CardData {
  id: number;
  ot: number;
  alias: number;
  setcode: bigint | number;
  type: number;
  atk: number;
  def: number;
  level: number;
  race: number;
  attribute: number;
  category: number;
  name: string;
  desc: string;
  str1?: string;
  str2?: string;
  str3?: string;
  str4?: string;
  str5?: string;
  str6?: string;
  str7?: string;
  str8?: string;
  str9?: string;
  str10?: string;
  str11?: string;
  str12?: string;
  str13?: string;
  str14?: string;
  str15?: string;
  str16?: string;
}

export const RACE_NAMES: Record<number, string> = {
  0x1: 'Warrior',
  0x2: 'Spellcaster',
  0x4: 'Fairy',
  0x8: 'Fiend',
  0x10: 'Zombie',
  0x20: 'Machine',
  0x40: 'Aqua',
  0x80: 'Pyro',
  0x100: 'Rock',
  0x200: 'Winged Beast',
  0x400: 'Plant',
  0x800: 'Insect',
  0x1000: 'Thunder',
  0x2000: 'Dragon',
  0x4000: 'Beast',
  0x8000: 'Beast-Warrior',
  0x10000: 'Dinosaur',
  0x20000: 'Fish',
  0x40000: 'Sea Serpent',
  0x80000: 'Reptile',
  0x100000: 'Psychic',
  0x200000: 'Divine-Beast',
  0x400000: 'Creator God',
  0x800000: 'Wyrm',
  0x1000000: 'Cyberse',
  0x2000000: 'Illusion',
};

export const ATTRIBUTE_NAMES: Record<number, string> = {
  0x01: 'EARTH',
  0x02: 'WATER',
  0x04: 'FIRE',
  0x08: 'WIND',
  0x10: 'LIGHT',
  0x20: 'DARK',
  0x40: 'DIVINE',
};

export class CardDatabase {
  private db: Database;
  private stringMap = new Map<number, string>();
  private cache = new Map<number, CardData>();

  constructor(db: Database, stringsContent?: string) {
    this.db = db;
    if (stringsContent) {
      this.parseStrings(stringsContent);
    }
  }

  private parseStrings(content: string) {
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('!system')) {
        const parts = line.split(/\s+/);
        const idx = Number.parseInt(parts[1], 10);
        const text = line.substring(line.indexOf(parts[1]) + parts[1].length).trim();
        if (Number.isFinite(idx)) {
          this.stringMap.set(idx, text);
        }
      }
    }
  }

  getSystemString(id: number): string | undefined {
    return this.stringMap.get(id);
  }

  getCard(id: number): CardData | null {
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    const query = `
      SELECT d.id, d.ot, d.alias, d.setcode, d.type, d.atk, d.def, d.level, d.race, d.attribute, d.category,
             t.name, t.desc, t.str1, t.str2, t.str3, t.str4, t.str5, t.str6, t.str7, t.str8,
             t.str9, t.str10, t.str11, t.str12, t.str13, t.str14, t.str15, t.str16
      FROM datas d
      LEFT JOIN texts t ON d.id = t.id
      WHERE d.id = ?
    `;

    const res = this.db.exec(query, [id]);
    if (!res || res.length === 0 || res[0].values.length === 0) {
      return null;
    }

    const row = res[0].values[0];
    const card: CardData = {
      id: Number(row[0]),
      ot: Number(row[1]),
      alias: Number(row[2]),
      setcode: Number(row[3]),
      type: Number(row[4]),
      atk: Number(row[5]),
      def: Number(row[6]),
      level: Number(row[7]) & 0xff,
      race: Number(row[8]),
      attribute: Number(row[9]),
      category: Number(row[10]),
      name: String(row[11] ?? ''),
      desc: String(row[12] ?? ''),
      str1: row[13] ? String(row[13]) : undefined,
      str2: row[14] ? String(row[14]) : undefined,
      str3: row[15] ? String(row[15]) : undefined,
      str4: row[16] ? String(row[16]) : undefined,
      str5: row[17] ? String(row[17]) : undefined,
      str6: row[18] ? String(row[18]) : undefined,
      str7: row[19] ? String(row[19]) : undefined,
      str8: row[20] ? String(row[20]) : undefined,
      str9: row[21] ? String(row[21]) : undefined,
      str10: row[22] ? String(row[22]) : undefined,
      str11: row[23] ? String(row[23]) : undefined,
      str12: row[24] ? String(row[24]) : undefined,
      str13: row[25] ? String(row[25]) : undefined,
      str14: row[26] ? String(row[26]) : undefined,
      str15: row[27] ? String(row[27]) : undefined,
      str16: row[28] ? String(row[28]) : undefined,
    };

    this.cache.set(id, card);
    return card;
  }

  getName(id: number): string {
    const card = this.getCard(id);
    return card ? card.name : `Card #${id}`;
  }

  isMonster(type: number): boolean {
    return (type & TYPE.MONSTER) !== 0;
  }

  isSpell(type: number): boolean {
    return (type & TYPE.SPELL) !== 0;
  }

  isTrap(type: number): boolean {
    return (type & TYPE.TRAP) !== 0;
  }

  isExtraDeck(type: number): boolean {
    return (
      (type & TYPE.FUSION) !== 0 ||
      (type & TYPE.SYNCHRO) !== 0 ||
      (type & TYPE.XYZ) !== 0 ||
      (type & TYPE.LINK) !== 0
    );
  }

  getRaceName(race: number): string {
    return RACE_NAMES[race] ?? 'Unknown';
  }

  getAttributeName(attr: number): string {
    return ATTRIBUTE_NAMES[attr] ?? 'Unknown';
  }

  searchCards(
    keyword: string,
    limit = 60,
    filters?: {
      category?: string;
      attribute?: number;
      race?: number;
      level?: number;
      sort?: 'atk' | 'def' | 'level' | 'name';
    }
  ): CardData[] {
    const k = `%${keyword}%`;
    const whereClauses: string[] = [
      '(t.name LIKE ? OR t.desc LIKE ? OR CAST(d.id AS TEXT) LIKE ?)',
      `(d.type & ${TYPE.TOKEN}) = 0`,
    ];
    const params: any[] = [k, k, k];

    if (filters?.attribute) {
      whereClauses.push('d.attribute = ?');
      params.push(filters.attribute);
    }
    if (filters?.race) {
      whereClauses.push('d.race = ?');
      params.push(filters.race);
    }
    if (filters?.level !== undefined && filters.level >= 0) {
      whereClauses.push('(d.level & 255) = ?');
      params.push(filters.level);
    }
    if (filters?.category && filters.category !== 'all') {
      const cat = filters.category;
      if (cat === 'monster') {
        whereClauses.push(`(d.type & ${TYPE.MONSTER}) != 0 AND (d.type & ${TYPE.FUSION | TYPE.SYNCHRO | TYPE.XYZ | TYPE.LINK}) = 0`);
      } else if (cat === 'normal') {
        whereClauses.push(`(d.type & ${TYPE.NORMAL}) != 0`);
      } else if (cat === 'effect') {
        whereClauses.push(`(d.type & ${TYPE.EFFECT}) != 0 AND (d.type & ${TYPE.FUSION | TYPE.SYNCHRO | TYPE.XYZ | TYPE.LINK}) = 0`);
      } else if (cat === 'fusion') {
        whereClauses.push(`(d.type & ${TYPE.FUSION}) != 0`);
      } else if (cat === 'synchro') {
        whereClauses.push(`(d.type & ${TYPE.SYNCHRO}) != 0`);
      } else if (cat === 'xyz') {
        whereClauses.push(`(d.type & ${TYPE.XYZ}) != 0`);
      } else if (cat === 'link') {
        whereClauses.push(`(d.type & ${TYPE.LINK}) != 0`);
      } else if (cat === 'pendulum') {
        whereClauses.push(`(d.type & ${TYPE.PENDULUM}) != 0`);
      } else if (cat === 'ritual') {
        whereClauses.push(`(d.type & ${TYPE.RITUAL}) != 0 AND (d.type & ${TYPE.MONSTER}) != 0`);
      } else if (cat === 'spell') {
        whereClauses.push(`(d.type & ${TYPE.SPELL}) != 0`);
      } else if (cat === 'trap') {
        whereClauses.push(`(d.type & ${TYPE.TRAP}) != 0`);
      } else if (cat === 'extra') {
        whereClauses.push(`(d.type & ${TYPE.FUSION | TYPE.SYNCHRO | TYPE.XYZ | TYPE.LINK}) != 0`);
      }
    }

    let orderBy = 'd.atk DESC, d.level DESC, t.name ASC';
    if (filters?.sort === 'def') orderBy = 'd.def DESC, d.atk DESC';
    else if (filters?.sort === 'level') orderBy = '(d.level & 255) DESC, d.atk DESC';
    else if (filters?.sort === 'name') orderBy = 't.name ASC';

    params.push(limit);

    const query = `
      SELECT d.id, d.ot, d.alias, d.setcode, d.type, d.atk, d.def, d.level, d.race, d.attribute, d.category,
             t.name, t.desc
      FROM datas d
      JOIN texts t ON d.id = t.id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ?
    `;
    const res = this.db.exec(query, params);
    if (!res || res.length === 0) return [];
    return res[0].values.map((row) => ({
      id: Number(row[0]),
      ot: Number(row[1]),
      alias: Number(row[2]),
      setcode: Number(row[3]),
      type: Number(row[4]),
      atk: Number(row[5]),
      def: Number(row[6]),
      level: Number(row[7]) & 0xff,
      race: Number(row[8]),
      attribute: Number(row[9]),
      category: Number(row[10]),
      name: String(row[11] ?? ''),
      desc: String(row[12] ?? ''),
    }));
  }
}

export interface CardTypeInfo {
  category: 'Monster' | 'Spell' | 'Trap';
  subType: string;
  formattedType: string;
}

export function getCardTypeInfo(card: CardData): CardTypeInfo {
  const t = card.type;

  if (t & TYPE.SPELL) {
    let sub = 'Normal';
    if (t & TYPE.QUICKPLAY) sub = 'Quick-Play';
    else if (t & TYPE.FIELD) sub = 'Field';
    else if (t & TYPE.CONTINUOUS) sub = 'Continuous';
    else if (t & TYPE.EQUIP) sub = 'Equip';
    else if (t & TYPE.RITUAL) sub = 'Ritual';

    return {
      category: 'Spell',
      subType: sub,
      formattedType: `[SPELL CARD ✦ ${sub.toUpperCase()}]`,
    };
  }

  if (t & TYPE.TRAP) {
    let sub = 'Normal';
    if (t & TYPE.COUNTER) sub = 'Counter';
    else if (t & TYPE.CONTINUOUS) sub = 'Continuous';

    return {
      category: 'Trap',
      subType: sub,
      formattedType: `[TRAP CARD ✦ ${sub.toUpperCase()}]`,
    };
  }

  // Monster
  const parts: string[] = [];
  if (t & TYPE.FUSION) parts.push('Fusion');
  if (t & TYPE.SYNCHRO) parts.push('Synchro');
  if (t & TYPE.XYZ) parts.push('Xyz');
  if (t & TYPE.LINK) parts.push('Link');
  if (t & TYPE.RITUAL) parts.push('Ritual');
  if (t & TYPE.PENDULUM) parts.push('Pendulum');
  if (t & TYPE.TUNER) parts.push('Tuner');
  if (t & TYPE.FLIP) parts.push('Flip');
  if (t & TYPE.TOON) parts.push('Toon');
  if (t & TYPE.SPIRIT) parts.push('Spirit');
  if (t & TYPE.UNION) parts.push('Union');
  if (t & TYPE.GEMINI) parts.push('Gemini');
  if (t & TYPE.EFFECT) parts.push('Effect');
  if (t & TYPE.NORMAL) parts.push('Normal');
  if (t & TYPE.TOKEN) parts.push('Token');

  const subType = parts.length > 0 ? parts.join(' / ') : 'Monster';
  return {
    category: 'Monster',
    subType,
    formattedType: `[${subType}]`,
  };
}

