import type { CardDatabase, CardData } from '../engine/card-database';
import { deckStore } from './deck-store';
import { parseYdk, serializeYdk, type ParsedDeck } from '../engine/ydk';

export interface DeckEditorCallbacks {
  onDeckSaved?: (deckName: string, deckYdk: string) => void;
  onCardInspect?: (card: CardData) => void;
  onClose?: () => void;
}

export class DeckEditor {
  private container: HTMLElement;
  private cardDb: CardDatabase;
  private callbacks: DeckEditorCallbacks;
  private currentDeck: ParsedDeck;
  constructor(container: HTMLElement, cardDb: CardDatabase, callbacks: DeckEditorCallbacks = {}) {
    this.container = container;
    this.cardDb = cardDb;
    this.callbacks = callbacks;
    this.currentDeck = {
      name: 'Custom Deck',
      main: [],
      extra: [],
      side: [],
    };
  }

  public setPrebuiltDecks(decks: Record<string, string>) {
    deckStore.setPrebuilt(decks);
  }

  public loadDeckFromYdk(name: string, ydkText: string) {
    this.currentDeck = parseYdk(ydkText, name.replace('.ydk', ''));
    this.render();
  }

  public getCurrentDeck(): ParsedDeck {
    return this.currentDeck;
  }

  public getCurrentYdk(): string {
    return serializeYdk(this.currentDeck);
  }

  public render() {
    this.container.innerHTML = `
      <div class="deck-editor-modal">
        <!-- Top Toolbar -->
        <div class="deck-editor-header">
          <div class="deck-title-wrap">
            <span class="editor-icon">🎴</span>
            <input type="text" id="deck-name-input" class="deck-name-input" value="${this.currentDeck.name}" placeholder="Deck Name" />
          </div>
          <div class="deck-actions">
            <select id="deck-load-select" class="deck-select">
              <option value="">Load Deck...</option>
              ${deckStore.keys().map((k) => `<option value="${k}">${deckStore.label(k)}</option>`).join('')}
            </select>
            <button class="btn btn-secondary" id="btn-deck-new">New</button>
            <button class="btn btn-primary" id="btn-deck-save">Save Deck</button>
            <button class="btn btn-close" id="btn-deck-close">✕</button>
          </div>
        </div>

        <div class="deck-editor-body">
          <!-- Left: Deck View (Main & Extra) -->
          <div class="deck-builder-panel">
            <div class="deck-section-header">
              <span>MAIN DECK</span>
              <span class="deck-count-badge ${this.currentDeck.main.length < 40 ? 'warning' : 'valid'}">
                ${this.currentDeck.main.length} / 40-60
              </span>
            </div>
            <div class="card-grid main-grid" id="main-deck-grid"></div>

            <div class="deck-section-header" style="margin-top: 14px;">
              <span>EXTRA DECK</span>
              <span class="deck-count-badge ${this.currentDeck.extra.length > 15 ? 'warning' : 'valid'}">
                ${this.currentDeck.extra.length} / 15
              </span>
            </div>
            <div class="card-grid extra-grid" id="extra-deck-grid"></div>
          </div>

          <!-- Right: Card Search & Database Explorer -->
          <div class="card-search-panel">
            <div class="search-header">
              <input type="text" id="card-search-input" class="search-input" placeholder="Search cards by name or text..." />
              <div class="search-filters">
                <button class="filter-btn active" data-filter="all">All</button>
                <button class="filter-btn" data-filter="monster">Monster</button>
                <button class="filter-btn" data-filter="spell">Spell</button>
                <button class="filter-btn" data-filter="trap">Trap</button>
                <button class="filter-btn" data-filter="extra">Extra</button>
              </div>
            </div>
            <div class="search-results-grid" id="search-results-grid"></div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    this.renderDeckCards();
    this.performSearch('');
  }

  private bindEvents() {
    const nameInput = this.container.querySelector('#deck-name-input') as HTMLInputElement;
    nameInput?.addEventListener('input', () => {
      this.currentDeck.name = nameInput.value;
    });

    const loadSelect = this.container.querySelector('#deck-load-select') as HTMLSelectElement;
    loadSelect?.addEventListener('change', () => {
      const selected = loadSelect.value;
      const text = selected ? deckStore.get(selected) : undefined;
      if (selected && text) {
        this.loadDeckFromYdk(deckStore.isCustom(selected) ? selected.slice(7) : selected, text);
      }
    });

    this.container.querySelector('#btn-deck-new')?.addEventListener('click', () => {
      this.currentDeck = { name: 'New Custom Deck', main: [], extra: [], side: [] };
      this.render();
    });

    this.container.querySelector('#btn-deck-save')?.addEventListener('click', () => {
      const deckName = (this.currentDeck.name || 'Custom Deck').trim();
      const ydk = this.getCurrentYdk();
      deckStore.saveCustom(deckName, ydk);
      this.callbacks.onDeckSaved?.(deckName, ydk);
      this.render();
      alert(`Deck "${deckName}" salvo com sucesso!`);
    });

    this.container.querySelector('#btn-deck-close')?.addEventListener('click', () => {
      this.callbacks.onClose?.();
    });

    const searchInput = this.container.querySelector('#card-search-input') as HTMLInputElement;
    let searchTimer: number | null = null;
    searchInput?.addEventListener('input', () => {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        this.performSearch(searchInput.value.trim());
      }, 250);
    });

    this.container.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        this.container.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        (e.target as HTMLElement).classList.add('active');
        this.performSearch(searchInput?.value.trim() ?? '');
      });
    });
  }

  private renderDeckCards() {
    // Render Main Deck
    const mainGrid = this.container.querySelector('#main-deck-grid');
    if (mainGrid) {
      mainGrid.innerHTML = '';
      this.currentDeck.main.forEach((code: number, idx: number) => {
        const item = this.createCardElement(code, () => {
          this.removeCardFromMain(idx);
        });
        mainGrid.appendChild(item);
      });
    }

    // Render Extra Deck
    const extraGrid = this.container.querySelector('#extra-deck-grid');
    if (extraGrid) {
      extraGrid.innerHTML = '';
      this.currentDeck.extra.forEach((code: number, idx: number) => {
        const item = this.createCardElement(code, () => {
          this.removeCardFromExtra(idx);
        });
        extraGrid.appendChild(item);
      });
    }
  }

  private createCardElement(code: number, onRemove: () => void): HTMLElement {
    const cardData = this.cardDb.getCard(code);
    const div = document.createElement('div');
    div.className = 'deck-card-item';
    div.title = cardData?.name ?? `Card #${code}`;
    div.innerHTML = `
      <img src="/pics/${code}.jpg" alt="${cardData?.name ?? code}" class="deck-card-thumb" />
      <button class="card-remove-btn" title="Remove">✕</button>
    `;

    div.addEventListener('mouseenter', () => {
      if (cardData) this.callbacks.onCardInspect?.(cardData);
    });

    div.querySelector('.card-remove-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      onRemove();
    });

    return div;
  }

  private addCardToDeck(card: CardData) {
    const isExtra = this.cardDb.isExtraDeck(card.type);
    if (isExtra) {
      if (this.currentDeck.extra.length >= 15) {
        alert('Extra Deck máximo de 15 cartas atingido!');
        return;
      }
      const count = this.currentDeck.extra.filter((c: number) => c === card.id).length;
      if (count >= 3) {
        alert('Máximo de 3 cópias permitidas!');
        return;
      }
      this.currentDeck.extra.push(card.id);
    } else {
      if (this.currentDeck.main.length >= 60) {
        alert('Main Deck máximo de 60 cartas atingido!');
        return;
      }
      const count = this.currentDeck.main.filter((c: number) => c === card.id).length;
      if (count >= 3) {
        alert('Máximo de 3 cópias permitidas!');
        return;
      }
      this.currentDeck.main.push(card.id);
    }
    this.renderDeckCards();
  }

  private removeCardFromMain(index: number) {
    this.currentDeck.main.splice(index, 1);
    this.renderDeckCards();
  }

  private removeCardFromExtra(index: number) {
    this.currentDeck.extra.splice(index, 1);
    this.renderDeckCards();
  }

  private performSearch(keyword: string) {
    const activeFilter = this.container.querySelector('.filter-btn.active')?.getAttribute('data-filter') ?? 'all';
    let results = this.cardDb.searchCards(keyword, 40);

    if (activeFilter === 'monster') {
      results = results.filter((c) => this.cardDb.isMonster(c.type) && !this.cardDb.isExtraDeck(c.type));
    } else if (activeFilter === 'spell') {
      results = results.filter((c) => this.cardDb.isSpell(c.type));
    } else if (activeFilter === 'trap') {
      results = results.filter((c) => this.cardDb.isTrap(c.type));
    } else if (activeFilter === 'extra') {
      results = results.filter((c) => this.cardDb.isExtraDeck(c.type));
    }

    const grid = this.container.querySelector('#search-results-grid');
    if (!grid) return;
    grid.innerHTML = '';

    results.forEach((card) => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.innerHTML = `
        <img src="/pics/${card.id}.jpg" alt="${card.name}" class="search-result-thumb" />
        <div class="search-result-info">
          <div class="search-result-name">${card.name}</div>
          <div class="search-result-type">${this.getCardTypeLabel(card)}</div>
        </div>
        <button class="card-add-btn" title="Add to Deck">＋</button>
      `;

      item.addEventListener('mouseenter', () => {
        this.callbacks.onCardInspect?.(card);
      });

      item.querySelector('.card-add-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.addCardToDeck(card);
      });

      grid.appendChild(item);
    });
  }

  private getCardTypeLabel(card: CardData): string {
    if (this.cardDb.isExtraDeck(card.type)) return 'Extra Deck';
    if (this.cardDb.isSpell(card.type)) return 'Spell';
    if (this.cardDb.isTrap(card.type)) return 'Trap';
    return `Monster • ${card.atk}/${card.def}`;
  }
}
