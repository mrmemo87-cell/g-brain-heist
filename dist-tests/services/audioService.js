// Audio Service for managing game sound effects
// All audio files are located in /public/sounds/
class AudioManager {
    constructor() {
        this.sounds = new Map();
        this.audioEnabled = true;
        this.bgMusic = null;
        this.bgMusicEnabled = false;
        this.hasUserInteracted = false;
        this.isBrowserRuntime = typeof window !== 'undefined' && typeof document !== 'undefined';
        this.hasLocalStorage = typeof localStorage !== 'undefined';
        this.hasAudioConstructor = typeof Audio !== 'undefined';
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
    setupUserInteractionListener() {
        if (!this.isBrowserRuntime)
            return;
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
    preloadSounds() {
        if (!this.hasAudioConstructor)
            return;
        // Map of sound effects to their file paths (some share files)
        const soundFileMap = {
            'achievement': 'tada', // Use tada for achievement (no achievement.mp3)
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
        Object.entries(soundFileMap).forEach(([sound, file]) => {
            const audio = new Audio(`/sounds/${file}.mp3`);
            audio.preload = 'auto';
            this.sounds.set(sound, audio);
        });
        // Separate handling for background music
        this.bgMusic = new Audio('/sounds/bg.mp3');
        this.bgMusic.loop = true;
        this.bgMusic.volume = 0.3; // Lower volume for background music
    }
    play(sound) {
        if (!this.audioEnabled || sound === 'bg')
            return;
        const audio = this.sounds.get(sound);
        if (audio) {
            // Clone the audio to allow overlapping sounds
            const soundClone = audio.cloneNode();
            soundClone.volume = 0.5;
            soundClone.play().catch(err => {
                console.warn(`Failed to play sound ${sound}:`, err);
            });
        }
    }
    playBackgroundMusic() {
        if (!this.bgMusicEnabled || !this.bgMusic || !this.hasUserInteracted)
            return;
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
    setAudioEnabled(enabled) {
        this.audioEnabled = enabled;
        if (this.hasLocalStorage) {
            localStorage.setItem('gbh_audio_enabled', enabled.toString());
        }
        if (!enabled) {
            this.stopBackgroundMusic();
        }
        else if (this.bgMusicEnabled && this.hasUserInteracted) {
            this.playBackgroundMusic();
        }
    }
    setBgMusicEnabled(enabled) {
        this.bgMusicEnabled = enabled;
        if (this.hasLocalStorage) {
            localStorage.setItem('gbh_bg_music_enabled', enabled.toString());
        }
        if (enabled && this.audioEnabled && this.hasUserInteracted) {
            this.playBackgroundMusic();
        }
        else {
            this.stopBackgroundMusic();
        }
    }
    isAudioEnabled() {
        return this.audioEnabled;
    }
    isBgMusicEnabled() {
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
