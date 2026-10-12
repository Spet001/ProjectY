import { LOCATION } from '../engine/constants';

export interface BgmOption {
  value: string;
  label: string;
}

export const MENU_BGM_OPTIONS: BgmOption[] = [
  { value: 'BGM_MENU_01.ogg', label: 'MENU Default' },
  { value: 'BGM_MENU_02.ogg', label: 'MENU Deck Editor' },
  { value: 'BGM_MENU_RETRO.ogg', label: 'MENU Retro' },
  { value: 'BGM_SOLO_GATE.ogg', label: 'MENU Solo Gate' },
  { value: 'BGM_TUTORIAL_01.ogg', label: 'MENU Tutorial' },
];

export const DUEL_BGM_GROUPS: Record<string, { label: string; tracks: string[] }> = {
  DUEL_RANDOM: {
    label: 'DUEL RANDOM (Dynamic Rotation)',
    tracks: [
      'BGM_DUEL_NORMAL_01.ogg', 'BGM_DUEL_KEYCARD_01.ogg', 'BGM_DUEL_CLIMAX_01.ogg',
      'BGM_DUEL_NORMAL_02.ogg', 'BGM_DUEL_KEYCARD_02.ogg', 'BGM_DUEL_CLIMAX_02.ogg',
      'BGM_DUEL_NORMAL_03.ogg', 'BGM_DUEL_KEYCARD_03.ogg', 'BGM_DUEL_CLIMAX_03.ogg',
      'BGM_DUEL_NORMAL_04.ogg', 'BGM_DUEL_KEYCARD_04.ogg', 'BGM_DUEL_CLIMAX_04.ogg',
      'BGM_DUEL_NORMAL_05.ogg', 'BGM_DUEL_KEYCARD_05.ogg', 'BGM_DUEL_CLIMAX_05.ogg',
      'BGM_DUEL_NORMAL_06.ogg', 'BGM_DUEL_KEYCARD_06.ogg', 'BGM_DUEL_CLIMAX_06.ogg',
      'BGM_DUEL_NORMAL_07.ogg', 'BGM_DUEL_KEYCARD_07.ogg', 'BGM_DUEL_CLIMAX_07.ogg',
      'BGM_DUEL_NORMAL_08.ogg', 'BGM_DUEL_KEYCARD_08.ogg', 'BGM_DUEL_CLIMAX_08.ogg',
      'BGM_DUEL_NORMAL_09.ogg', 'BGM_DUEL_KEYCARD_09.ogg', 'BGM_DUEL_CLIMAX_09.ogg',
      'BGM_DUEL_NORMAL_10.ogg', 'BGM_DUEL_KEYCARD_10.ogg', 'BGM_DUEL_CLIMAX_10.ogg',
      'BGM_DUEL_NORMAL_11.ogg', 'BGM_DUEL_KEYCARD_11.ogg', 'BGM_DUEL_CLIMAX_11.ogg',
      'BGM_DUEL_NORMAL_12.ogg', 'BGM_DUEL_KEYCARD_12.ogg', 'BGM_DUEL_CLIMAX_12.ogg',
      'BGM_DUEL_NORMAL_13.ogg', 'BGM_DUEL_KEYCARD_13.ogg', 'BGM_DUEL_CLIMAX_13.ogg',
      'BGM_DUEL_NORMAL_14.ogg', 'BGM_DUEL_KEYCARD_14.ogg', 'BGM_DUEL_CLIMAX_14.ogg',
      'BGM_DUEL_NORMAL_15.ogg', 'BGM_DUEL_KEYCARD_15.ogg', 'BGM_DUEL_CLIMAX_15.ogg',
      'BGM_DUEL_NORMAL_16.ogg', 'BGM_DUEL_KEYCARD_16.ogg', 'BGM_DUEL_CLIMAX_16.ogg',
    ],
  },
};

for (let i = 1; i <= 16; i++) {
  const num = String(i).padStart(2, '0');
  DUEL_BGM_GROUPS[`DUEL_NORMAL_${num}`] = {
    label: `DUEL NORMAL ${num}`,
    tracks: [
      `BGM_DUEL_NORMAL_${num}.ogg`,
      `BGM_DUEL_KEYCARD_${num}.ogg`,
      `BGM_DUEL_CLIMAX_${num}.ogg`,
    ],
  };
}

for (let i = 1; i <= 10; i++) {
  const num = String(i).padStart(2, '0');
  DUEL_BGM_GROUPS[`DUEL_EX_${num}`] = {
    label: `DUEL EX ${num}`,
    tracks: [
      `BGM_DUEL_EX_${num}_NORMAL.ogg`,
      `BGM_DUEL_EX_${num}_KEYCARD.ogg`,
      `BGM_DUEL_EX_${num}_CLIMAX.ogg`,
    ],
  };
}

DUEL_BGM_GROUPS['DUEL_DC01'] = {
  label: 'DUEL DC 01',
  tracks: ['BGM_DUEL_DC01_NORMAL.ogg', 'BGM_DUEL_DC01_KEYCARD.ogg', 'BGM_DUEL_DC01_CLIMAX.ogg'],
};
DUEL_BGM_GROUPS['DUEL_DC02'] = {
  label: 'DUEL DC 02',
  tracks: ['BGM_DUEL_DC02_NORMAL.ogg', 'BGM_DUEL_DC02_KEYCARD.ogg', 'BGM_DUEL_DC02_CLIMAX.ogg'],
};
DUEL_BGM_GROUPS['DUEL_RATE01'] = {
  label: 'DUEL RATE 01',
  tracks: ['BGM_DUEL_RATE01_NORMAL.ogg', 'BGM_DUEL_RATE01_KEYCARD.ogg', 'BGM_DUEL_RATE01_CLIMAX.ogg'],
};

export function getDuelBgmOptions(): BgmOption[] {
  return Object.entries(DUEL_BGM_GROUPS).map(([value, info]) => ({
    value,
    label: info.label,
  }));
}

export function normalizeDuelBgmKey(raw: string): string {
  if (!raw) return 'DUEL_NORMAL_01';
  if (DUEL_BGM_GROUPS[raw]) return raw;
  const m = raw.match(/BGM_DUEL_(?:NORMAL|KEYCARD|CLIMAX)_(\d{2})/i);
  if (m) return `DUEL_NORMAL_${m[1]}`;
  return 'DUEL_NORMAL_01';
}

export class AudioManager {
  private bgmAudio: HTMLAudioElement | null = null;
  private sfxMap = new Map<string, HTMLAudioElement>();
  private isMuted = false;
  private bgmVolume = 0.35;
  private sfxVolume = 0.7;
  private currentBgmTrack = '';
  private activeDuelPool: string[] = [];
  private isDuelMode = false;

  constructor() {
    const preloadList = [
      'SE_DECK_CARD_SELECT.ogg',
      'SE_CARDEXPAND_DISPLAY.ogg',
      'SE_CARDBREAK_01.ogg',
      'SE_ATTACK_A_LIGHT_DEFAULT_01.ogg',
      'SE_CARD_MOVE_01.ogg',
      'SE_CARD_MOVE_02.ogg',
      'SE_CEMETARY_ABSORB.ogg',
      'SE_CEMETARY_GOOUT.ogg',
      'SE_CARD_EXCLUSION.ogg',
      'SE_DUELCHAIN_01.ogg',
      'SE_DUELCHAIN_STACK01.ogg',
      'SE_DUELCHAIN_RESOLVE01.ogg',
      'SE_CHAIN_END.ogg',
    ];

    for (const name of preloadList) {
      const audio = new Audio(`/sound/${name}`);
      audio.preload = 'auto';
      this.sfxMap.set(name, audio);
    }
  }

  public playBGM(trackOrGroup: string = 'BGM_MENU_01.ogg', loop = true) {
    // Check if this is a unified Duel BGM group or duel track
    if (
      trackOrGroup.startsWith('DUEL_') ||
      trackOrGroup.startsWith('BGM_DUEL_')
    ) {
      this.playDuelBGM(trackOrGroup);
      return;
    }

    this.isDuelMode = false;
    this.activeDuelPool = [];

    if (this.currentBgmTrack === trackOrGroup && this.bgmAudio && !this.bgmAudio.paused) {
      return;
    }
    this.currentBgmTrack = trackOrGroup;
    this.startAudioElement(trackOrGroup, loop);
  }

  /**
   * Plays a unified Duel BGM group (e.g. DUEL NORMAL 01 = NORMAL_01 + KEYCARD_01 + CLIMAX_01)
   * and randomly cycles between tracks when each song ends instead of looping a single file.
   */
  public playDuelBGM(groupKeyOrTrack: string = 'DUEL_NORMAL_01') {
    const normalizedKey = normalizeDuelBgmKey(groupKeyOrTrack);
    const group = DUEL_BGM_GROUPS[normalizedKey] ?? DUEL_BGM_GROUPS['DUEL_NORMAL_01'];
    const allDuelTracks = DUEL_BGM_GROUPS['DUEL_RANDOM'].tracks;

    // Pool combines the selected group's 3 phases (Normal, Keycard, Climax) + random rotation
    this.activeDuelPool = normalizedKey === 'DUEL_RANDOM' ? allDuelTracks : group.tracks;
    this.isDuelMode = true;

    const nextTrack = this.pickRandomTrack(this.activeDuelPool, this.currentBgmTrack);
    this.currentBgmTrack = nextTrack;
    this.startAudioElement(nextTrack, false);
  }

  private pickRandomTrack(pool: string[], excludeTrack?: string): string {
    if (!pool || pool.length === 0) return 'BGM_DUEL_NORMAL_01.ogg';
    const candidates = pool.length > 1 ? pool.filter((t) => t !== excludeTrack) : pool;
    const idx = Math.floor(Math.random() * candidates.length);
    return candidates[idx] ?? pool[0];
  }

  private startAudioElement(trackFile: string, loop: boolean) {
    if (this.bgmAudio) {
      this.bgmAudio.onended = null;
      this.bgmAudio.pause();
      this.bgmAudio.src = '';
    }

    this.bgmAudio = new Audio(`/sound/BGM/${trackFile}`);
    this.bgmAudio.loop = loop;
    this.bgmAudio.volume = this.isMuted ? 0 : this.bgmVolume;

    if (!loop && this.isDuelMode) {
      this.bgmAudio.onended = () => {
        if (!this.isDuelMode) return;
        // Cycle randomly across the unified duel tracks (and broader duel themes)
        const combinedPool =
          this.activeDuelPool.length > 1
            ? this.activeDuelPool
            : DUEL_BGM_GROUPS['DUEL_RANDOM'].tracks;
        const next = this.pickRandomTrack(combinedPool, this.currentBgmTrack);
        this.currentBgmTrack = next;
        this.startAudioElement(next, false);
      };
    }

    this.bgmAudio.play().catch(() => {
      const unlockAudio = () => {
        if (this.bgmAudio && !this.isMuted) {
          this.bgmAudio.play().catch(() => {});
        }
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
      };
      window.addEventListener('click', unlockAudio);
      window.addEventListener('keydown', unlockAudio);
    });
  }

  public playSFX(name: string, volumeScale = 1.0) {
    if (this.isMuted) return;

    let audio = this.sfxMap.get(name);
    if (!audio) {
      audio = new Audio(`/sound/${name}`);
      this.sfxMap.set(name, audio);
    }

    try {
      const clone = audio.cloneNode() as HTMLAudioElement;
      clone.volume = Math.min(1, this.sfxVolume * volumeScale);
      clone.play().catch(() => {});
    } catch {
      // Audio fallback
    }
  }

  public playDraw() {
    this.playSFX('SE_CARD_MOVE_01.ogg', 0.85);
  }

  public playCardMove(fromLoc: number, toLoc: number) {
    const moveIdx = 1 + Math.floor(Math.random() * 3);
    this.playSFX(`SE_CARD_MOVE_0${moveIdx}.ogg`, 0.8);

    if (toLoc === LOCATION.GRAVE) {
      this.playSFX('SE_CEMETARY_ABSORB.ogg', 0.85);
    } else if (toLoc === LOCATION.REMOVED) {
      this.playSFX('SE_CARD_EXCLUSION.ogg', 0.85);
    } else if (fromLoc === LOCATION.GRAVE) {
      this.playSFX('SE_CEMETARY_GOOUT.ogg', 0.85);
    }
  }

  public playChainStart() {
    this.playSFX('SE_DUELCHAIN_01.ogg', 0.95);
  }

  public playChainLink() {
    this.playSFX('SE_DUELCHAIN_STACK01.ogg', 0.95);
  }

  public playChainResolve() {
    this.playSFX('SE_DUELCHAIN_RESOLVE01.ogg', 0.95);
  }

  public playChainEnd() {
    this.playSFX('SE_CHAIN_END.ogg', 0.85);
  }

  public playSummon(special = false) {
    if (special) {
      this.playSFX('SE_CARDEXPAND_DISPLAY.ogg', 1.0);
    } else {
      this.playSFX('SE_CARDEXPAND_DISPLAY.ogg', 0.85);
    }
  }

  public playSet() {
    this.playSFX('SE_CARD_MOVE_02.ogg', 0.75);
  }

  public playActivate() {
    this.playSFX('SE_CARDEXPAND_DISPLAY.ogg', 0.9);
  }

  public playAttack() {
    this.playSFX('SE_ATTACK_A_LIGHT_DEFAULT_01.ogg', 0.95);
  }

  public playDamage() {
    this.playSFX('SE_CARDBREAK_01.ogg', 1.0);
  }

  public playWin() {
    this.playSFX('SE_DUELCHAIN_RESOLVE01.ogg', 1.0);
  }

  public playLose() {
    this.playSFX('SE_CARDBREAK_01.ogg', 1.0);
  }

  public playHover() {
    this.playSFX('SE_DECK_CARD_SELECT.ogg', 0.35);
  }

  public playButtonClick() {
    this.playSFX('SE_DECK_CARD_SELECT.ogg', 0.5);
  }

  public playSelect() {
    this.playButtonClick();
  }

  public checkClimax(_lp0: number, _lp1: number) {
    // Unified duel tracks currently rotate randomly on track completion
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.bgmAudio) {
      this.bgmAudio.volume = this.isMuted ? 0 : this.bgmVolume;
    }
    return this.isMuted;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.bgmAudio) {
      this.bgmAudio.volume = this.isMuted ? 0 : this.bgmVolume;
    }
  }

  public isMute(): boolean {
    return this.isMuted;
  }

  public setBgmVolume(val: number) {
    this.bgmVolume = Math.max(0, Math.min(1, val));
    if (this.bgmAudio && !this.isMuted) {
      this.bgmAudio.volume = this.bgmVolume;
    }
  }

  public getBgmVolume(): number {
    return this.bgmVolume;
  }

  public setSfxVolume(val: number) {
    this.sfxVolume = Math.max(0, Math.min(1, val));
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }
}
