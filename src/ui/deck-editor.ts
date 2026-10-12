import { type CardDatabase, type CardData, RACE_NAMES, ATTRIBUTE_NAMES } from '../engine/card-database';
import { deckStore } from './deck-store';
import { parseYdk, serializeYdk, type ParsedDeck } from '../engine/ydk';
import { renderFramedCardHTML, renderCardInspectorHTML } from './card-ui';

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
  private originalDeckName = '';
  private currentCaseIcon = 'DeckCase0001_L.png';
  private viewMode: 'list' | 'edit' = 'list';
  private deleteMode = false;
  private inspectedCard: CardData | null = null;
  private availableDeckCases: string[] = [
    'DeckCase0001_L.png',
    'DeckCase0002_L.png',
    'DeckCase0003_L.png',
    'DeckCase0004_L.png',
    'DeckCase0005_L.png',
    'DeckCase0006_L.png',
    'DeckCase0007_L.png',
    'DeckCase0008_L.png',
    'DeckCase0009_L.png',
  ];

  // Search filter state
  private searchKeyword = '';
  private filterCategory = 'all';
  private filterAttribute = 0;
  private filterRace = 0;
  private filterLevel = -1;
  private filterSort: 'atk' | 'def' | 'level' | 'name' = 'atk';
  private showFilterDrawer = false;

  constructor(container: HTMLElement, cardDb: CardDatabase, callbacks: DeckEditorCallbacks = {}) {
    this.container = container;
    this.cardDb = cardDb;
    this.callbacks = callbacks;
    this.currentDeck = {
      name: 'Deck',
      main: [],
      extra: [],
      side: [],
    };
    this.inspectedCard = this.cardDb.getCard(89631139);
  }

  public setDeckCases(cases: string[]) {
    if (cases && cases.length > 0) {
      this.availableDeckCases = cases;
    }
  }

  public setPrebuiltDecks(decks: Record<string, string>) {
    deckStore.setPrebuilt(decks);
  }

  /**
   * Opens the "My Deck" Selection Screen (Screenshot 1).
   */
  public openDeckList() {
    this.viewMode = 'list';
    this.deleteMode = false;
    this.render();
  }

  public loadDeckFromYdk(name: string, ydkText: string) {
    const cleanName = name.replace(/^custom:/, '').replace(/\.ydk$/i, '');
    this.currentDeck = parseYdk(ydkText, cleanName);
    this.originalDeckName = cleanName;
    this.currentCaseIcon = deckStore.getCaseIcon(cleanName);
    const firstCode = this.currentDeck.main[0] ?? this.currentDeck.extra[0] ?? 89631139;
    this.inspectedCard = this.cardDb.getCard(firstCode) ?? this.cardDb.getCard(89631139);
    this.viewMode = 'edit';
    this.render();
  }

  public getCurrentDeck(): ParsedDeck {
    return this.currentDeck;
  }

  public getCurrentYdk(): string {
    return serializeYdk(this.currentDeck);
  }

  public render() {
    if (this.viewMode === 'list') {
      this.renderDeckListScreen();
    } else {
      this.renderDeckEditScreen();
    }
  }

  // =========================================================================
  // VIEW 1: "MY DECK" — DECK SELECTION GRID (SCREENSHOT 1)
  // =========================================================================
  private renderDeckListScreen() {
    const customKeys = deckStore.customKeys();

    const deckTilesHTML = customKeys
      .map((key) => {
        const name = deckStore.rawName(key);
        const caseIcon = deckStore.getCaseIcon(name);
        return `
          <div class="md-deck-box-tile ${this.deleteMode ? 'delete-mode' : ''}" data-key="${key}">
            <span class="md-deck-standard-tag">STANDARD</span>
            ${
              this.deleteMode
                ? `<button class="md-deck-delete-badge" data-del="${key}" title="Delete Deck">🗑</button>`
                : ''
            }
            <div class="md-deck-case-img-wrap">
              <img src="/icon/${caseIcon}" class="md-deck-case-img" alt="${name}" />
            </div>
            <div class="md-deck-tile-name" title="${name}">${name}</div>
          </div>
        `;
      })
      .join('');

    this.container.innerHTML = `
      <div class="md-deck-list-screen">
        <!-- Top Header Bar (Screenshot 1) -->
        <header class="md-deck-list-topbar">
          <div class="md-topbar-left">
            <button class="md-back-circle-btn" id="btn-decklist-back" title="Back to Main Menu">&lt;</button>
            <h2 class="md-screen-title">My Deck</h2>
          </div>
          <div class="md-topbar-right">
            <div class="md-deck-counter">
              <span class="deck-box-mini-icon">🃏</span>
              <span>${customKeys.length}/25</span>
            </div>
            <button class="md-top-pill-btn ${this.deleteMode ? 'active-danger' : ''}" id="btn-toggle-delete-deck" title="Delete Decks">
              <span>🗑</span>
            </button>
          </div>
        </header>

        <!-- Main Grid of Deck Cases (Screenshot 1) -->
        <div class="md-deck-boxes-grid">
          <!-- First Button: + Create New Deck from Scratch -->
          <div class="md-deck-box-tile create-new-tile" id="btn-create-blank-deck" title="Create New Deck">
            <div class="md-plus-circle">+</div>
          </div>

          ${deckTilesHTML}
        </div>

        <!-- Bottom Right Action Bar (Screenshot 1) -->
        <footer class="md-deck-list-Bottombar">
          <button class="md-angled-action-btn" id="btn-public-deck-search">
            <span class="md-key-badge">X</span>
            <span>Public Deck Search</span>
          </button>
          <button class="md-angled-action-btn" id="btn-structure-decks">
            <span class="md-key-badge">Y</span>
            <span>Structure Deck List</span>
          </button>
        </footer>

        <!-- Sub-modal host for Public Import & Structure Decks -->
        <div id="deck-list-submodal-host"></div>
      </div>
    `;

    this.container.querySelector('#btn-decklist-back')?.addEventListener('click', () => {
      this.callbacks.onClose?.();
    });

    this.container.querySelector('#btn-toggle-delete-deck')?.addEventListener('click', () => {
      this.deleteMode = !this.deleteMode;
      this.renderDeckListScreen();
    });

    // + Create new blank deck from scratch
    this.container.querySelector('#btn-create-blank-deck')?.addEventListener('click', () => {
      const existingCount = deckStore.customKeys().length + 1;
      const newName = `New Deck ${existingCount}`;
      const defaultCase = this.availableDeckCases[existingCount % this.availableDeckCases.length] || 'DeckCase0001_L.png';
      this.currentDeck = { name: newName, main: [], extra: [], side: [] };
      this.originalDeckName = newName;
      this.currentCaseIcon = defaultCase;
      deckStore.saveCustom(newName, '', defaultCase);
      this.viewMode = 'edit';
      this.render();
    });

    // Click saved deck tile
    this.container.querySelectorAll('.md-deck-box-tile[data-key]').forEach((tile) => {
      tile.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-del]')) return;
        const key = tile.getAttribute('data-key')!;
        if (this.deleteMode) {
          const name = deckStore.rawName(key);
          if (confirm(`Delete deck "${name}"?`)) {
            deckStore.deleteCustom(key);
            this.renderDeckListScreen();
          }
          return;
        }
        const ydk = deckStore.get(key) ?? '';
        this.loadDeckFromYdk(key, ydk);
      });
    });

    this.container.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = (btn as HTMLElement).getAttribute('data-del')!;
        const name = deckStore.rawName(key);
        if (confirm(`Delete deck "${name}"?`)) {
          deckStore.deleteCustom(key);
          this.renderDeckListScreen();
        }
      });
    });

    // Public Deck Search -> Open YGOPRODeck in new tab + open .ydk import modal in-game
    this.container.querySelector('#btn-public-deck-search')?.addEventListener('click', () => {
      window.open('https://ygoprodeck.com/deck-search/', '_blank', 'noopener,noreferrer');
      this.openImportYdkModal();
    });

    // Structure Decks -> Open modal to create a deck from AI_xxxxx.ydk
    this.container.querySelector('#btn-structure-decks')?.addEventListener('click', () => {
      this.openStructureDeckModal();
    });
  }

  private openImportYdkModal() {
    const host = this.container.querySelector('#deck-list-submodal-host');
    if (!host) return;

    host.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-window">
          <div class="modal-header">
            <h3>🌐 IMPORT DECK (.YDK)</h3>
            <button class="modal-close-btn" id="btn-close-import-ydk">✕</button>
          </div>
          <div class="modal-body">
            <p style="color: #a8c0dc; font-size: 13px; margin-bottom: 14px;">
              <strong>YGOPRODeck</strong> has been opened in a new tab. Download any <code>.ydk</code> file and import it below (or paste its contents):
            </p>
            <div class="input-group" style="margin-bottom: 12px;">
              <label>New Deck Name:</label>
              <input type="text" id="import-deck-name" class="text-input" placeholder="e.g. Tearlaments Meta" value="Imported Deck" />
            </div>
            <div class="input-group" style="margin-bottom: 14px;">
              <label>Select <code>.ydk</code> File:</label>
              <input type="file" id="import-ydk-file" accept=".ydk,.txt" class="text-input" />
            </div>
            <div class="input-group" style="margin-bottom: 14px;">
              <label>Or paste <code>.ydk</code> text here:</label>
              <textarea id="import-ydk-text" class="text-input" rows="5" placeholder="#main\n89631139\n...\n#extra"></textarea>
            </div>
            <div class="custom-actions-bar">
              <button class="btn btn-secondary" id="btn-cancel-import-ydk">Cancel</button>
              <button class="btn btn-primary" id="btn-confirm-import-ydk">Import & Edit</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const fileInput = host.querySelector('#import-ydk-file') as HTMLInputElement;
    const nameInput = host.querySelector('#import-deck-name') as HTMLInputElement;
    const textInput = host.querySelector('#import-ydk-text') as HTMLTextAreaElement;

    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const content = await file.text();
      textInput.value = content;
      const baseName = file.name.replace(/\.ydk$/i, '').replace(/\.txt$/i, '');
      if (baseName) nameInput.value = baseName;
    });

    const close = () => {
      host.innerHTML = '';
    };
    host.querySelector('#btn-close-import-ydk')?.addEventListener('click', close);
    host.querySelector('#btn-cancel-import-ydk')?.addEventListener('click', close);

    host.querySelector('#btn-confirm-import-ydk')?.addEventListener('click', () => {
      const ydk = textInput.value.trim();
      const name = nameInput.value.trim() || 'Imported Deck';
      if (!ydk) {
        alert('Please select a .ydk file or paste the deck contents.');
        return;
      }
      const savedKey = deckStore.saveCustom(name, ydk, 'DeckCase0005_L.png');
      this.callbacks.onDeckSaved?.(name, ydk);
      host.innerHTML = '';
      this.loadDeckFromYdk(savedKey, ydk);
    });
  }

  private openStructureDeckModal() {
    const host = this.container.querySelector('#deck-list-submodal-host');
    if (!host) return;

    const prebuiltKeys = deckStore.prebuiltKeys();

    const itemsHTML = prebuiltKeys
      .map((key, idx) => {
        const cleanLabel = key.replace(/^AI_/, '').replace(/\.ydk$/i, '');
        const caseIcon = this.availableDeckCases[idx % this.availableDeckCases.length] || 'DeckCase0001_L.png';
        return `
          <div class="md-structure-deck-item" data-struct="${key}" data-case="${caseIcon}">
            <img src="/icon/${caseIcon}" class="md-structure-case-img" alt="${cleanLabel}" />
            <div class="md-structure-info">
              <div class="md-structure-name">${cleanLabel}</div>
              <div class="md-structure-sub">Structure Deck (${key})</div>
            </div>
            <button class="btn btn-primary btn-sm">Copy Deck</button>
          </div>
        `;
      })
      .join('');

    host.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-window modal-large">
          <div class="modal-header">
            <h3>🏛 STRUCTURE DECK LIST</h3>
            <button class="modal-close-btn" id="btn-close-struct-modal">✕</button>
          </div>
          <div class="modal-body">
            <p style="color: #a8c0dc; font-size: 13px; margin-bottom: 12px;">
              Choose a Structure Deck below to create an editable copy in your Decks:
            </p>
            <div class="md-structure-grid">
              ${itemsHTML}
            </div>
          </div>
        </div>
      </div>
    `;

    host.querySelector('#btn-close-struct-modal')?.addEventListener('click', () => {
      host.innerHTML = '';
    });

    host.querySelectorAll('.md-structure-deck-item').forEach((item) => {
      item.addEventListener('click', () => {
        const structKey = item.getAttribute('data-struct')!;
        const caseIcon = item.getAttribute('data-case') || 'DeckCase0001_L.png';
        const ydk = deckStore.get(structKey) ?? '';
        const baseName = structKey.replace(/^AI_/, '').replace(/\.ydk$/i, '');
        let newName = baseName;
        let counter = 2;
        while (deckStore.get('custom:' + newName) !== undefined) {
          newName = `${baseName} #${counter++}`;
        }
        const savedKey = deckStore.saveCustom(newName, ydk, caseIcon);
        this.callbacks.onDeckSaved?.(newName, ydk);
        host.innerHTML = '';
        this.loadDeckFromYdk(savedKey, ydk);
      });
    });
  }

  // =========================================================================
  // VIEW 2: INSIDE THE DECK — 3-COLUMN MASTER DUEL EDITOR (SCREENSHOT 2)
  // =========================================================================
  private renderDeckEditScreen() {
    const raceEntries = Object.entries(RACE_NAMES);
    const attrEntries = Object.entries(ATTRIBUTE_NAMES);

    this.container.innerHTML = `
      <div class="md-deck-editor-screen">
        <!-- Top Header Bar (Screenshot 2) -->
        <header class="md-editor-topbar">
          <div class="md-topbar-left">
            <button class="md-back-circle-btn" id="btn-editor-back-to-list" title="Back to My Deck">&lt;</button>
            <div class="md-cp-pills">
              <span class="cp-pill cp-n"><strong>N</strong> 31680</span>
              <span class="cp-pill cp-r"><strong>R</strong> 27368</span>
              <span class="cp-pill cp-sr"><strong>SR</strong> 505</span>
              <span class="cp-pill cp-ur"><strong>UR</strong> 579</span>
            </div>
          </div>
          <div class="md-topbar-right">
            <span class="md-top-badge">STANDARD</span>
            <button class="md-top-action-btn" id="btn-deck-sort" title="Sort Cards">⇅ SORT</button>
            <button class="md-top-action-btn" id="btn-deck-clear" title="Clear Deck">🗑 CLEAR</button>
            <button class="md-top-action-btn save-btn" id="btn-deck-save">💾 SAVE</button>
          </div>
        </header>

        <!-- 3-Column Master Duel Body (Screenshot 2) -->
        <div class="md-editor-3col">
          <!-- Column 1 (Left): Card Preview / Inspector -->
          <aside class="md-editor-left-inspector" id="deck-card-inspector-host">
            ${renderCardInspectorHTML(this.inspectedCard, this.inspectedCard?.id ?? 89631139)}
          </aside>

          <!-- Column 2 (Center): Deck Name, Binder, Main Deck & Extra Deck -->
          <main class="md-editor-center-deck">
            <div class="md-deck-identity-bar">
              <button class="md-binder-change-btn" id="btn-change-binder" title="Change Deck Case">
                <img src="/icon/${this.currentCaseIcon}" class="md-binder-thumb" id="current-binder-img" alt="Deck Case" />
                <span class="binder-edit-tag">Change</span>
              </button>
              <div class="md-deck-rename-wrap">
                <span class="rename-pencil">✎</span>
                <input
                  type="text"
                  id="deck-name-input"
                  class="md-deck-title-input"
                  value="${this.currentDeck.name}"
                  placeholder="Deck Name"
                />
              </div>
              <button class="md-auto-build-btn" id="btn-rename-confirm" title="Rename Deck">RENAME</button>
            </div>

            <!-- Main Deck Section -->
            <div class="md-deck-section">
              <div class="md-deck-section-bar">
                <span class="section-icon">🂠</span>
                <span class="section-title">Main Deck</span>
                <span class="section-count" id="main-deck-count-label">${this.currentDeck.main.length}</span>
              </div>
              <div class="md-framed-deck-grid main-deck-grid" id="main-deck-grid"></div>
            </div>

            <!-- Extra Deck Section -->
            <div class="md-deck-section extra-section">
              <div class="md-deck-section-bar">
                <span class="section-icon">EX</span>
                <span class="section-title">Extra Deck</span>
                <span class="section-count" id="extra-deck-count-label">${this.currentDeck.extra.length}</span>
              </div>
              <div class="md-framed-deck-grid extra-deck-grid" id="extra-deck-grid"></div>
            </div>
          </main>

          <!-- Column 3 (Right): Card Search & Filters -->
          <section class="md-editor-right-search">
            <div class="md-search-tabs-bar">
              <div class="md-search-tab active">💼 Card List</div>
            </div>

            <div class="md-search-controls">
              <div class="md-search-input-row">
                <span class="search-mag">🔍</span>
                <input
                  type="text"
                  id="card-search-input"
                  class="md-search-text-input"
                  placeholder="Search by Text (Name or Effect)..."
                  value="${this.searchKeyword}"
                />
              </div>

              <div class="md-filter-toolbar">
                <button class="md-filter-pill-btn ${this.showFilterDrawer ? 'active' : ''}" id="btn-toggle-filters" title="Advanced Filters">
                  <span>⚙ Filters</span>
                </button>
                <select id="select-sort-order" class="md-sort-select" title="Sort Order">
                  <option value="atk" ${this.filterSort === 'atk' ? 'selected' : ''}>ATK ↓</option>
                  <option value="def" ${this.filterSort === 'def' ? 'selected' : ''}>DEF ↓</option>
                  <option value="level" ${this.filterSort === 'level' ? 'selected' : ''}>Level/Rank ↓</option>
                  <option value="name" ${this.filterSort === 'name' ? 'selected' : ''}>Name A-Z</option>
                </select>
                <button class="md-filter-pill-btn" id="btn-reset-filters" title="Reset Filters">🗑</button>
              </div>

              <!-- Expandable Advanced Filter Drawer -->
              <div class="md-advanced-filters ${this.showFilterDrawer ? '' : 'hidden'}" id="advanced-filters-panel">
                <div class="filter-row">
                  <label>Category:</label>
                  <select id="filter-category" class="md-filter-select">
                    <option value="all" ${this.filterCategory === 'all' ? 'selected' : ''}>All Cards</option>
                    <option value="monster" ${this.filterCategory === 'monster' ? 'selected' : ''}>Monster (Main Deck)</option>
                    <option value="normal" ${this.filterCategory === 'normal' ? 'selected' : ''}>Normal Monster</option>
                    <option value="effect" ${this.filterCategory === 'effect' ? 'selected' : ''}>Effect Monster</option>
                    <option value="ritual" ${this.filterCategory === 'ritual' ? 'selected' : ''}>Ritual Monster</option>
                    <option value="pendulum" ${this.filterCategory === 'pendulum' ? 'selected' : ''}>Pendulum Monster</option>
                    <option value="fusion" ${this.filterCategory === 'fusion' ? 'selected' : ''}>Fusion Monster</option>
                    <option value="synchro" ${this.filterCategory === 'synchro' ? 'selected' : ''}>Synchro Monster</option>
                    <option value="xyz" ${this.filterCategory === 'xyz' ? 'selected' : ''}>Xyz Monster</option>
                    <option value="link" ${this.filterCategory === 'link' ? 'selected' : ''}>Link Monster</option>
                    <option value="spell" ${this.filterCategory === 'spell' ? 'selected' : ''}>Spell Card</option>
                    <option value="trap" ${this.filterCategory === 'trap' ? 'selected' : ''}>Trap Card</option>
                  </select>
                </div>
                <div class="filter-row">
                  <label>Attribute:</label>
                  <select id="filter-attribute" class="md-filter-select">
                    <option value="0">All</option>
                    ${attrEntries
                      .map(
                        ([val, name]) =>
                          `<option value="${val}" ${this.filterAttribute === Number(val) ? 'selected' : ''}>${name}</option>`
                      )
                      .join('')}
                  </select>
                </div>
                <div class="filter-row">
                  <label>Type / Race:</label>
                  <select id="filter-race" class="md-filter-select">
                    <option value="0">All</option>
                    ${raceEntries
                      .map(
                        ([val, name]) =>
                          `<option value="${val}" ${this.filterRace === Number(val) ? 'selected' : ''}>${name}</option>`
                      )
                      .join('')}
                  </select>
                </div>
                <div class="filter-row">
                  <label>Level / Rank / Link:</label>
                  <select id="filter-level" class="md-filter-select">
                    <option value="-1">All</option>
                    ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
                      .map(
                        (lv) =>
                          `<option value="${lv}" ${this.filterLevel === lv ? 'selected' : ''}>★ / L-${lv}</option>`
                      )
                      .join('')}
                  </select>
                </div>
              </div>
            </div>

            <div class="md-search-cards-grid" id="search-results-grid"></div>
          </section>
        </div>

        <!-- Bottom Shortcut Legend Bar (Screenshot 2) -->
        <footer class="md-editor-bottom-legend">
          <span><strong>Left Click (Card List):</strong> + Add to Deck</span>
          <span><strong>Left / Right Click (Deck):</strong> - Remove from Deck</span>
          <span><strong>Hover Card:</strong> View Details on Left</span>
        </footer>

        <!-- Binder Picker Modal Host -->
        <div id="deck-editor-submodal-host"></div>
      </div>
    `;

    this.bindEditEvents();
    this.renderDeckCards();
    this.performSearch();
  }

  private updateInspector(card: CardData | null) {
    if (!card) return;
    this.inspectedCard = card;
    const host = this.container.querySelector('#deck-card-inspector-host');
    if (host) {
      host.innerHTML = renderCardInspectorHTML(card, card.id);
    }
    this.callbacks.onCardInspect?.(card);
  }

  private bindEditEvents() {
    this.container.querySelector('#btn-editor-back-to-list')?.addEventListener('click', () => {
      // Auto-save current deck before returning to "My Deck" list
      this.saveCurrentDeck(false);
      this.openDeckList();
    });

    const nameInput = this.container.querySelector('#deck-name-input') as HTMLInputElement;
    nameInput?.addEventListener('input', () => {
      this.currentDeck.name = nameInput.value;
    });

    this.container.querySelector('#btn-rename-confirm')?.addEventListener('click', () => {
      const newName = (nameInput?.value || 'Deck').trim();
      if (this.originalDeckName && this.originalDeckName !== newName) {
        deckStore.renameCustom(this.originalDeckName, newName);
        this.originalDeckName = newName;
      }
      this.currentDeck.name = newName;
      this.saveCurrentDeck(true);
    });

    this.container.querySelector('#btn-change-binder')?.addEventListener('click', () => {
      this.openBinderPickerModal();
    });

    this.container.querySelector('#btn-deck-sort')?.addEventListener('click', () => {
      this.currentDeck.main.sort((a, b) => a - b);
      this.currentDeck.extra.sort((a, b) => a - b);
      this.renderDeckCards();
    });

    this.container.querySelector('#btn-deck-clear')?.addEventListener('click', () => {
      if (confirm('Clear all cards from this deck?')) {
        this.currentDeck.main = [];
        this.currentDeck.extra = [];
        this.renderDeckCards();
        this.performSearch();
      }
    });

    this.container.querySelector('#btn-deck-save')?.addEventListener('click', () => {
      this.saveCurrentDeck(true);
    });

    // Search & Filters
    const searchInput = this.container.querySelector('#card-search-input') as HTMLInputElement;
    let searchTimer: number | null = null;
    searchInput?.addEventListener('input', () => {
      this.searchKeyword = searchInput.value.trim();
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        this.performSearch();
      }, 180);
    });

    this.container.querySelector('#btn-toggle-filters')?.addEventListener('click', () => {
      this.showFilterDrawer = !this.showFilterDrawer;
      const panel = this.container.querySelector('#advanced-filters-panel');
      const btn = this.container.querySelector('#btn-toggle-filters');
      panel?.classList.toggle('hidden', !this.showFilterDrawer);
      btn?.classList.toggle('active', this.showFilterDrawer);
    });

    this.container.querySelector('#select-sort-order')?.addEventListener('change', (e) => {
      this.filterSort = (e.target as HTMLSelectElement).value as any;
      this.performSearch();
    });

    this.container.querySelector('#filter-category')?.addEventListener('change', (e) => {
      this.filterCategory = (e.target as HTMLSelectElement).value;
      this.performSearch();
    });

    this.container.querySelector('#filter-attribute')?.addEventListener('change', (e) => {
      this.filterAttribute = Number((e.target as HTMLSelectElement).value);
      this.performSearch();
    });

    this.container.querySelector('#filter-race')?.addEventListener('change', (e) => {
      this.filterRace = Number((e.target as HTMLSelectElement).value);
      this.performSearch();
    });

    this.container.querySelector('#filter-level')?.addEventListener('change', (e) => {
      this.filterLevel = Number((e.target as HTMLSelectElement).value);
      this.performSearch();
    });

    this.container.querySelector('#btn-reset-filters')?.addEventListener('click', () => {
      this.searchKeyword = '';
      this.filterCategory = 'all';
      this.filterAttribute = 0;
      this.filterRace = 0;
      this.filterLevel = -1;
      this.filterSort = 'atk';
      this.renderDeckEditScreen();
    });
  }

  private saveCurrentDeck(showNotice = true) {
    const deckName = (this.currentDeck.name || 'Deck').trim();
    if (this.originalDeckName && this.originalDeckName !== deckName) {
      deckStore.renameCustom(this.originalDeckName, deckName);
    }
    this.originalDeckName = deckName;
    const ydk = this.getCurrentYdk();
    deckStore.saveCustom(deckName, ydk, this.currentCaseIcon);
    this.callbacks.onDeckSaved?.(deckName, ydk);
    if (showNotice) {
      const saveBtn = this.container.querySelector('#btn-deck-save');
      if (saveBtn) {
        const prev = saveBtn.textContent;
        saveBtn.textContent = '✓ SAVED!';
        setTimeout(() => {
          saveBtn.textContent = prev;
        }, 1200);
      }
    }
  }

  private openBinderPickerModal() {
    const host = this.container.querySelector('#deck-editor-submodal-host');
    if (!host) return;

    host.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-window modal-large">
          <div class="modal-header">
            <h3>🧰 SELECT DECK CASE (BINDER)</h3>
            <button class="modal-close-btn" id="btn-close-binder-modal">✕</button>
          </div>
          <div class="modal-body">
            <div class="items-picker-grid">
              ${this.availableDeckCases
                .map(
                  (dc) => `
                  <div class="picker-item ${dc === this.currentCaseIcon ? 'selected' : ''}" data-case="${dc}">
                    <img src="/icon/${dc}" class="picker-thumb" alt="${dc}" />
                  </div>
                `
                )
                .join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    host.querySelector('#btn-close-binder-modal')?.addEventListener('click', () => {
      host.innerHTML = '';
    });

    host.querySelectorAll('.picker-item[data-case]').forEach((item) => {
      item.addEventListener('click', () => {
        const chosen = item.getAttribute('data-case')!;
        this.currentCaseIcon = chosen;
        deckStore.setCaseIcon(this.currentDeck.name || 'My Custom Deck', chosen);
        const img = this.container.querySelector('#current-binder-img') as HTMLImageElement;
        if (img) img.src = `/icon/${chosen}`;
        host.innerHTML = '';
      });
    });
  }

  private renderDeckCards() {
    const mainCountEl = this.container.querySelector('#main-deck-count-label');
    if (mainCountEl) mainCountEl.textContent = String(this.currentDeck.main.length);

    const extraCountEl = this.container.querySelector('#extra-deck-count-label');
    if (extraCountEl) extraCountEl.textContent = String(this.currentDeck.extra.length);

    const mainGrid = this.container.querySelector('#main-deck-grid');
    if (mainGrid) {
      mainGrid.innerHTML = '';
      this.currentDeck.main.forEach((code: number, idx: number) => {
        const item = this.createFramedDeckCardElement(code, () => {
          this.removeCardFromMain(idx);
        });
        mainGrid.appendChild(item);
      });
    }

    const extraGrid = this.container.querySelector('#extra-deck-grid');
    if (extraGrid) {
      extraGrid.innerHTML = '';
      this.currentDeck.extra.forEach((code: number, idx: number) => {
        const item = this.createFramedDeckCardElement(code, () => {
          this.removeCardFromExtra(idx);
        });
        extraGrid.appendChild(item);
      });
    }
  }

  private createFramedDeckCardElement(code: number, onRemove: () => void): HTMLElement {
    const cardData = this.cardDb.getCard(code);
    const div = document.createElement('div');
    div.className = 'md-deck-slot-card';
    div.title = `${cardData?.name ?? code} (Click to remove)`;
    div.innerHTML = renderFramedCardHTML(cardData, code, {
      showRarity: true,
      showLevelOverlay: false,
    });

    div.addEventListener('mouseenter', () => {
      if (cardData) this.updateInspector(cardData);
    });

    div.addEventListener('click', (e) => {
      e.preventDefault();
      onRemove();
    });

    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      onRemove();
    });

    return div;
  }

  private getCopiesInDeck(code: number): number {
    let count = 0;
    for (const c of this.currentDeck.main) if (c === code) count++;
    for (const c of this.currentDeck.extra) if (c === code) count++;
    return count;
  }

  private addCardToDeck(card: CardData) {
    const isExtra = this.cardDb.isExtraDeck(card.type);
    if (isExtra) {
      if (this.currentDeck.extra.length >= 15) return;
      const count = this.currentDeck.extra.filter((c: number) => c === card.id).length;
      if (count >= 3) return;
      this.currentDeck.extra.push(card.id);
    } else {
      if (this.currentDeck.main.length >= 60) return;
      const count = this.currentDeck.main.filter((c: number) => c === card.id).length;
      if (count >= 3) return;
      this.currentDeck.main.push(card.id);
    }
    this.renderDeckCards();
    this.updateSearchCopyBadges();
  }

  private removeCardByCode(code: number) {
    const mainIdx = this.currentDeck.main.lastIndexOf(code);
    if (mainIdx !== -1) {
      this.removeCardFromMain(mainIdx);
      return;
    }
    const extraIdx = this.currentDeck.extra.lastIndexOf(code);
    if (extraIdx !== -1) {
      this.removeCardFromExtra(extraIdx);
    }
  }

  private removeCardFromMain(index: number) {
    this.currentDeck.main.splice(index, 1);
    this.renderDeckCards();
    this.updateSearchCopyBadges();
  }

  private removeCardFromExtra(index: number) {
    this.currentDeck.extra.splice(index, 1);
    this.renderDeckCards();
    this.updateSearchCopyBadges();
  }

  private updateSearchCopyBadges() {
    this.container.querySelectorAll('.md-search-card-slot').forEach((slot) => {
      const code = Number(slot.getAttribute('data-code'));
      const badge = slot.querySelector('.md-copy-count-badge');
      if (badge && code) {
        badge.textContent = String(this.getCopiesInDeck(code));
      }
    });
  }

  private performSearch() {
    const results = this.cardDb.searchCards(this.searchKeyword, 72, {
      category: this.filterCategory,
      attribute: this.filterAttribute || undefined,
      race: this.filterRace || undefined,
      level: this.filterLevel >= 0 ? this.filterLevel : undefined,
      sort: this.filterSort,
    });

    const grid = this.container.querySelector('#search-results-grid');
    if (!grid) return;
    grid.innerHTML = '';

    results.forEach((card) => {
      const copies = this.getCopiesInDeck(card.id);
      const item = document.createElement('div');
      item.className = 'md-search-card-slot';
      item.setAttribute('data-code', String(card.id));
      item.title = `${card.name} (Left Click: +1 | Right Click: -1)`;
      item.innerHTML = renderFramedCardHTML(card, card.id, {
        showRarity: true,
        copyCount: copies,
        showLevelOverlay: false,
      });

      item.addEventListener('mouseenter', () => {
        this.updateInspector(card);
      });

      item.addEventListener('click', () => {
        this.addCardToDeck(card);
      });

      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.removeCardByCode(card.id);
      });

      grid.appendChild(item);
    });
  }
}
