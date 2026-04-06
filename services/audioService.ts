// Audio Service for managing game sound effects
// All audio files are located in /public/sounds/

type SoundEffect = 
  | 'achievement'  // Achievement unlocked (special fanfare)
  | 'activate'      // Item activation sound
  | 'bg'           // Background music
  | 'buy'          // Shop purchase sound
  | 'collect'      // Reward collection sound
  | 'correct'      // Correct answer sound
  | 'hack_fail'    // Failed hack attempt
  | 'hack_win'     // Successful hack
  | 'level_up'     // Level up celebration
  | 'notification' // Generic notification ping
  | 'tada'         // General success sound
  | 'wrong';       // Wrong answer sound

// Export SoundEffect type for external use
export type { SoundEffect };

class AudioManager {
  private sounds: Map<SoundEffect, HTMLAudioElement> = new Map();
  private audioEnabled: boolean = true;
  private bgMusic: HTMLAudioElement | null = null;
  private bgMusicEnabled: boolean = false;
  private hasUserInteracted: boolean = false;
  private readonly isBrowserRuntime: boolean = typeof window !== 'undefined' && typeof document !== 'undefined';
  private readonly hasLocalStorage: boolean = typeof localStorage !== 'undefined';
  private readonly hasAudioConstructor: boolean = typeof Audio !== 'undefined';

  constructor() {
    if (!this.isBrowserRuntime) {
      this.audioEnabled = false;
      this.bgMusicEnabled = false;
      return;
    }

    // Load audio enabled state from localStorage (default: true)
    const savedAudioState = this.hasLocalStorage ? localStorage.getItem('gbh_audio_enabled') : null;
    this.audioEnabled = savedAudioState !== 'false'; // Default to true
    
    const savedBgMusicState = this.hasLocalStorage ? localStorage.getItem('gbh_bg_music_enabled') : null;
    // Default to false so pages never start with background music automatically
    this.bgMusicEnabled = savedBgMusicState === 'true';
    
    this.preloadSounds();
    this.setupUserInteractionListener();
  }

  private setupUserInteractionListener() {
    if (!this.isBrowserRuntime) return;

    const handleInteraction = () => {
      if (!this.hasUserInteracted) {
        this.hasUserInteracted = true;
        // Remove listeners after first interaction
        document.removeEventListener('click', handleInteraction);
        document.removeEventListener('touchstart', handleInteraction);
        document.removeEventListener('keydown', handleInteraction);
      }
    };

    document.addEventListener('click', handleInteraction);
    document.addEventListener('touchstart', handleInteraction);
    document.addEventListener('keydown', handleInteraction);
  }

  private preloadSounds() {
    if (!this.hasAudioConstructor) return;

    // Map of sound effects to their file paths (some share files)
    const soundFileMap: Record<SoundEffect, string> = {
      'achievement': 'tada',    // Use tada for achievement (no achievement.mp3)
      'activate': 'activate',
      'bg': 'bg',
      'buy': 'buy',
      'collect': 'collect',
      'correct': 'correct',
      'hack_fail': 'hack_fail',
      'hack_win': 'hack_win',
      'level_up': 'level_up',
      'notification': 'notification',
      'tada': 'tada',
      'wrong': 'wrong'
    };

    (Object.entries(soundFileMap) as [SoundEffect, string][]).forEach(([sound, file]) => {
      const audio = new Audio(`/sounds/${file}.mp3`);
      audio.preload = 'auto';
      this.sounds.set(sound, audio);
    });

    // Separate handling for background music
    this.bgMusic = new Audio('/sounds/bg.mp3');
    this.bgMusic.loop = true;
    this.bgMusic.volume = 0.3; // Lower volume for background music
    
  }

  play(sound: SoundEffect) {
    if (!this.audioEnabled || sound === 'bg') return;
    
    const audio = this.sounds.get(sound);
    if (audio) {
      // Clone the audio to allow overlapping sounds
      const soundClone = audio.cloneNode() as HTMLAudioElement;
      soundClone.volume = 0.5;
      soundClone.play().catch(err => {
        console.warn(`Failed to play sound ${sound}:`, err);
      });
    }
  }

  playBackgroundMusic() {
    if (!this.bgMusicEnabled || !this.bgMusic || !this.hasUserInteracted) return;
    
    this.bgMusic.play().catch(err => {
      console.warn('Failed to play background music (autoplay blocked):', err);
    });
  }

  stopBackgroundMusic() {
    if (this.bgMusic) {
      this.bgMusic.pause();
      this.bgMusic.currentTime = 0;
    }
  }

  setAudioEnabled(enabled: boolean) {
    this.audioEnabled = enabled;
    if (this.hasLocalStorage) {
      localStorage.setItem('gbh_audio_enabled', enabled.toString());
    }
    
    if (!enabled) {
      this.stopBackgroundMusic();
    } else if (this.bgMusicEnabled && this.hasUserInteracted) {
      this.playBackgroundMusic();
    }
  }

  setBgMusicEnabled(enabled: boolean) {
    this.bgMusicEnabled = enabled;
    if (this.hasLocalStorage) {
      localStorage.setItem('gbh_bg_music_enabled', enabled.toString());
    }
    
    if (enabled && this.audioEnabled && this.hasUserInteracted) {
      this.playBackgroundMusic();
    } else {
      this.stopBackgroundMusic();
    }
  }

  isAudioEnabled(): boolean {
    return this.audioEnabled;
  }

  isBgMusicEnabled(): boolean {
    return this.bgMusicEnabled;
  }
}

// Export singleton instance
export const audioService = new AudioManager();

// Expose methods for IELTS pages to control music
export const stopBackgroundMusic = () => audioService.stopBackgroundMusic();
export const resumeBackgroundMusic = () => {
  if (audioService.isBgMusicEnabled() && audioService.isAudioEnabled()) {
    audioService.playBackgroundMusic();
  }
};
