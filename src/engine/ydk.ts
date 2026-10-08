// Parser/serializer de decks no formato .ydk (YGOPro)
export interface Deck {
  name?: string;
  main: number[];
  extra: number[];
  side: number[];
}

export function parseYdk(text: string, name?: string): Deck {
  const deck: Deck = { name, main: [], extra: [], side: [] };
  let section: keyof Omit<Deck, 'name'> = 'main';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#main')) section = 'main';
    else if (line.startsWith('#extra')) section = 'extra';
    else if (line.startsWith('!side')) section = 'side';
    else if (line.startsWith('#') || line.startsWith('!')) continue;
    else {
      const code = Number.parseInt(line, 10);
      if (Number.isFinite(code) && code > 0) deck[section].push(code);
    }
  }
  return deck;
}

export function toYdk(deck: Deck): string {
  return [
    '#created by MDPro Web',
    '#main',
    ...deck.main.map(String),
    '#extra',
    ...deck.extra.map(String),
    '!side',
    ...deck.side.map(String),
    '',
  ].join('\n');
}

export type ParsedDeck = Deck;
export const serializeYdk = toYdk;
