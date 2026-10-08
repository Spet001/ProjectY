/**
 * Deck store: unifies prebuilt decks (from /api/decks, keys "Name.ydk")
 * and user decks (localStorage, listed through an index key "custom:<Name>").
 */
const PREFIX = 'mdpro_deck_';
const CUSTOM = 'custom:';

let prebuilt: Record<string, string> = {};

export const deckStore = {
  setPrebuilt(decks: Record<string, string>) {
    prebuilt = decks;
  },

  /** All deck keys: prebuilt first, then custom. */
  keys(): string[] {
    return [...Object.keys(prebuilt), ...this.customKeys()];
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

  label(key: string): string {
    if (this.isCustom(key)) return '★ ' + key.slice(CUSTOM.length);
    return key.replace(/\.ydk$/i, '');
  },

  get(key: string): string | undefined {
    if (this.isCustom(key)) return localStorage.getItem(PREFIX + key.slice(CUSTOM.length)) ?? undefined;
    return prebuilt[key] ?? prebuilt[key + '.ydk'];
  },

  saveCustom(name: string, ydk: string): string {
    localStorage.setItem(PREFIX + name, ydk);
    return CUSTOM + name;
  },

  deleteCustom(key: string) {
    if (this.isCustom(key)) localStorage.removeItem(PREFIX + key.slice(CUSTOM.length));
  },
};
