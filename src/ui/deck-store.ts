/**
 * Deck store: unifies prebuilt decks (from /api/decks, keys "Name.ydk")
 * and user decks (localStorage, listed through an index key "custom:<Name>"),
 * plus per-deck Binder/DeckCase metadata ("mdpro_deckcase_<Name>").
 */
const PREFIX = 'mdpro_deck_';
const CASE_PREFIX = 'mdpro_deckcase_';
const SEEDED_KEY = 'mdpro_decks_seeded_v1';
const CUSTOM = 'custom:';

let prebuilt: Record<string, string> = {};

export const deckStore = {
  setPrebuilt(decks: Record<string, string>) {
    prebuilt = decks;
    // Seed starter custom decks if user has none yet
    try {
      if (!localStorage.getItem(SEEDED_KEY) && this.customKeys().length === 0) {
        const starters: Array<{ file: string; name: string; caseIcon: string }> = [
          { file: 'AI_BlueEyes.ydk', name: 'Blue-Eyes Championship', caseIcon: 'DeckCase0001_L.png' },
          { file: 'AI_Tearlaments.ydk', name: 'Tearlaments Ishizu', caseIcon: 'DeckCase0005_L.png' },
          { file: 'AI_DarkMagician.ydk', name: 'Dark Magician', caseIcon: 'DeckCase0002_L.png' },
          { file: 'AI_Swordsoul.ydk', name: 'Swordsoul Tenyi', caseIcon: 'DeckCase0008_L.png' },
        ];
        for (const s of starters) {
          if (decks[s.file]) {
            this.saveCustom(s.name, decks[s.file], s.caseIcon);
          }
        }
        localStorage.setItem(SEEDED_KEY, '1');
      }
    } catch {}
  },

  prebuiltKeys(): string[] {
    return Object.keys(prebuilt).sort();
  },

  /** All deck keys: custom first, then prebuilt. */
  keys(): string[] {
    return [...this.customKeys(), ...this.prebuiltKeys()];
  },

  customKeys(): string[] {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) out.push(CUSTOM + k.slice(PREFIX.length));
    }
    return out.sort();
  },

  isCustom(key: string): boolean {
    return key.startsWith(CUSTOM);
  },

  rawName(key: string): string {
    if (this.isCustom(key)) return key.slice(CUSTOM.length);
    return key.replace(/\.ydk$/i, '');
  },

  label(key: string): string {
    if (this.isCustom(key)) return '★ ' + key.slice(CUSTOM.length);
    return key.replace(/\.ydk$/i, '');
  },

  get(key: string): string | undefined {
    if (this.isCustom(key)) return localStorage.getItem(PREFIX + key.slice(CUSTOM.length)) ?? undefined;
    return prebuilt[key] ?? prebuilt[key + '.ydk'] ?? localStorage.getItem(PREFIX + key) ?? undefined;
  },

  getCaseIcon(keyOrName: string): string {
    const clean = keyOrName.startsWith(CUSTOM) ? keyOrName.slice(CUSTOM.length) : keyOrName.replace(/\.ydk$/i, '');
    return localStorage.getItem(CASE_PREFIX + clean) || 'DeckCase0001_L.png';
  },

  setCaseIcon(keyOrName: string, caseIcon: string) {
    const clean = keyOrName.startsWith(CUSTOM) ? keyOrName.slice(CUSTOM.length) : keyOrName.replace(/\.ydk$/i, '');
    try {
      localStorage.setItem(CASE_PREFIX + clean, caseIcon);
    } catch {}
  },

  saveCustom(name: string, ydk: string, caseIcon?: string): string {
    const clean = name.trim() || 'Deck';
    localStorage.setItem(PREFIX + clean, ydk);
    if (caseIcon) {
      localStorage.setItem(CASE_PREFIX + clean, caseIcon);
    } else if (!localStorage.getItem(CASE_PREFIX + clean)) {
      localStorage.setItem(CASE_PREFIX + clean, 'DeckCase0001_L.png');
    }
    return CUSTOM + clean;
  },

  renameCustom(oldName: string, newName: string): string {
    const cleanOld = oldName.startsWith(CUSTOM) ? oldName.slice(CUSTOM.length) : oldName;
    const cleanNew = newName.trim() || cleanOld;
    if (cleanOld === cleanNew) return CUSTOM + cleanNew;

    const ydk = localStorage.getItem(PREFIX + cleanOld) ?? '';
    const caseIcon = this.getCaseIcon(cleanOld);
    localStorage.removeItem(PREFIX + cleanOld);
    localStorage.removeItem(CASE_PREFIX + cleanOld);
    return this.saveCustom(cleanNew, ydk, caseIcon);
  },

  deleteCustom(key: string) {
    const clean = this.isCustom(key) ? key.slice(CUSTOM.length) : key;
    localStorage.removeItem(PREFIX + clean);
    localStorage.removeItem(CASE_PREFIX + clean);
  },
};
