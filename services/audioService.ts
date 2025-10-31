// Audio Service for managing game sound effects
// All audio files are located in /public/sounds/

type SoundEffect = 
  | 'activate'      // Item activation sound
  | 'bg'           // Background music
  | 'buy'          // Shop purchase sound
  | 'collect'      // Reward collection sound
  | 'correct'      // Correct answer sound
  | 'hack_fail'    // Failed hack attempt
  | 'hack_win'     // Successful hack
  | 'level_up'     // Level up celebration
  | 'tada'         // General success sound
  | 'wrong';       // Wrong answer sound

class AudioManager {
  private sounds: Map<SoundEffect, HTMLAudioElement> = new Map();
  private audioEnabled: boolean = true;
  private bgMusic: HTMLAudioElement | null = null;
  private bgMusicEnabled: boolean = false;

  constructor() {
    // Load audio enabled state from localStorage
    const savedAudioState = localStorage.getItem('gbh_audio_enabled');
    this.audioEnabled = savedAudioState !== 'false';
    
    const savedBgMusicState = localStorage.getItem('gbh_bg_music_enabled');
    this.bgMusicEnabled = savedBgMusicState === 'true';
    
    this.preloadSounds();
  }

  private preloadSounds() {
    const soundFiles: SoundEffect[] = [
      'activate', 'buy', 'collect', 'correct', 
      'hack_fail', 'hack_win', 'level_up', 'tada', 'wrong'
    ];

    soundFiles.forEach(sound => {
      const audio = new Audio(`/sounds/${sound}.mp3`);
      audio.preload = 'auto';
      this.sounds.set(sound, audio);
    });

    // Separate handling for background music
    this.bgMusic = new Audio('/sounds/bg.mp3');
    this.bgMusic.loop = true;
    this.bgMusic.volume = 0.3; // Lower volume for background music
    
    if (this.bgMusicEnabled) {
      this.playBackgroundMusic();
    }
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
    if (!this.bgMusicEnabled || !this.bgMusic) return;
    
    this.bgMusic.play().catch(err => {
      console.warn('Failed to play background music:', err);
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
    localStorage.setItem('gbh_audio_enabled', enabled.toString());
    
    if (!enabled) {
      this.stopBackgroundMusic();
    } else if (this.bgMusicEnabled) {
      this.playBackgroundMusic();
    }
  }

  setBgMusicEnabled(enabled: boolean) {
    this.bgMusicEnabled = enabled;
    localStorage.setItem('gbh_bg_music_enabled', enabled.toString());
    
    if (enabled && this.audioEnabled) {
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
