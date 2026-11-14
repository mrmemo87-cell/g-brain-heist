// Audio Service for managing game sound effects
// All audio files are located in /public/sounds/
import { feelGameCue } from '../src/native/effects/gameFeedback.js';
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
        // Answers, wins and celebrations use the shared Brains Heist sound set (public/sounds/mascot),
        // so the website, the app and IELTS all sound the same.
        const soundFileMap = {
            'achievement': 'mascot/lesson-complete',
            'activate': 'activate',
            'bg': 'bg',
            'buy': 'buy',
            'collect': 'collect',
            'correct': 'mascot/correct',
            'hack_fail': 'mascot/wrong',
            'hack_win': 'mascot/battle-win',
            'level_up': 'level_up',
            'notification': 'notification',
            'tada': 'mascot/lesson-complete',
            'wrong': 'mascot/wrong'
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
        if (sound !== 'bg' && this.isBrowserRuntime)
            feelGameCue(sound); // phone vibration in the app; no-op on the website
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
        // The IELTS area is a study space: the game soundtrack never plays there.
        if (isQuietMusicPath())
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
/** Paths where the game soundtrack must stay silent (IELTS study area). */
export function isQuietMusicPath(pathname) {
    const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
    return path === '/ielts' || path.startsWith('/ielts/') || path.startsWith('/ielts-prep');
}
// Export singleton instance
export const audioService = new AudioManager();
// Entering the IELTS area stops any soundtrack that was already playing.
if (typeof window !== 'undefined') {
    const stopIfQuiet = () => {
        if (isQuietMusicPath())
            audioService.stopBackgroundMusic();
    };
    window.addEventListener('bh:routechange', stopIfQuiet);
    window.addEventListener('popstate', stopIfQuiet);
}
// Expose methods for IELTS pages to control music
export const stopBackgroundMusic = () => audioService.stopBackgroundMusic();
export const resumeBackgroundMusic = () => {
    if (audioService.isBgMusicEnabled() && audioService.isAudioEnabled()) {
        audioService.playBackgroundMusic();
    }
};
