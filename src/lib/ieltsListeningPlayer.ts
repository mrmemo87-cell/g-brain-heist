// Pure presentation rules for the practice Listening single-play player.
// The recording is heard once: it never restarts and never seeks backwards.
// If the phone interrupts playback (app switch, lock screen, call), the learner
// resumes from the paused position instead of losing the rest of the recording
// (IELTS Diagnostic Bible §6.1 "resume" and §13 "phone interruption").

export interface ListeningPlayerState {
  started: boolean;
  ended: boolean;
  interrupted: boolean;
}

export interface ListeningPlayerPresentation {
  /** Button is tappable (initial play, or resume after an interruption). */
  enabled: boolean;
  action: 'play' | 'resume' | 'none';
  icon: '▶' | '♪' | '✓';
  message: string;
  ariaLabel: string;
}

export function listeningPlayerPresentation(state: ListeningPlayerState): ListeningPlayerPresentation {
  if (state.ended) {
    return { enabled: false, action: 'none', icon: '✓', ariaLabel: 'Listening audio finished', message: 'Recording finished. Check your answers, then submit.' };
  }
  if (state.started && state.interrupted) {
    return { enabled: true, action: 'resume', icon: '▶', ariaLabel: 'Resume listening audio', message: 'Paused because you left the page. Tap to continue from where it stopped.' };
  }
  if (state.started) {
    return { enabled: false, action: 'none', icon: '♪', ariaLabel: 'Listening audio playing', message: 'Playing. Answer as you listen.' };
  }
  return { enabled: true, action: 'play', icon: '▶', ariaLabel: 'Play listening audio', message: 'Press play when you are ready. You hear it once.' };
}

/** A pause is an interruption only while a started, unfinished recording is not being auto-resumed. */
export function pauseMeansInterruption(state: ListeningPlayerState, autoResumeAllowed: boolean): boolean {
  return state.started && !state.ended && !autoResumeAllowed;
}
