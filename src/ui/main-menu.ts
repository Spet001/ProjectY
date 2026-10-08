import type { AudioManager } from '../audio/audio-manager';
import { deckStore } from './deck-store';

export interface UserProfile {
  playerName: string;
  aiName: string;
  playerDeckName: string;
  aiDeckName: string;
  avatarIcon: string;
  profileFrame: string;
  mate: string;
  field: string;
  wallpaper: string;
  bgmVolume: number;
  sfxVolume: number;
  isMuted: boolean;
}

export interface CustomizationAssets {
  icons: string[];
  frames: string[];
  mates: string[];
  fields: string[];
  wallpapers: string[];
}

export interface MainMenuCallbacks {
  onStartDuel: (config: {
    playerDeckName: string;
    aiDeckName: string;
    playerName: string;
    aiName: string;
    playerAvatar: string;
    aiAvatar: string;
    field: string;
    mate: string;
  }) => void;
  onOpenDeckEditor: () => void;
}

const STORAGE_KEY = 'mdpro_user_profile';

export class MainMenu {
  private container: HTMLElement;
  private audio: AudioManager;
  private callbacks: MainMenuCallbacks;
  private profile: UserProfile;
  private assets: CustomizationAssets = {
    icons: [],
    frames: [],
    mates: [],
    fields: [],
    wallpapers: [],
  };

  constructor(container: HTMLElement, audio: AudioManager, callbacks: MainMenuCallbacks) {
    this.container = container;
    this.audio = audio;
    this.callbacks = callbacks;
    this.profile = this.loadProfile();
  }

  private loadProfile(): UserProfile {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      playerName: 'Seto Kaiba',
      aiName: 'Yami Yugi (AI)',
      playerDeckName: 'AI_BlueEyes.ydk',
      aiDeckName: 'AI_DarkMagician.ydk',
      avatarIcon: 'ProfileIcon1010002_L.png',
      profileFrame: 'ProfileFrame1030001_L.png',
      mate: '1000001.png',
      field: 'FieldIcon1090001.png',
      wallpaper: 'WallPaperIcon0.png',
      bgmVolume: 0.35,
      sfxVolume: 0.7,
      isMuted: false,
    };
  }

  public saveProfile() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch {}
  }

  public getProfile(): UserProfile {
    return this.profile;
  }

  public async init() {
    // Fetch customization assets & decks from server
    try {
      const [custRes, decksRes] = await Promise.all([
        fetch('/api/customization').then((r) => r.json()),
        fetch('/api/decks').then((r) => r.json()),
      ]);
      this.assets = custRes;
      deckStore.setPrebuilt(decksRes);
    } catch (e) {
      console.warn('Failed to load server customization assets:', e);
    }

    this.render();

    const hash = window.location.hash;
    if (hash === '#deck') {
      this.callbacks.onOpenDeckEditor();
    } else if (hash === '#profile') {
      this.openProfileModal();
    } else if (hash === '#options') {
      this.openSettingsModal();
    } else if (hash === '#duel') {
      this.openDuelSetupModal();
    }
  }

  public render() {
    this.container.innerHTML = `
      <div class="main-menu-screen mdpro-layout">
        <!-- Hero Art on the right (Blue-Eyes Alternative / Wallpaper) -->
        <div class="mdpro-bg-art">
          <img src="/pics/79814787.jpg" class="mdpro-hero-art" alt="Blue-Eyes Alternative White Dragon" />
          <div class="mdpro-bg-overlay"></div>
        </div>

        <!-- Top Header: MDPro3 version and Profile/FPS -->
        <header class="mdpro-top-bar">
          <div class="mdpro-brand">
            <h1 class="mdpro-title">MDPro3 <span class="mdpro-ver">v1.1.4</span></h1>
            <span class="mdpro-sub">Yu-Gi-Oh! OCG / TCG Engine</span>
          </div>

          <div class="mdpro-top-right">
            <div class="mdpro-fps-badge" id="menu-fps-counter">60.0 FPS</div>
            <div class="user-profile-badge" id="btn-open-profile" title="Customize Profile">
              <div class="user-avatar-container">
                <img src="/icon/${this.profile.avatarIcon}" class="user-avatar-img" />
                <img src="/icon/${this.profile.profileFrame}" class="user-frame-overlay" />
              </div>
              <div class="user-text-info">
                <span class="user-name">${this.profile.playerName}</span>
                <span class="user-title">Master Duelist</span>
              </div>
            </div>
          </div>
        </header>

        <!-- Left Navigation Column (Screenshot 1) -->
        <div class="mdpro-nav-column">
          <nav class="mdpro-nav-list">
            <button class="mdpro-nav-item active" data-action="solo">
              <span class="nav-text">SOLO</span>
              <span class="nav-arrow">&gt;</span>
            </button>
            <button class="mdpro-nav-item" data-action="online">
              <span class="nav-text">ONLINE</span>
            </button>
            <button class="mdpro-nav-item" data-action="puzzle">
              <span class="nav-text">PUZZLE</span>
            </button>
            <button class="mdpro-nav-item" data-action="replay">
              <span class="nav-text">REPLAY</span>
            </button>
            <button class="mdpro-nav-item" data-action="cutin">
              <span class="nav-text">CUT-IN</span>
            </button>
            <button class="mdpro-nav-item" data-action="mate">
              <span class="nav-text">MATE</span>
            </button>
            <button class="mdpro-nav-item" data-action="deck">
              <span class="nav-text">DECK</span>
              <span class="nav-arrow">&gt;</span>
            </button>
            <button class="mdpro-nav-item" data-action="setting">
              <span class="nav-text">SETTING</span>
            </button>
            <button class="mdpro-nav-item" data-action="exit">
              <span class="nav-text">EXIT</span>
            </button>
          </nav>
        </div>

        <!-- Modals Container -->
        <div id="menu-modal-container"></div>
      </div>
    `;

    this.bindEvents();
    this.startFpsCounter();
  }

  private startFpsCounter() {
    let lastTime = performance.now();
    let frameCount = 0;
    const tick = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        const fps = ((frameCount * 1000) / (now - lastTime)).toFixed(1);
        const el = this.container.querySelector('#menu-fps-counter');
        if (el) el.textContent = `${fps} FPS`;
        frameCount = 0;
        lastTime = now;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private bindEvents() {
    this.container.querySelectorAll('.mdpro-nav-item').forEach((btn) => {
      btn.addEventListener('mouseenter', () => {
        this.container.querySelectorAll('.mdpro-nav-item').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.audio.playHover();
      });

      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.action;
        this.audio.playButtonClick();

        if (action === 'solo') {
          this.openDuelSetupModal();
        } else if (action === 'deck') {
          this.callbacks.onOpenDeckEditor();
        } else if (action === 'mate' || action === 'cutin') {
          this.openProfileModal();
        } else if (action === 'setting') {
          this.openSettingsModal();
        } else if (action === 'exit') {
          if (confirm('Deseja reiniciar a sessão do MDPro3?')) {
            window.location.reload();
          }
        } else {
          alert(`${(action ?? '').toUpperCase()} mode: disponível em breve. Utilize SOLO para batalhas ou DECK para montar seu baralho.`);
        }
      });
    });

    this.container.querySelector('#btn-open-profile')?.addEventListener('click', () => {
      this.audio.playButtonClick();
      this.openProfileModal();
    });
  }

  // --- 1. DUEL SETUP MODAL ---
  public openDuelSetupModal() {
    const modalHost = this.container.querySelector('#menu-modal-container')!;
    const mkOpts = (sel: string) =>
      deckStore.keys().map((name) => {
        return `<option value="${name}" ${name === sel ? 'selected' : ''}>${deckStore.label(name)}</option>`;
      });
    const deckOptions = mkOpts(this.profile.playerDeckName);
    const aiDeckOptions = mkOpts(this.profile.aiDeckName);

    modalHost.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-window">
          <div class="modal-header">
            <h3>⚔ DUEL CONFIGURATION</h3>
            <button class="modal-close-btn" id="btn-close-duel-modal">✕</button>
          </div>
          <div class="modal-body">
            <div class="duel-setup-grid">
              <div class="setup-player-card">
                <h4>YOUR DECK</h4>
                <div class="avatar-preview-wrap">
                  <img src="/icon/${this.profile.avatarIcon}" class="preview-avatar" />
                  <img src="/icon/${this.profile.profileFrame}" class="preview-frame" />
                </div>
                <div class="setup-field">
                  <label>Player Deck:</label>
                  <select id="select-player-deck" class="deck-select">
                    ${deckOptions.join('')}
                  </select>
                </div>
              </div>

              <div class="vs-divider">VS</div>

              <div class="setup-player-card">
                <h4>OPPONENT (AI)</h4>
                <div class="avatar-preview-wrap">
                  <img src="/icon/ProfileIcon1010001_L.png" class="preview-avatar" />
                  <img src="/icon/ProfileFrame1030002_L.png" class="preview-frame" />
                </div>
                <div class="setup-field">
                  <label>AI Deck:</label>
                  <select id="select-ai-deck" class="deck-select">
                    ${aiDeckOptions.join('')}
                  </select>
                </div>
              </div>
            </div>

            <div class="duel-start-wrap">
              <button class="btn btn-primary btn-large" id="btn-start-duel-now">ENTER DUEL ARENA</button>
            </div>
          </div>
        </div>
      </div>
    `;

    modalHost.querySelector('#btn-close-duel-modal')?.addEventListener('click', () => {
      modalHost.innerHTML = '';
    });

    modalHost.querySelector('#btn-start-duel-now')?.addEventListener('click', () => {
      const pDeck = (modalHost.querySelector('#select-player-deck') as HTMLSelectElement).value;
      const aiDeck = (modalHost.querySelector('#select-ai-deck') as HTMLSelectElement).value;
      this.profile.playerDeckName = pDeck;
      this.profile.aiDeckName = aiDeck;
      this.saveProfile();
      modalHost.innerHTML = '';

      this.callbacks.onStartDuel({
        playerDeckName: pDeck,
        aiDeckName: aiDeck,
        playerName: this.profile.playerName,
        aiName: this.profile.aiName,
        playerAvatar: this.profile.avatarIcon,
        aiAvatar: 'ProfileIcon1010001_L.png',
        field: this.profile.field,
        mate: this.profile.mate,
      });
    });
  }

  // --- 2. PROFILE & CUSTOMIZATION MODAL ---
  public openProfileModal() {
    const modalHost = this.container.querySelector('#menu-modal-container')!;
    modalHost.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-window modal-large">
          <div class="modal-header">
            <h3>🎨 PROFILE & ACCESSORIES</h3>
            <button class="modal-close-btn" id="btn-close-profile-modal">✕</button>
          </div>
          <div class="modal-body custom-body">
            <!-- Names Section -->
            <div class="names-settings-row">
              <div class="input-group">
                <label>Player Name:</label>
                <input type="text" id="input-player-name" class="text-input" value="${this.profile.playerName}" />
              </div>
              <div class="input-group">
                <label>AI Opponent Name:</label>
                <input type="text" id="input-ai-name" class="text-input" value="${this.profile.aiName}" />
              </div>
            </div>

            <!-- Accessories Tabs -->
            <div class="custom-tabs">
              <button class="custom-tab-btn active" data-tab="tab-avatars">Avatar Icons</button>
              <button class="custom-tab-btn" data-tab="tab-frames">Profile Frames</button>
              <button class="custom-tab-btn" data-tab="tab-mates">Mates (Pets)</button>
              <button class="custom-tab-btn" data-tab="tab-fields">Duel Fields</button>
            </div>

            <!-- Tab 1: Avatars -->
            <div class="custom-tab-content active" id="tab-avatars">
              <div class="items-picker-grid">
                ${this.assets.icons
                  .map(
                    (ic) => `
                  <div class="picker-item ${ic === this.profile.avatarIcon ? 'selected' : ''}" data-val="${ic}" data-type="avatar">
                    <img src="/icon/${ic}" class="picker-thumb" />
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>

            <!-- Tab 2: Frames -->
            <div class="custom-tab-content" id="tab-frames">
              <div class="items-picker-grid">
                ${this.assets.frames
                  .map(
                    (fr) => `
                  <div class="picker-item ${fr === this.profile.profileFrame ? 'selected' : ''}" data-val="${fr}" data-type="frame">
                    <img src="/icon/${fr}" class="picker-thumb" />
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>

            <!-- Tab 3: Mates -->
            <div class="custom-tab-content" id="tab-mates">
              <div class="items-picker-grid">
                ${this.assets.mates
                  .map(
                    (mt) => `
                  <div class="picker-item ${mt === this.profile.mate ? 'selected' : ''}" data-val="${mt}" data-type="mate">
                    <img src="/icon/${mt}" class="picker-thumb" />
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>

            <!-- Tab 4: Fields -->
            <div class="custom-tab-content" id="tab-fields">
              <div class="items-picker-grid">
                ${this.assets.fields
                  .map(
                    (fd) => `
                  <div class="picker-item ${fd === this.profile.field ? 'selected' : ''}" data-val="${fd}" data-type="field">
                    <img src="/icon/${fd}" class="picker-thumb" />
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>

            <div class="custom-actions-bar">
              <button class="btn btn-primary" id="btn-save-profile">Save & Apply</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Tab switching
    modalHost.querySelectorAll('.custom-tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        modalHost.querySelectorAll('.custom-tab-btn').forEach((b) => b.classList.remove('active'));
        modalHost.querySelectorAll('.custom-tab-content').forEach((c) => c.classList.remove('active'));
        const targetTab = (e.target as HTMLElement).getAttribute('data-tab');
        (e.target as HTMLElement).classList.add('active');
        modalHost.querySelector(`#${targetTab}`)?.classList.add('active');
      });
    });

    // Item selection
    modalHost.querySelectorAll('.picker-item').forEach((item) => {
      item.addEventListener('click', () => {
        const type = item.getAttribute('data-type');
        const val = item.getAttribute('data-val');
        if (!type || !val) return;

        modalHost.querySelectorAll(`.picker-item[data-type="${type}"]`).forEach((i) => i.classList.remove('selected'));
        item.classList.add('selected');

        if (type === 'avatar') this.profile.avatarIcon = val;
        if (type === 'frame') this.profile.profileFrame = val;
        if (type === 'mate') this.profile.mate = val;
        if (type === 'field') this.profile.field = val;
      });
    });

    modalHost.querySelector('#btn-close-profile-modal')?.addEventListener('click', () => {
      modalHost.innerHTML = '';
    });

    modalHost.querySelector('#btn-save-profile')?.addEventListener('click', () => {
      const pName = (modalHost.querySelector('#input-player-name') as HTMLInputElement).value;
      const aiName = (modalHost.querySelector('#input-ai-name') as HTMLInputElement).value;
      if (pName) this.profile.playerName = pName;
      if (aiName) this.profile.aiName = aiName;
      this.saveProfile();
      modalHost.innerHTML = '';
      this.render();
    });
  }

  // --- 3. SETTINGS MODAL ---
  public openSettingsModal() {
    const modalHost = this.container.querySelector('#menu-modal-container')!;
    modalHost.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-window">
          <div class="modal-header">
            <h3>⚙ GAME SETTINGS</h3>
            <button class="modal-close-btn" id="btn-close-settings-modal">✕</button>
          </div>
          <div class="modal-body">
            <div class="settings-group">
              <label>BGM Volume: <span id="bgm-val-label">${Math.round(this.profile.bgmVolume * 100)}%</span></label>
              <input type="range" id="range-bgm" min="0" max="1" step="0.05" value="${this.profile.bgmVolume}" class="volume-slider" />
            </div>

            <div class="settings-group">
              <label>SFX Volume: <span id="sfx-val-label">${Math.round(this.profile.sfxVolume * 100)}%</span></label>
              <input type="range" id="range-sfx" min="0" max="1" step="0.05" value="${this.profile.sfxVolume}" class="volume-slider" />
            </div>

            <div class="settings-group">
              <label class="checkbox-label">
                <input type="checkbox" id="check-mute" ${this.profile.isMuted ? 'checked' : ''} />
                <span>Mute All Audio</span>
              </label>
            </div>

            <div class="settings-group" style="margin-top: 18px;">
              <button class="btn btn-secondary" id="btn-toggle-fs">Toggle Fullscreen</button>
            </div>

            <div class="custom-actions-bar">
              <button class="btn btn-primary" id="btn-save-settings">Confirm</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const bgmRange = modalHost.querySelector('#range-bgm') as HTMLInputElement;
    const sfxRange = modalHost.querySelector('#range-sfx') as HTMLInputElement;
    const muteCheck = modalHost.querySelector('#check-mute') as HTMLInputElement;

    bgmRange?.addEventListener('input', () => {
      const v = Number(bgmRange.value);
      this.profile.bgmVolume = v;
      this.audio.setBgmVolume(v);
      modalHost.querySelector('#bgm-val-label')!.textContent = `${Math.round(v * 100)}%`;
    });

    sfxRange?.addEventListener('input', () => {
      const v = Number(sfxRange.value);
      this.profile.sfxVolume = v;
      this.audio.setSfxVolume(v);
      modalHost.querySelector('#sfx-val-label')!.textContent = `${Math.round(v * 100)}%`;
    });

    muteCheck?.addEventListener('change', () => {
      this.profile.isMuted = muteCheck.checked;
      this.audio.setMuted(this.profile.isMuted);
    });

    modalHost.querySelector('#btn-toggle-fs')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    modalHost.querySelector('#btn-close-settings-modal')?.addEventListener('click', () => {
      modalHost.innerHTML = '';
    });

    modalHost.querySelector('#btn-save-settings')?.addEventListener('click', () => {
      this.saveProfile();
      modalHost.innerHTML = '';
    });
  }
}
