import {
  type AudioManager,
  MENU_BGM_OPTIONS,
  getDuelBgmOptions,
  normalizeDuelBgmKey,
} from '../audio/audio-manager';
import { PROTECTOR_SLEEVE_OPTIONS } from '../render/card-texture';
import { deckStore } from './deck-store';
import { customAssets } from './custom-assets';

export interface UserProfile {
  playerName: string;
  aiName: string;
  playerDeckName: string;
  aiDeckName: string;
  avatarIcon: string;
  profileFrame: string;
  mate: string;
  field: string;
  protector: string;
  wallpaper: string; // Main Menu Theme 1 (Front Hero Art)
  wallpaperBg: string; // Main Menu Theme 2 (Back Background Art)
  mainBgm: string;
  duelBgm: string;
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
  deckCases: string[];
  bgmTracks: string[];
  protectors: string[];
}

export interface MainMenuCallbacks {
  onStartDuel: (config: {
    playerDeckName: string;
    aiDeckName: string;
    playerName: string;
    aiName: string;
    playerAvatar: string;
    playerFrame: string;
    aiAvatar: string;
    field: string;
    mate: string;
    protector: string;
    duelBgm: string;
  }) => void;
  onOpenDeckEditor: () => void;
  onAssetsLoaded?: (assets: CustomizationAssets) => void;
}

const STORAGE_KEY = 'mdpro_user_profile_v2';

const MAIN_MENU_THEME2_PRESETS: Array<{ id: string; label: string; thumb: string }> = [
  { id: '/texture/TexSoloTransitionBG.png', label: 'Solo Gate Nebula', thumb: '/texture/TexSoloTransitionBG.png' },
  { id: '/texture/LoadingCover.png', label: 'Master Duel Sanctuary', thumb: '/texture/LoadingCover.png' },
  { id: '/texture/bg_01.png', label: 'Colosseum Dark', thumb: '/texture/bg_01.png' },
  { id: '/texture/img_TunChange_bg01.png', label: 'Blue Energy Vortex', thumb: '/texture/img_TunChange_bg01.png' },
  { id: '/texture/img_TunChange_bg02.png', label: 'Crimson Energy Vortex', thumb: '/texture/img_TunChange_bg02.png' },
  { id: '/texture/GUI_Reward_BG.png', label: 'Golden Vault', thumb: '/texture/GUI_Reward_BG.png' },
  { id: '/texture/GUI_Live_Back.png', label: 'Cyber Arena', thumb: '/texture/GUI_Live_Back.png' },
];

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
    deckCases: [],
    bgmTracks: [],
    protectors: PROTECTOR_SLEEVE_OPTIONS.map((p) => p.id),
  };

  constructor(container: HTMLElement, audio: AudioManager, callbacks: MainMenuCallbacks) {
    this.container = container;
    this.audio = audio;
    this.callbacks = callbacks;
    this.profile = this.loadProfile();
  }

  private loadProfile(): UserProfile {
    const defaults: UserProfile = {
      playerName: 'Spet01',
      aiName: 'The Wicked Soul Within',
      playerDeckName: 'custom:Blue-Eyes Championship',
      aiDeckName: 'AI_DarkMagician.ydk',
      avatarIcon: 'ProfileIcon1010002_L.png',
      profileFrame: 'ProfileFrame1030001_L.png',
      mate: '1000001.png',
      field: 'FieldIcon1090001.png',
      protector: 'DefaultProtector.png',
      wallpaper: 'WallPaperIcon1120001.png',
      wallpaperBg: '/texture/TexSoloTransitionBG.png',
      mainBgm: 'BGM_MENU_01.ogg',
      duelBgm: 'DUEL_01',
      bgmVolume: 0.35,
      sfxVolume: 0.7,
      isMuted: false,
    };
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('mdpro_user_profile');
      if (saved) {
        const parsed = { ...defaults, ...JSON.parse(saved) } as UserProfile;
        if (parsed.aiName === 'A Alma Perversa Interior') {
          parsed.aiName = 'The Wicked Soul Within';
        }
        if (parsed.protector && parsed.protector.startsWith('WallPaperIcon')) {
          parsed.protector = 'DefaultProtector.png';
        }
        parsed.duelBgm = normalizeDuelBgmKey(parsed.duelBgm);
        return parsed;
      }
    } catch {}
    return defaults;
  }

  public saveProfile() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch {}
  }

  public getProfile(): UserProfile {
    return this.profile;
  }

  public resolveAvatarUrl(icon = this.profile.avatarIcon): string {
    if (icon === 'custom_avatar') {
      return customAssets.getUrl('custom_avatar') || '/icon/ProfileIcon1010002_L.png';
    }
    return `/icon/${icon}`;
  }

  /** Resolves Main Menu Theme 1 (Front character cutout) */
  public resolveWallpaperUrl(): string {
    if (this.profile.wallpaper === 'custom_wallpaper') {
      return customAssets.getUrl('custom_wallpaper') || '/icon/WallPaperIcon1120001.png';
    }
    if (this.profile.wallpaper && this.profile.wallpaper.endsWith('.png')) {
      return `/icon/${this.profile.wallpaper}`;
    }
    return '/icon/WallPaperIcon1120001.png';
  }

  /** Resolves Main Menu Theme 2 (Back background art) */
  public resolveWallpaperBgUrl(): string {
    if (this.profile.wallpaperBg === 'custom_wallpaper_bg') {
      return customAssets.getUrl('custom_wallpaper_bg') || '/texture/TexSoloTransitionBG.png';
    }
    if (this.profile.wallpaperBg?.startsWith('/')) {
      return this.profile.wallpaperBg;
    }
    if (this.profile.wallpaperBg?.startsWith('FieldIcon')) {
      return `/icon/${this.profile.wallpaperBg}`;
    }
    return '/texture/TexSoloTransitionBG.png';
  }

  private renderProtectorGridHtml(): string {
    return PROTECTOR_SLEEVE_OPTIONS.map((p) => {
      const isSel = this.profile.protector === p.id ? 'selected' : '';
      let inner = '';
      if (p.thumbType === 'classic') {
        inner = `<div class="classic-ygo-back-preview">YU-GI-OH!<br/>CLASSIC</div>`;
      } else if (p.thumbType === 'texture') {
        inner = `<img src="${p.thumbUrl}" class="picker-thumb" loading="lazy" />`;
      } else if (p.thumbType === 'theme') {
        inner = `
          <div class="sleeve-theme-preview" style="background: ${p.themeColor};">
            <div class="sleeve-theme-inner">
              <span>SLEEVE</span>
              <strong>${p.label}</strong>
            </div>
          </div>
        `;
      } else if (p.thumbType === 'card') {
        inner = `
          <div class="sleeve-card-preview">
            <img src="${p.thumbUrl}" class="picker-thumb" loading="lazy" />
            <div class="sleeve-card-rim"></div>
          </div>
        `;
      }
      return `
        <div class="picker-item protector-sleeve-item ${isSel}" data-val="${p.id}" data-type="protector" title="${p.label}">
          ${inner}
        </div>
      `;
    }).join('');
  }

  private renderTheme2GridHtml(): string {
    const presetItems = MAIN_MENU_THEME2_PRESETS.map((p) => {
      const isSel = this.profile.wallpaperBg === p.id ? 'selected' : '';
      return `
        <div class="picker-item ${isSel}" data-val="${p.id}" data-type="wallpaperBg" title="${p.label}">
          <img src="${p.thumb}" class="picker-thumb" loading="lazy" />
        </div>
      `;
    }).join('');

    const fieldItems = this.assets.fields
      .map((fd) => {
        const isSel = this.profile.wallpaperBg === fd ? 'selected' : '';
        return `
        <div class="picker-item ${isSel}" data-val="${fd}" data-type="wallpaperBg" title="Field Background: ${fd.replace('.png', '')}">
          <img src="/icon/${fd}" class="picker-thumb" loading="lazy" />
        </div>
      `;
      })
      .join('');

    return presetItems + fieldItems;
  }

  public async init() {
    await customAssets.preloadAll();

    try {
      const [custRes, decksRes] = await Promise.all([
        fetch('/api/customization').then((r) => r.json()),
        fetch('/api/decks').then((r) => r.json()),
      ]);
      this.assets = { ...this.assets, ...custRes };
      deckStore.setPrebuilt(decksRes);
      this.callbacks.onAssetsLoaded?.(this.assets);
    } catch (e) {
      console.warn('Failed to load server customization assets:', e);
    }

    this.audio.setBgmVolume(this.profile.bgmVolume);
    this.audio.setSfxVolume(this.profile.sfxVolume);
    this.audio.setMuted(this.profile.isMuted);
    this.audio.playBGM(this.profile.mainBgm || 'BGM_MENU_01.ogg');

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
    const avatarSrc = this.resolveAvatarUrl();
    const theme1Src = this.resolveWallpaperUrl();
    const theme2Src = this.resolveWallpaperBgUrl();

    this.container.innerHTML = `
      <div class="main-menu-screen mdpro-layout">
        <!-- Main Menu Theme 2 (Back Background) + Theme 1 (Front Character Art) -->
        <div class="mdpro-bg-art">
          <img src="${theme2Src}" class="mdpro-theme2-bg" id="menu-theme2-img" alt="Main Menu Theme 2" onerror="this.src='/texture/TexSoloTransitionBG.png'" />
          <div class="mdpro-bg-overlay"></div>
          <img src="${theme1Src}" class="mdpro-hero-art" id="menu-wallpaper-img" alt="Main Menu Theme 1" onerror="this.src='/icon/WallPaperIcon1120001.png'" />
        </div>

        <!-- Top Header: Brand & Player Profile Badge -->
        <header class="mdpro-top-bar">
          <div class="mdpro-brand">
            <h1 class="mdpro-title">YU-GI-OH! <span class="mdpro-ver">MASTER DUEL WEB</span></h1>
            <span class="mdpro-sub">OCG / TCG 3D Simulator</span>
          </div>

          <div class="mdpro-top-right">
            <div class="mdpro-fps-badge" id="menu-fps-counter">60.0 FPS</div>
            <div class="user-profile-badge" id="btn-open-profile" title="Open Profile & Customization">
              <div class="user-avatar-container">
                <img src="${avatarSrc}" class="user-avatar-img" />
                <img src="/icon/${this.profile.profileFrame}" class="user-frame-overlay" />
              </div>
              <div class="user-text-info">
                <span class="user-name">${this.profile.playerName}</span>
                <span class="user-title">Master Duelist</span>
              </div>
            </div>
          </div>
        </header>

        <!-- Left Navigation Column: VS AI, Online, Deck, Options, Profile -->
        <div class="mdpro-nav-column">
          <nav class="mdpro-nav-list">
            <button class="mdpro-nav-item active" data-action="vs-ai">
              <span class="nav-text">VS AI</span>
              <span class="nav-arrow">&gt;</span>
            </button>
            <button class="mdpro-nav-item" data-action="online">
              <span class="nav-text">ONLINE</span>
              <span class="nav-sub-tag">TO BE IMPLEMENTED</span>
            </button>
            <button class="mdpro-nav-item" data-action="deck">
              <span class="nav-text">DECK</span>
              <span class="nav-arrow">&gt;</span>
            </button>
            <button class="mdpro-nav-item" data-action="options">
              <span class="nav-text">OPTIONS</span>
              <span class="nav-arrow">&gt;</span>
            </button>
            <button class="mdpro-nav-item" data-action="profile">
              <span class="nav-text">PROFILE</span>
              <span class="nav-arrow">&gt;</span>
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

        if (action === 'vs-ai') {
          this.openDuelSetupModal();
        } else if (action === 'online') {
          this.openOnlineModal();
        } else if (action === 'deck') {
          this.callbacks.onOpenDeckEditor();
        } else if (action === 'options') {
          this.openSettingsModal();
        } else if (action === 'profile') {
          this.openProfileModal();
        }
      });
    });

    this.container.querySelector('#btn-open-profile')?.addEventListener('click', () => {
      this.audio.playButtonClick();
      this.openProfileModal();
    });
  }

  // --- ONLINE (TO BE IMPLEMENTED) MODAL ---
  private openOnlineModal() {
    const modalHost = this.container.querySelector('#menu-modal-container')!;
    modalHost.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-window">
          <div class="modal-header">
            <h3>🌐 ONLINE MULTIPLAYER</h3>
            <button class="modal-close-btn" id="btn-close-online-modal">✕</button>
          </div>
          <div class="modal-body" style="text-align: center; padding: 28px 20px;">
            <div style="font-size: 42px; margin-bottom: 12px;">🚧</div>
            <h4 style="color: #00e5ff; font-size: 18px; margin-bottom: 10px;">To Be Implemented</h4>
            <p style="color: #b0c4de; font-size: 14px; line-height: 1.5; margin-bottom: 22px;">
              Online Multiplayer mode (PvP via WebSocket / WebRTC) is currently under development.<br/>
              In the meantime, challenge the AI in <strong>VS AI</strong> or build your decks in <strong>DECK</strong>!
            </p>
            <button class="btn btn-primary" id="btn-ok-online-modal">Got It</button>
          </div>
        </div>
      </div>
    `;
    const close = () => (modalHost.innerHTML = '');
    modalHost.querySelector('#btn-close-online-modal')?.addEventListener('click', close);
    modalHost.querySelector('#btn-ok-online-modal')?.addEventListener('click', close);
  }

  // --- 1. VS AI DUEL SETUP MODAL ---
  public openDuelSetupModal() {
    const modalHost = this.container.querySelector('#menu-modal-container')!;
    const allKeys = deckStore.keys();
    const mkOpts = (sel: string) =>
      allKeys.map((name) => {
        return `<option value="${name}" ${name === sel ? 'selected' : ''}>${deckStore.label(name)}</option>`;
      });
    const deckOptions = mkOpts(this.profile.playerDeckName);
    const aiDeckOptions = mkOpts(this.profile.aiDeckName);

    modalHost.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-window">
          <div class="modal-header">
            <h3>⚔ VS AI — DUEL SETUP</h3>
            <button class="modal-close-btn" id="btn-close-duel-modal">✕</button>
          </div>
          <div class="modal-body">
            <div class="duel-setup-grid">
              <div class="setup-player-card">
                <h4>YOUR DECK (${this.profile.playerName})</h4>
                <div class="avatar-preview-wrap">
                  <img src="${this.resolveAvatarUrl()}" class="preview-avatar" />
                  <img src="/icon/${this.profile.profileFrame}" class="preview-frame" />
                </div>
                <div class="setup-field">
                  <label>Select Deck:</label>
                  <select id="select-player-deck" class="deck-select">
                    ${deckOptions.join('')}
                  </select>
                </div>
              </div>

              <div class="vs-divider">VS</div>

              <div class="setup-player-card">
                <h4>OPPONENT (${this.profile.aiName})</h4>
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
              <button class="btn btn-primary btn-large" id="btn-start-duel-now">START DUEL</button>
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
        playerAvatar: this.resolveAvatarUrl(),
        playerFrame: this.profile.profileFrame,
        aiAvatar: '/icon/ProfileIcon1010001_L.png',
        field: this.profile.field,
        mate: this.profile.mate,
        protector: this.profile.protector,
        duelBgm: this.profile.duelBgm,
      });
    });
  }

  // --- 2. PROFILE MODAL (Name, Field Art, Main BGM, Pet, Avatar, Frame, Main Menu Theme 1 & 2, Card Sleeves) ---
  public openProfileModal(initialTab = 'tab-avatars') {
    const modalHost = this.container.querySelector('#menu-modal-container')!;
    const bgmOptions = MENU_BGM_OPTIONS.map(
      (opt) => `<option value="${opt.value}" ${opt.value === this.profile.mainBgm ? 'selected' : ''}>${opt.label}</option>`,
    ).join('');

    const normalizedDuelKey = normalizeDuelBgmKey(this.profile.duelBgm);
    const duelBgmOptions = getDuelBgmOptions()
      .map(
        (opt) =>
          `<option value="${opt.value}" ${opt.value === normalizedDuelKey ? 'selected' : ''}>${opt.label}</option>`,
      )
      .join('');

    modalHost.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-window modal-large">
          <div class="modal-header">
            <h3>👤 PROFILE & CUSTOMIZATION</h3>
            <button class="modal-close-btn" id="btn-close-profile-modal">✕</button>
          </div>
          <div class="modal-body custom-body">
            <!-- Names & BGM Section -->
            <div class="names-settings-row" style="grid-template-columns: repeat(4, 1fr);">
              <div class="input-group">
                <label>Player Name:</label>
                <input type="text" id="input-player-name" class="text-input" value="${this.profile.playerName}" />
              </div>
              <div class="input-group">
                <label>AI Name:</label>
                <input type="text" id="input-ai-name" class="text-input" value="${this.profile.aiName}" />
              </div>
              <div class="input-group">
                <label>Main Menu BGM:</label>
                <select id="select-main-bgm" class="deck-select">${bgmOptions}</select>
              </div>
              <div class="input-group">
                <label>Duel BGM (Dynamic):</label>
                <select id="select-duel-bgm" class="deck-select">${duelBgmOptions}</select>
              </div>
            </div>

            <!-- Accessories Tabs -->
            <div class="custom-tabs">
              <button class="custom-tab-btn ${initialTab === 'tab-avatars' ? 'active' : ''}" data-tab="tab-avatars">Profile Avatar</button>
              <button class="custom-tab-btn ${initialTab === 'tab-frames' ? 'active' : ''}" data-tab="tab-frames">Frame</button>
              <button class="custom-tab-btn ${initialTab === 'tab-fields' ? 'active' : ''}" data-tab="tab-fields">Field Art</button>
              <button class="custom-tab-btn ${initialTab === 'tab-mates' ? 'active' : ''}" data-tab="tab-mates">Mate (.PNG / .GLB 3D)</button>
              <button class="custom-tab-btn ${initialTab === 'tab-protectors' ? 'active' : ''}" data-tab="tab-protectors">Card Sleeves</button>
              <button class="custom-tab-btn ${initialTab === 'tab-wallpapers' ? 'active' : ''}" data-tab="tab-wallpapers">Main Menu Theme 1</button>
              <button class="custom-tab-btn ${initialTab === 'tab-wallpapers-bg' ? 'active' : ''}" data-tab="tab-wallpapers-bg">Main Menu Theme 2</button>
            </div>

            <!-- Tab 1: Avatars -->
            <div class="custom-tab-content ${initialTab === 'tab-avatars' ? 'active' : ''}" id="tab-avatars">
              <div class="upload-custom-bar">
                <label class="btn btn-secondary btn-sm">
                  📤 Upload Avatar (.PNG/.JPG)
                  <input type="file" id="upload-avatar-input" accept="image/*" style="display: none;" />
                </label>
                <span class="upload-hint" id="avatar-upload-status">
                  ${this.profile.avatarIcon === 'custom_avatar' ? '✓ Using Custom Avatar' : 'Choose from game assets or upload your own image'}
                </span>
              </div>
              <div class="items-picker-grid">
                ${this.assets.icons
                  .map(
                    (ic) => `
                  <div class="picker-item ${ic === this.profile.avatarIcon ? 'selected' : ''}" data-val="${ic}" data-type="avatar">
                    <img src="/icon/${ic}" class="picker-thumb" loading="lazy" />
                  </div>
                `,
                  )
                  .join('')}
              </div>
            </div>

            <!-- Tab 2: Frames -->
            <div class="custom-tab-content ${initialTab === 'tab-frames' ? 'active' : ''}" id="tab-frames">
              <div class="items-picker-grid">
                ${this.assets.frames
                  .map(
                    (fr) => `
                  <div class="picker-item ${fr === this.profile.profileFrame ? 'selected' : ''}" data-val="${fr}" data-type="frame">
                    <img src="/icon/${fr}" class="picker-thumb" loading="lazy" />
                  </div>
                `,
                  )
                  .join('')}
              </div>
            </div>

            <!-- Tab 3: Fields -->
            <div class="custom-tab-content ${initialTab === 'tab-fields' ? 'active' : ''}" id="tab-fields">
              <div class="upload-custom-bar">
                <label class="btn btn-secondary btn-sm">
                  📤 Upload Custom Field (.PNG/.JPG/.WEBP)
                  <input type="file" id="upload-field-input" accept="image/*" style="display: none;" />
                </label>
                <span class="upload-hint" id="field-upload-status">
                  ${this.profile.field === 'custom_field' ? '✓ Using Custom Uploaded Field' : 'Choose a game field or upload your own'}
                </span>
              </div>
              <div class="items-picker-grid">
                ${this.assets.fields
                  .map(
                    (fd) => `
                  <div class="picker-item ${fd === this.profile.field ? 'selected' : ''}" data-val="${fd}" data-type="field">
                    <img src="/icon/${fd}" class="picker-thumb" loading="lazy" />
                  </div>
                `,
                  )
                  .join('')}
              </div>
            </div>

            <!-- Tab 4: Mates (Pets - PNGs or Custom .GLB 3D) -->
            <div class="custom-tab-content ${initialTab === 'tab-mates' ? 'active' : ''}" id="tab-mates">
              <div class="upload-custom-bar">
                <label class="btn btn-primary btn-sm">
                  🧊 Upload 3D Mate (.GLB / .GLTF)
                  <input type="file" id="upload-mate-glb-input" accept=".glb,.gltf" style="display: none;" />
                </label>
                <label class="btn btn-secondary btn-sm">
                  📤 Upload 2D Mate (.PNG)
                  <input type="file" id="upload-mate-png-input" accept="image/*" style="display: none;" />
                </label>
                <span class="upload-hint" id="mate-upload-status">
                  ${
                    this.profile.mate === 'custom_mate_glb'
                      ? '✓ Using Custom 3D (.GLB) Model!'
                      : this.profile.mate === 'custom_mate_png'
                      ? '✓ Using Custom PNG Mate!'
                      : 'Choose a Mate below or upload your own 3D .GLB!'
                  }
                </span>
              </div>
              <div class="items-picker-grid">
                ${this.assets.mates
                  .map(
                    (mt) => `
                  <div class="picker-item ${mt === this.profile.mate ? 'selected' : ''}" data-val="${mt}" data-type="mate">
                    <img src="/icon/${mt}" class="picker-thumb" loading="lazy" />
                  </div>
                `,
                  )
                  .join('')}
              </div>
            </div>

            <!-- Tab 5: Card Sleeves (Protector) -->
            <div class="custom-tab-content ${initialTab === 'tab-protectors' ? 'active' : ''}" id="tab-protectors">
              <div class="upload-custom-bar">
                <label class="btn btn-secondary btn-sm">
                  📤 Upload Custom Card Sleeve (.PNG/.JPG)
                  <input type="file" id="upload-protector-input" accept="image/*" style="display: none;" />
                </label>
                <span class="upload-hint" id="protector-upload-status">
                  ${this.profile.protector === 'custom_protector' ? '✓ Using Custom Card Sleeve' : 'Select a Card Sleeve (Protector) or upload your own art'}
                </span>
              </div>
              <div class="items-picker-grid">
                ${this.renderProtectorGridHtml()}
              </div>
            </div>

            <!-- Tab 6: Main Menu Theme 1 (Front Character Art) -->
            <div class="custom-tab-content ${initialTab === 'tab-wallpapers' ? 'active' : ''}" id="tab-wallpapers">
              <div class="upload-custom-bar">
                <label class="btn btn-secondary btn-sm">
                  📤 Upload Main Menu Theme 1 (Front Art .PNG/.JPG)
                  <input type="file" id="upload-wallpaper-input" accept="image/*" style="display: none;" />
                </label>
                <span class="upload-hint" id="wallpaper-upload-status">
                  ${this.profile.wallpaper === 'custom_wallpaper' ? '✓ Using Custom Theme 1 (Front)' : 'Select the foreground monster/character cutout for the Main Menu'}
                </span>
              </div>
              <div class="items-picker-grid">
                ${this.assets.wallpapers
                  .map(
                    (wp) => `
                  <div class="picker-item ${wp === this.profile.wallpaper ? 'selected' : ''}" data-val="${wp}" data-type="wallpaper">
                    <img src="/icon/${wp}" class="picker-thumb" loading="lazy" />
                  </div>
                `,
                  )
                  .join('')}
              </div>
            </div>

            <!-- Tab 7: Main Menu Theme 2 (Back Background Art) -->
            <div class="custom-tab-content ${initialTab === 'tab-wallpapers-bg' ? 'active' : ''}" id="tab-wallpapers-bg">
              <div class="upload-custom-bar">
                <label class="btn btn-secondary btn-sm">
                  📤 Upload Main Menu Theme 2 (Background .PNG/.JPG)
                  <input type="file" id="upload-wallpaper-bg-input" accept="image/*" style="display: none;" />
                </label>
                <span class="upload-hint" id="wallpaper-bg-upload-status">
                  ${this.profile.wallpaperBg === 'custom_wallpaper_bg' ? '✓ Using Custom Theme 2 (Back)' : 'Select the background scene behind Main Menu Theme 1'}
                </span>
              </div>
              <div class="items-picker-grid">
                ${this.renderTheme2GridHtml()}
              </div>
            </div>

            <div class="custom-actions-bar">
              <button class="btn btn-primary" id="btn-save-profile">Save & Apply</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindCustomizationHandlers(modalHost, true);
  }

  // --- 3. OPTIONS MODAL (Audio + Field Art + Mate .GLB/.PNG + Card Sleeves) ---
  public openSettingsModal() {
    const modalHost = this.container.querySelector('#menu-modal-container')!;
    const bgmOptions = MENU_BGM_OPTIONS.map(
      (opt) => `<option value="${opt.value}" ${opt.value === this.profile.mainBgm ? 'selected' : ''}>${opt.label}</option>`,
    ).join('');

    modalHost.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-window modal-large">
          <div class="modal-header">
            <h3>⚙ OPTIONS — AUDIO, FIELD, MATE (.GLB) & SLEEVES</h3>
            <button class="modal-close-btn" id="btn-close-settings-modal">✕</button>
          </div>
          <div class="modal-body custom-body">
            <!-- Audio Sliders -->
            <div class="names-settings-row" style="grid-template-columns: repeat(4, 1fr); align-items: center;">
              <div class="settings-group" style="margin: 0;">
                <label>BGM Volume: <span id="bgm-val-label">${Math.round(this.profile.bgmVolume * 100)}%</span></label>
                <input type="range" id="range-bgm" min="0" max="1" step="0.05" value="${this.profile.bgmVolume}" class="volume-slider" />
              </div>
              <div class="settings-group" style="margin: 0;">
                <label>SFX Volume: <span id="sfx-val-label">${Math.round(this.profile.sfxVolume * 100)}%</span></label>
                <input type="range" id="range-sfx" min="0" max="1" step="0.05" value="${this.profile.sfxVolume}" class="volume-slider" />
              </div>
              <div class="input-group">
                <label>Menu BGM:</label>
                <select id="select-main-bgm" class="deck-select">${bgmOptions}</select>
              </div>
              <div style="display: flex; gap: 10px; align-items: center; padding-top: 14px;">
                <label class="checkbox-label">
                  <input type="checkbox" id="check-mute" ${this.profile.isMuted ? 'checked' : ''} />
                  <span>Mute</span>
                </label>
                <button class="btn btn-secondary btn-sm" id="btn-toggle-fs">Fullscreen</button>
              </div>
            </div>

            <!-- Customization Tabs inside Options -->
            <div class="custom-tabs">
              <button class="custom-tab-btn active" data-tab="tab-fields">Field Art</button>
              <button class="custom-tab-btn" data-tab="tab-mates">Mate (PNG or 3D .GLB Upload)</button>
              <button class="custom-tab-btn" data-tab="tab-protectors">Card Sleeves</button>
              <button class="custom-tab-btn" data-tab="tab-wallpapers">Main Menu Theme 1</button>
              <button class="custom-tab-btn" data-tab="tab-wallpapers-bg">Main Menu Theme 2</button>
            </div>

            <!-- Tab: Fields -->
            <div class="custom-tab-content active" id="tab-fields">
              <div class="upload-custom-bar">
                <label class="btn btn-secondary btn-sm">
                  📤 Upload Your Own Field (.PNG/.JPG)
                  <input type="file" id="upload-field-input" accept="image/*" style="display: none;" />
                </label>
                <span class="upload-hint" id="field-upload-status">
                  ${this.profile.field === 'custom_field' ? '✓ Custom Field Active' : 'Choose from game assets or upload your own'}
                </span>
              </div>
              <div class="items-picker-grid">
                ${this.assets.fields
                  .map(
                    (fd) => `
                  <div class="picker-item ${fd === this.profile.field ? 'selected' : ''}" data-val="${fd}" data-type="field">
                    <img src="/icon/${fd}" class="picker-thumb" loading="lazy" />
                  </div>
                `,
                  )
                  .join('')}
              </div>
            </div>

            <!-- Tab: Mates (Pets) -->
            <div class="custom-tab-content" id="tab-mates">
              <div class="upload-custom-bar">
                <label class="btn btn-primary btn-sm">
                  🧊 Upload Your Own 3D Mate (.GLB)!
                  <input type="file" id="upload-mate-glb-input" accept=".glb,.gltf" style="display: none;" />
                </label>
                <label class="btn btn-secondary btn-sm">
                  📤 Upload Mate (.PNG)
                  <input type="file" id="upload-mate-png-input" accept="image/*" style="display: none;" />
                </label>
                <span class="upload-hint" id="mate-upload-status">
                  ${
                    this.profile.mate === 'custom_mate_glb'
                      ? '✓ Custom 3D (.GLB) Model Active!'
                      : this.profile.mate === 'custom_mate_png'
                      ? '✓ Custom PNG Mate Active!'
                      : 'Choose a game Mate or upload a .GLB file!'
                  }
                </span>
              </div>
              <div class="items-picker-grid">
                ${this.assets.mates
                  .map(
                    (mt) => `
                  <div class="picker-item ${mt === this.profile.mate ? 'selected' : ''}" data-val="${mt}" data-type="mate">
                    <img src="/icon/${mt}" class="picker-thumb" loading="lazy" />
                  </div>
                `,
                  )
                  .join('')}
              </div>
            </div>

            <!-- Tab: Card Sleeves (Protector) -->
            <div class="custom-tab-content" id="tab-protectors">
              <div class="upload-custom-bar">
                <label class="btn btn-secondary btn-sm">
                  📤 Upload Your Own Card Sleeve (.PNG/.JPG)
                  <input type="file" id="upload-protector-input" accept="image/*" style="display: none;" />
                </label>
                <span class="upload-hint" id="protector-upload-status">
                  ${this.profile.protector === 'custom_protector' ? '✓ Custom Sleeve Active' : 'Yu-Gi-Oh! Default, Master Duel Sleeves, or custom upload'}
                </span>
              </div>
              <div class="items-picker-grid">
                ${this.renderProtectorGridHtml()}
              </div>
            </div>

            <!-- Tab: Main Menu Theme 1 (Front) -->
            <div class="custom-tab-content" id="tab-wallpapers">
              <div class="upload-custom-bar">
                <label class="btn btn-secondary btn-sm">
                  📤 Upload Main Menu Theme 1 (Front .PNG/.JPG)
                  <input type="file" id="upload-wallpaper-input" accept="image/*" style="display: none;" />
                </label>
                <span class="upload-hint" id="wallpaper-upload-status">
                  ${this.profile.wallpaper === 'custom_wallpaper' ? '✓ Custom Theme 1 Active' : 'Choose the front character art for the Main Menu'}
                </span>
              </div>
              <div class="items-picker-grid">
                ${this.assets.wallpapers
                  .map(
                    (wp) => `
                  <div class="picker-item ${wp === this.profile.wallpaper ? 'selected' : ''}" data-val="${wp}" data-type="wallpaper">
                    <img src="/icon/${wp}" class="picker-thumb" loading="lazy" />
                  </div>
                `,
                  )
                  .join('')}
              </div>
            </div>

            <!-- Tab: Main Menu Theme 2 (Back) -->
            <div class="custom-tab-content" id="tab-wallpapers-bg">
              <div class="upload-custom-bar">
                <label class="btn btn-secondary btn-sm">
                  📤 Upload Main Menu Theme 2 (Back .PNG/.JPG)
                  <input type="file" id="upload-wallpaper-bg-input" accept="image/*" style="display: none;" />
                </label>
                <span class="upload-hint" id="wallpaper-bg-upload-status">
                  ${this.profile.wallpaperBg === 'custom_wallpaper_bg' ? '✓ Custom Theme 2 Active' : 'Choose the background art behind Main Menu Theme 1'}
                </span>
              </div>
              <div class="items-picker-grid">
                ${this.renderTheme2GridHtml()}
              </div>
            </div>

            <div class="custom-actions-bar">
              <button class="btn btn-primary" id="btn-save-settings">Confirm & Save</button>
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

    this.bindCustomizationHandlers(modalHost, false);
  }

  private bindCustomizationHandlers(modalHost: Element, isProfileModal: boolean) {
    // Tab switching
    modalHost.querySelectorAll('.custom-tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        modalHost.querySelectorAll('.custom-tab-btn').forEach((b) => b.classList.remove('active'));
        modalHost.querySelectorAll('.custom-tab-content').forEach((c) => c.classList.remove('active'));
        const targetTab = (e.currentTarget as HTMLElement).getAttribute('data-tab');
        (e.currentTarget as HTMLElement).classList.add('active');
        modalHost.querySelector(`#${targetTab}`)?.classList.add('active');
      });
    });

    // BGM change
    const mainBgmSelect = modalHost.querySelector('#select-main-bgm') as HTMLSelectElement | null;
    mainBgmSelect?.addEventListener('change', () => {
      this.profile.mainBgm = mainBgmSelect.value;
      this.audio.playBGM(this.profile.mainBgm);
    });

    const duelBgmSelect = modalHost.querySelector('#select-duel-bgm') as HTMLSelectElement | null;
    duelBgmSelect?.addEventListener('change', () => {
      this.profile.duelBgm = duelBgmSelect.value;
    });

    // Item grid selection
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
        if (type === 'protector') this.profile.protector = val;
        if (type === 'wallpaper') this.profile.wallpaper = val;
        if (type === 'wallpaperBg') this.profile.wallpaperBg = val;
      });
    });

    // Custom File Uploads
    const bindUpload = (
      inputId: string,
      statusId: string,
      assetKey:
        | 'custom_field'
        | 'custom_mate_glb'
        | 'custom_mate_png'
        | 'custom_protector'
        | 'custom_wallpaper'
        | 'custom_wallpaper_bg'
        | 'custom_avatar',
      onDone: () => void,
    ) => {
      const input = modalHost.querySelector(`#${inputId}`) as HTMLInputElement | null;
      input?.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        const statusEl = modalHost.querySelector(`#${statusId}`);
        if (statusEl) statusEl.textContent = `Loading ${file.name}...`;
        await customAssets.saveFile(assetKey, file);
        onDone();
        if (statusEl) statusEl.textContent = `✓ File "${file.name}" loaded and selected!`;
      });
    };

    bindUpload('upload-avatar-input', 'avatar-upload-status', 'custom_avatar', () => {
      this.profile.avatarIcon = 'custom_avatar';
    });
    bindUpload('upload-field-input', 'field-upload-status', 'custom_field', () => {
      this.profile.field = 'custom_field';
    });
    bindUpload('upload-mate-glb-input', 'mate-upload-status', 'custom_mate_glb', () => {
      this.profile.mate = 'custom_mate_glb';
    });
    bindUpload('upload-mate-png-input', 'mate-upload-status', 'custom_mate_png', () => {
      this.profile.mate = 'custom_mate_png';
    });
    bindUpload('upload-protector-input', 'protector-upload-status', 'custom_protector', () => {
      this.profile.protector = 'custom_protector';
    });
    bindUpload('upload-wallpaper-input', 'wallpaper-upload-status', 'custom_wallpaper', () => {
      this.profile.wallpaper = 'custom_wallpaper';
    });
    bindUpload('upload-wallpaper-bg-input', 'wallpaper-bg-upload-status', 'custom_wallpaper_bg', () => {
      this.profile.wallpaperBg = 'custom_wallpaper_bg';
    });

    const closeBtnId = isProfileModal ? '#btn-close-profile-modal' : '#btn-close-settings-modal';
    const saveBtnId = isProfileModal ? '#btn-save-profile' : '#btn-save-settings';

    modalHost.querySelector(closeBtnId)?.addEventListener('click', () => {
      modalHost.innerHTML = '';
    });

    modalHost.querySelector(saveBtnId)?.addEventListener('click', () => {
      if (isProfileModal) {
        const pName = (modalHost.querySelector('#input-player-name') as HTMLInputElement)?.value;
        const aiName = (modalHost.querySelector('#input-ai-name') as HTMLInputElement)?.value;
        if (pName) this.profile.playerName = pName;
        if (aiName) this.profile.aiName = aiName;
      }
      this.saveProfile();
      modalHost.innerHTML = '';
      this.render();
    });
  }
}
