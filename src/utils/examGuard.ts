export type ExamGuardViolationType =
  | 'copy'
  | 'cut'
  | 'paste'
  | 'shortcut'
  | 'contextmenu'
  | 'dragdrop'
  | 'tab_hidden'
  | 'window_blur'
  | 'suspicious_jump';

export interface ExamGuardViolation {
  type: ExamGuardViolationType;
  timestamp: number;
  wordCount: number;
  charCount: number;
  metadata?: Record<string, unknown>;
  violationsCount: number;
}

export interface ExamGuardConfig {
  promptContainer: HTMLElement;
  editor: HTMLElement;
  startButton?: HTMLElement | null;
  submitButton?: HTMLElement | null;
  onSubmit: () => void;
  onViolation: (violation: ExamGuardViolation) => void;
  testId?: string;
  userId?: string;
  logEndpoint?: string;
  maxViolations?: number;
  blurGraceMs?: number;
  toastDurationMs?: number;
  suspiciousJump?: {
    minDeltaChars?: number;
    maxDeltaMs?: number;
  };
  actions?: {
    warn?: boolean;
    showBanner?: boolean;
    disableEditor?: boolean;
    autosubmit?: boolean;
    blockSelectAll?: boolean;
  };
}

interface ExamGuardState {
  active: boolean;
  config: ExamGuardConfig | null;
  violationsCount: number;
  violationTimestamps: number[];
  listeners: Array<() => void>;
  toastEl: HTMLDivElement | null;
  bannerEl: HTMLDivElement | null;
  badgeEl: HTMLDivElement | null;
  blurTimer: number | null;
  lastInputAt: number | null;
  lastInputLength: number;
  storedUserSelect: string | null;
  storedContentEditable: string | null | undefined;
  storedDisabled: boolean | null;
}

const DEFAULT_MAX_VIOLATIONS = 3;
const DEFAULT_BLUR_GRACE_MS = 300;
const DEFAULT_TOAST_DURATION_MS = 4000;
const DEFAULT_SUSPICIOUS_MIN_CHARS = 80;
const DEFAULT_SUSPICIOUS_MAX_MS = 1200;

const STORAGE_PREFIX = 'ExamGuard';

const state: ExamGuardState = {
  active: false,
  config: null,
  violationsCount: 0,
  violationTimestamps: [],
  listeners: [],
  toastEl: null,
  bannerEl: null,
  badgeEl: null,
  blurTimer: null,
  lastInputAt: null,
  lastInputLength: 0,
  storedUserSelect: null,
  storedContentEditable: undefined,
  storedDisabled: null,
};

const getStorageKey = (testId?: string) =>
  `${STORAGE_PREFIX}:${testId ?? 'default'}`;

const getEditorText = (editor: HTMLElement) => {
  if (editor instanceof HTMLTextAreaElement) {
    return editor.value;
  }
  if (editor instanceof HTMLInputElement) {
    return editor.value;
  }
  return editor.textContent ?? '';
};

const getCounts = (editor: HTMLElement) => {
  const text = getEditorText(editor);
  const trimmed = text.trim();
  const wordCount = trimmed.length > 0 ? trimmed.split(/\s+/).length : 0;
  return {
    wordCount,
    charCount: text.length,
  };
};

const createToast = () => {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.style.position = 'fixed';
  el.style.bottom = '24px';
  el.style.right = '24px';
  el.style.maxWidth = '320px';
  el.style.padding = '12px 16px';
  el.style.background = 'rgba(12, 12, 18, 0.95)';
  el.style.color = '#fff';
  el.style.borderRadius = '8px';
  el.style.fontSize = '14px';
  el.style.lineHeight = '1.4';
  el.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.2)';
  el.style.zIndex = '9999';
  el.style.opacity = '0';
  el.style.transition = 'opacity 150ms ease-in-out';
  return el;
};

const createBanner = () => {
  const el = document.createElement('div');
  el.style.position = 'fixed';
  el.style.top = '0';
  el.style.left = '0';
  el.style.right = '0';
  el.style.padding = '10px 16px';
  el.style.background = 'rgba(199, 42, 64, 0.95)';
  el.style.color = '#fff';
  el.style.fontSize = '14px';
  el.style.textAlign = 'center';
  el.style.zIndex = '9998';
  el.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
  return el;
};

const createBadge = () => {
  const el = document.createElement('div');
  el.textContent = 'ExamGuard Active';
  el.style.position = 'fixed';
  el.style.bottom = '24px';
  el.style.left = '24px';
  el.style.padding = '6px 10px';
  el.style.background = 'rgba(65, 114, 222, 0.95)';
  el.style.color = '#fff';
  el.style.fontSize = '12px';
  el.style.borderRadius = '999px';
  el.style.zIndex = '9998';
  el.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
  return el;
};

const showToast = (message: string) => {
  if (!state.config?.actions?.warn) {
    return;
  }
  if (!state.toastEl) {
    state.toastEl = createToast();
  }
  state.toastEl.textContent = message;
  document.body.appendChild(state.toastEl);
  requestAnimationFrame(() => {
    if (state.toastEl) {
      state.toastEl.style.opacity = '1';
    }
  });
  window.setTimeout(() => {
    if (state.toastEl) {
      state.toastEl.style.opacity = '0';
      window.setTimeout(() => {
        state.toastEl?.remove();
      }, 200);
    }
  }, state.config?.toastDurationMs ?? DEFAULT_TOAST_DURATION_MS);
};

const showBanner = (message: string) => {
  if (!state.config?.actions?.showBanner) {
    return;
  }
  if (!state.bannerEl) {
    state.bannerEl = createBanner();
  }
  state.bannerEl.textContent = message;
  document.body.appendChild(state.bannerEl);
};

const showBadge = () => {
  if (!state.config?.actions?.showBanner) {
    return;
  }
  if (!state.badgeEl) {
    state.badgeEl = createBadge();
    document.body.appendChild(state.badgeEl);
  }
};

const clearBannerAndBadge = () => {
  state.bannerEl?.remove();
  state.badgeEl?.remove();
  state.bannerEl = null;
  state.badgeEl = null;
};

const updateSessionStorage = () => {
  if (!state.config) {
    return;
  }
  const payload = {
    count: state.violationsCount,
    timestamps: state.violationTimestamps,
  };
  try {
    sessionStorage.setItem(getStorageKey(state.config.testId), JSON.stringify(payload));
  } catch (error) {
    console.warn('ExamGuard: unable to persist session state', error);
  }
};

const restoreSessionStorage = (config: ExamGuardConfig) => {
  try {
    const stored = sessionStorage.getItem(getStorageKey(config.testId));
    if (!stored) {
      return;
    }
    const parsed = JSON.parse(stored) as { count?: number; timestamps?: number[] };
    state.violationsCount = parsed.count ?? 0;
    state.violationTimestamps = Array.isArray(parsed.timestamps) ? parsed.timestamps : [];
  } catch (error) {
    console.warn('ExamGuard: unable to restore session state', error);
  }
};

const sendViolationLog = (violation: ExamGuardViolation) => {
  if (!state.config?.logEndpoint) {
    return;
  }
  const payload = {
    testId: state.config.testId ?? null,
    userId: state.config.userId ?? null,
    type: violation.type,
    timestamp: violation.timestamp,
    wordCount: violation.wordCount,
    charCount: violation.charCount,
    metadata: violation.metadata ?? null,
  };
  try {
    const body = JSON.stringify(payload);
    const sent = navigator.sendBeacon(state.config.logEndpoint, body);
    if (!sent) {
      void fetch(state.config.logEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
        keepalive: true,
      });
    }
  } catch (error) {
    console.warn('ExamGuard: logging failed', error);
  }
};

const emitViolation = (type: ExamGuardViolationType, metadata?: Record<string, unknown>) => {
  if (!state.config) {
    return;
  }
  state.violationsCount += 1;
  const timestamp = Date.now();
  state.violationTimestamps.push(timestamp);
  updateSessionStorage();

  const counts = getCounts(state.config.editor);
  const violation: ExamGuardViolation = {
    type,
    timestamp,
    wordCount: counts.wordCount,
    charCount: counts.charCount,
    metadata,
    violationsCount: state.violationsCount,
  };

  state.config.onViolation(violation);
  sendViolationLog(violation);

  const maxViolations = state.config.maxViolations ?? DEFAULT_MAX_VIOLATIONS;
  if (state.violationsCount === 1) {
    showToast('ExamGuard notice: Please focus on your test and avoid restricted actions.');
  } else if (state.violationsCount === 2) {
    showToast('ExamGuard warning: Further violations will submit your test.');
    showBanner('ExamGuard is active. Restricted actions will be reported.');
    showBadge();
  }

  if (state.violationsCount >= maxViolations) {
    if (state.config.actions?.autosubmit ?? true) {
      showBanner('ExamGuard: Maximum violations reached. Submitting...');
      state.config.onSubmit();
    }
    if (state.config.actions?.disableEditor) {
      disableEditor();
    }
  }
};

const addListener = (
  target: EventTarget,
  type: string,
  handler: EventListenerOrEventListenerObject,
  options?: AddEventListenerOptions | boolean,
) => {
  target.addEventListener(type, handler, options);
  state.listeners.push(() => target.removeEventListener(type, handler, options));
};

const handleCopy = (event: ClipboardEvent) => {
  event.preventDefault();
  emitViolation('copy');
};

const handleCut = (event: ClipboardEvent) => {
  event.preventDefault();
  emitViolation('cut');
};

const handlePaste = (event: ClipboardEvent) => {
  event.preventDefault();
  const pastedText = event.clipboardData?.getData('text') ?? '';
  emitViolation('paste', {
    length: pastedText.length,
  });
};

const handleContextMenu = (event: MouseEvent) => {
  event.preventDefault();
  emitViolation('contextmenu');
};

const handleShortcut = (event: KeyboardEvent) => {
  if (!(event.ctrlKey || event.metaKey)) {
    return;
  }
  const key = event.key.toLowerCase();
  const blockSelectAll = state.config?.actions?.blockSelectAll ?? false;
  const blockedKeys = ['c', 'x', 'v'];
  if (blockSelectAll) {
    blockedKeys.push('a');
  }
  if (blockedKeys.includes(key)) {
    event.preventDefault();
    emitViolation('shortcut', { key });
  }
};

const handleDragOver = (event: DragEvent) => {
  event.preventDefault();
};

const handleDrop = (event: DragEvent) => {
  event.preventDefault();
  const droppedText = event.dataTransfer?.getData('text') ?? '';
  emitViolation('dragdrop', {
    length: droppedText.length,
  });
};

const handleVisibilityChange = () => {
  if (document.hidden) {
    emitViolation('tab_hidden');
  }
};

const handleBlur = () => {
  if (!state.config) {
    return;
  }
  const grace = state.config.blurGraceMs ?? DEFAULT_BLUR_GRACE_MS;
  if (grace <= 0) {
    emitViolation('window_blur');
    return;
  }
  if (state.blurTimer) {
    window.clearTimeout(state.blurTimer);
  }
  state.blurTimer = window.setTimeout(() => {
    if (!document.hasFocus()) {
      emitViolation('window_blur');
    }
  }, grace);
};

const handleFocus = () => {
  if (state.blurTimer) {
    window.clearTimeout(state.blurTimer);
    state.blurTimer = null;
  }
};

const handleInput = () => {
  if (!state.config) {
    return;
  }
  const now = Date.now();
  const text = getEditorText(state.config.editor);
  const length = text.length;

  if (state.lastInputAt !== null) {
    const deltaMs = now - state.lastInputAt;
    const deltaChars = length - state.lastInputLength;
    const minDelta = state.config.suspiciousJump?.minDeltaChars ?? DEFAULT_SUSPICIOUS_MIN_CHARS;
    const maxDeltaMs = state.config.suspiciousJump?.maxDeltaMs ?? DEFAULT_SUSPICIOUS_MAX_MS;

    if (deltaChars >= minDelta && deltaMs <= maxDeltaMs) {
      emitViolation('suspicious_jump', {
        deltaChars,
        deltaMs,
      });
    }
  }

  state.lastInputAt = now;
  state.lastInputLength = length;
};

const handleSelectStart = (event: Event) => {
  event.preventDefault();
};

const disableEditor = () => {
  if (!state.config) {
    return;
  }
  const editor = state.config.editor;
  if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
    state.storedDisabled = editor.disabled;
    editor.disabled = true;
  } else {
    state.storedContentEditable = editor.getAttribute('contenteditable');
    editor.setAttribute('contenteditable', 'false');
  }
};

const restoreEditorState = () => {
  if (!state.config) {
    return;
  }
  const editor = state.config.editor;
  if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
    if (state.storedDisabled !== null) {
      editor.disabled = state.storedDisabled;
    }
  } else if (state.storedContentEditable !== undefined) {
    if (state.storedContentEditable === null) {
      editor.removeAttribute('contenteditable');
    } else {
      editor.setAttribute('contenteditable', state.storedContentEditable);
    }
  }
};

const stopAllListeners = () => {
  state.listeners.forEach((remove) => remove());
  state.listeners = [];
};

export const ExamGuard = {
  start: (config: ExamGuardConfig) => {
    if (state.active) {
      return;
    }
    state.active = true;
    state.config = {
      ...config,
      actions: {
        warn: true,
        showBanner: true,
        disableEditor: false,
        autosubmit: true,
        blockSelectAll: false,
        ...config.actions,
      },
    };

    restoreSessionStorage(config);

    state.lastInputAt = null;
    state.lastInputLength = getEditorText(config.editor).length;

    state.storedUserSelect = config.promptContainer.style.userSelect;
    config.promptContainer.style.userSelect = 'none';

    addListener(config.promptContainer, 'selectstart', handleSelectStart);
    addListener(config.promptContainer, 'contextmenu', handleContextMenu);
    addListener(config.editor, 'contextmenu', handleContextMenu);

    addListener(document, 'copy', handleCopy);
    addListener(document, 'cut', handleCut);
    addListener(config.editor, 'paste', handlePaste);
    addListener(config.editor, 'dragover', handleDragOver);
    addListener(config.editor, 'drop', handleDrop);
    addListener(document, 'keydown', handleShortcut, true);

    addListener(document, 'visibilitychange', handleVisibilityChange);
    addListener(window, 'blur', handleBlur);
    addListener(window, 'focus', handleFocus);

    addListener(config.editor, 'input', handleInput);
  },
  stop: () => {
    if (!state.active) {
      return;
    }
    stopAllListeners();
    clearBannerAndBadge();
    state.toastEl?.remove();
    state.toastEl = null;

    if (state.config) {
      state.config.promptContainer.style.userSelect = state.storedUserSelect ?? '';
    }

    restoreEditorState();

    state.active = false;
    state.config = null;
    state.blurTimer = null;
    state.lastInputAt = null;
    state.lastInputLength = 0;
    state.storedUserSelect = null;
    state.storedContentEditable = undefined;
    state.storedDisabled = null;
  },
};
