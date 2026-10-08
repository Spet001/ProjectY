export class AudioManager {
  private bgmAudio: HTMLAudioElement | null = null;
  private sfxMap = new Map<string, HTMLAudioElement>();
  private isMuted = false;
  private bgmVolume = 0.35;
  private sfxVolume = 0.7;
  private currentBgmTrack = '';

  constructor() {
    // SFX verificados existentes em Assets\Addressables\Sound
    const preloadList = [
      'SE_DECK_CARD_SELECT.ogg',
      'SE_CARDEXPAND_DISPLAY.ogg',
      'SE_CARDBREAK_01.ogg',
      'SE_ATTACK_A_LIGHT_DEFAULT_01.ogg',
    ];

    for (const name of preloadList) {
      const audio = new Audio(`/sound/${name}`);
      audio.preload = 'auto';
      this.sfxMap.set(name, audio);
    }
  }

  public playBGM(trackName: string = 'BGM_DUEL_NORMAL_01.ogg', loop = true) {
    if (this.currentBgmTrack === trackName && this.bgmAudio && !this.bgmAudio.paused) {
      return;
    }
    this.currentBgmTrack = trackName;

    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio.src = '';
    }

    this.bgmAudio = new Audio(`/sound/BGM/${trackName}`);
    this.bgmAudio.loop = loop;
    this.bgmAudio.volume = this.isMuted ? 0 : this.bgmVolume;
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
    this.playSFX('SE_DECK_CARD_SELECT.ogg', 0.85);
  }

  public playSummon(special = false) {
    if (special) {
      this.playSFX('SE_CARDEXPAND_DISPLAY.ogg', 1.0);
    } else {
      this.playSFX('SE_CARDEXPAND_DISPLAY.ogg', 0.85);
    }
  }

  public playSet() {
    this.playSFX('SE_DECK_CARD_SELECT.ogg', 0.7);
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

  public playHover() {
    this.playSFX('SE_DECK_CARD_SELECT.ogg', 0.35);
  }

  public playButtonClick() {
    this.playSFX('SE_DECK_CARD_SELECT.ogg', 0.5);
  }

  public playSelect() {
    this.playButtonClick();
  }

  public checkClimax(lp0: number, lp1: number) {
    if (lp0 <= 2000 || lp1 <= 2000) {
      if (this.currentBgmTrack !== 'BGM_DUEL_CLIMAX_01.ogg') {
        this.playBGM('BGM_DUEL_CLIMAX_01.ogg');
      }
    }
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
