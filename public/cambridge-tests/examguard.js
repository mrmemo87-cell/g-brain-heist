(function () {
  const DEFAULT_MAX_VIOLATIONS = 3;
  const DEFAULT_BLUR_GRACE_MS = 300;
  const DEFAULT_TOAST_DURATION_MS = 4000;
  const DEFAULT_SUSPICIOUS_MIN_CHARS = 80;
  const DEFAULT_SUSPICIOUS_MAX_MS = 1200;
  const STORAGE_PREFIX = 'ExamGuard';

  const state = {
    active: false,
    pending: false,
    config: null,
    violationsCount: 0,
    violationTimestamps: [],
    listeners: [],
    toastEl: null,
    bannerEl: null,
    badgeEl: null,
    blurTimer: null,
    inputState: new WeakMap(),
    storedUserSelect: new Map(),
    storedDisabled: new Map(),
  };

  const toArray = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value.filter(Boolean) : [value];
  };

  const getStorageKey = (testId) => `${STORAGE_PREFIX}:${testId || 'default'}`;

  const getEditorText = (editor) => {
    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      return editor.value;
    }
    return editor.textContent || '';
  };

  const getCounts = (editors) => {
    const text = editors.map(getEditorText).join(' ');
    const trimmed = text.trim();
    const wordCount = trimmed.length > 0 ? trimmed.split(/\s+/).length : 0;
    return { wordCount, charCount: text.length };
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

  const showToast = (message) => {
    if (!state.config?.actions?.warn) return;
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
          state.toastEl && state.toastEl.remove();
        }, 200);
      }
    }, state.config?.toastDurationMs || DEFAULT_TOAST_DURATION_MS);
  };

  const showBanner = (message) => {
    if (!state.config?.actions?.showBanner) return;
    if (!state.bannerEl) {
      state.bannerEl = createBanner();
    }
    state.bannerEl.textContent = message;
    document.body.appendChild(state.bannerEl);
  };

  const showBadge = () => {
    if (!state.config?.actions?.showBanner) return;
    if (!state.badgeEl) {
      state.badgeEl = createBadge();
      document.body.appendChild(state.badgeEl);
    }
  };

  const clearBannerAndBadge = () => {
    if (state.bannerEl) state.bannerEl.remove();
    if (state.badgeEl) state.badgeEl.remove();
    state.bannerEl = null;
    state.badgeEl = null;
  };

  const updateSessionStorage = () => {
    if (!state.config) return;
    try {
      sessionStorage.setItem(
        getStorageKey(state.config.testId),
        JSON.stringify({ count: state.violationsCount, timestamps: state.violationTimestamps }),
      );
    } catch (error) {
      console.warn('ExamGuard: unable to persist session state', error);
    }
  };

  const restoreSessionStorage = (config) => {
    try {
      const stored = sessionStorage.getItem(getStorageKey(config.testId));
      if (!stored) return;
      const parsed = JSON.parse(stored);
      state.violationsCount = parsed.count || 0;
      state.violationTimestamps = Array.isArray(parsed.timestamps) ? parsed.timestamps : [];
    } catch (error) {
      console.warn('ExamGuard: unable to restore session state', error);
    }
  };

  const sendViolationLog = (violation) => {
    if (!state.config?.logEndpoint) return;
    const payload = {
      testId: state.config.testId || null,
      userId: state.config.userId || null,
      type: violation.type,
      timestamp: violation.timestamp,
      wordCount: violation.wordCount,
      charCount: violation.charCount,
      metadata: violation.metadata || null,
    };
    try {
      const body = JSON.stringify(payload);
      const sent = navigator.sendBeacon(state.config.logEndpoint, body);
      if (!sent) {
        fetch(state.config.logEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => undefined);
      }
    } catch (error) {
      console.warn('ExamGuard: logging failed', error);
    }
  };

  const emitViolation = (type, metadata) => {
    if (!state.config) return;
    state.violationsCount += 1;
    const timestamp = Date.now();
    state.violationTimestamps.push(timestamp);
    updateSessionStorage();

    const editors = toArray(state.config.editor);
    const counts = getCounts(editors);
    const violation = {
      type,
      timestamp,
      wordCount: counts.wordCount,
      charCount: counts.charCount,
      metadata,
      violationsCount: state.violationsCount,
    };

    state.config.onViolation(violation);
    sendViolationLog(violation);

    const maxViolations = state.config.maxViolations || DEFAULT_MAX_VIOLATIONS;
    if (state.violationsCount === 1) {
      showToast('ExamGuard notice: Please focus on your test and avoid restricted actions.');
    } else if (state.violationsCount === 2) {
      showToast('ExamGuard warning: Further violations will submit your test.');
      showBanner('ExamGuard is active. Restricted actions will be reported.');
      showBadge();
    }

    if (state.violationsCount >= maxViolations) {
      if (state.config.actions?.autosubmit !== false) {
        showBanner('ExamGuard: Maximum violations reached. Submitting...');
        state.config.onSubmit();
      }
      if (state.config.actions?.disableEditor) {
        disableEditors(toArray(state.config.editor));
      }
    }
  };

  const addListener = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    state.listeners.push(() => target.removeEventListener(type, handler, options));
  };

  const handleCopy = (event) => {
    event.preventDefault();
    emitViolation('copy');
  };

  const handleCut = (event) => {
    event.preventDefault();
    emitViolation('cut');
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const pastedText = event.clipboardData?.getData('text') || '';
    emitViolation('paste', { length: pastedText.length });
  };

  const handleContextMenu = (event) => {
    event.preventDefault();
    emitViolation('contextmenu');
  };

  const handleShortcut = (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    const blockSelectAll = state.config?.actions?.blockSelectAll || false;
    const blockedKeys = ['c', 'x', 'v'];
    if (blockSelectAll) blockedKeys.push('a');
    if (blockedKeys.includes(key)) {
      event.preventDefault();
      emitViolation('shortcut', { key });
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const droppedText = event.dataTransfer?.getData('text') || '';
    emitViolation('dragdrop', { length: droppedText.length });
  };

  const handleVisibilityChange = () => {
    if (document.hidden) {
      emitViolation('tab_hidden');
    }
  };

  const handleBlur = () => {
    if (!state.config) return;
    const grace = state.config.blurGraceMs || DEFAULT_BLUR_GRACE_MS;
    if (grace <= 0) {
      emitViolation('window_blur');
      return;
    }
    if (state.blurTimer) window.clearTimeout(state.blurTimer);
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

  const handleInput = (event) => {
    const editor = event.currentTarget;
    if (!state.config) return;
    const now = Date.now();
    const text = getEditorText(editor);
    const length = text.length;
    const previous = state.inputState.get(editor) || { lastInputAt: null, lastInputLength: length };

    if (previous.lastInputAt !== null) {
      const deltaMs = now - previous.lastInputAt;
      const deltaChars = length - previous.lastInputLength;
      const minDelta = state.config.suspiciousJump?.minDeltaChars || DEFAULT_SUSPICIOUS_MIN_CHARS;
      const maxDeltaMs = state.config.suspiciousJump?.maxDeltaMs || DEFAULT_SUSPICIOUS_MAX_MS;

      if (deltaChars >= minDelta && deltaMs <= maxDeltaMs) {
        emitViolation('suspicious_jump', { deltaChars, deltaMs });
      }
    }

    state.inputState.set(editor, { lastInputAt: now, lastInputLength: length });
  };

  const handleSelectStart = (event) => {
    event.preventDefault();
  };

  const disableEditors = (editors) => {
    editors.forEach((editor) => {
      if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
        state.storedDisabled.set(editor, editor.disabled);
        editor.disabled = true;
      } else {
        state.storedDisabled.set(editor, editor.getAttribute('contenteditable'));
        editor.setAttribute('contenteditable', 'false');
      }
    });
  };

  const restoreEditors = (editors) => {
    editors.forEach((editor) => {
      const stored = state.storedDisabled.get(editor);
      if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
        if (stored !== undefined) {
          editor.disabled = stored;
        }
      } else if (stored !== undefined) {
        if (stored === null) {
          editor.removeAttribute('contenteditable');
        } else {
          editor.setAttribute('contenteditable', stored);
        }
      }
    });
    state.storedDisabled.clear();
  };

  const stopAllListeners = () => {
    state.listeners.forEach((remove) => remove());
    state.listeners = [];
  };

  // Internal: actually attach all listeners and activate ExamGuard
  const doStart = (config) => {
    if (state.active) return;
    state.active = true;
    state.pending = false;
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

    const promptContainers = toArray(config.promptContainer);
    const editors = toArray(config.editor);

    promptContainers.forEach((container) => {
      state.storedUserSelect.set(container, container.style.userSelect);
      container.style.userSelect = 'none';
      addListener(container, 'selectstart', handleSelectStart);
      addListener(container, 'contextmenu', handleContextMenu);
    });

    editors.forEach((editor) => {
      addListener(editor, 'contextmenu', handleContextMenu);
      addListener(editor, 'paste', handlePaste);
      addListener(editor, 'dragover', handleDragOver);
      addListener(editor, 'drop', handleDrop);
      addListener(editor, 'input', handleInput);
      state.inputState.set(editor, { lastInputAt: null, lastInputLength: getEditorText(editor).length });
    });

    addListener(document, 'copy', handleCopy);
    addListener(document, 'cut', handleCut);
    addListener(document, 'keydown', handleShortcut, true);
    addListener(document, 'visibilitychange', handleVisibilityChange);
    addListener(window, 'blur', handleBlur);
    addListener(window, 'focus', handleFocus);
  };

  const start = (config) => {
    if (state.active || state.pending) return;

    // If the anti-cheat modal is currently showing, defer activation
    // until the student clicks "I understand"
    const antiCheatModal = document.getElementById('antiCheatModal');
    if (antiCheatModal && antiCheatModal.classList.contains('show')) {
      const acceptBtn = document.getElementById('antiCheatAcceptBtn');
      if (acceptBtn) {
        state.pending = true;
        acceptBtn.addEventListener('click', () => {
          doStart(config);
        }, { once: true });
        return;
      }
    }

    doStart(config);
  };

  const stop = () => {
    if (!state.active) return;
    stopAllListeners();
    clearBannerAndBadge();
    if (state.toastEl) state.toastEl.remove();
    state.toastEl = null;

    const promptContainers = toArray(state.config?.promptContainer);
    promptContainers.forEach((container) => {
      const stored = state.storedUserSelect.get(container);
      container.style.userSelect = stored || '';
    });
    state.storedUserSelect.clear();

    const editors = toArray(state.config?.editor);
    restoreEditors(editors);

    state.active = false;
    state.pending = false;
    state.config = null;
    state.blurTimer = null;
    state.inputState = new WeakMap();
  };

  window.ExamGuard = { start, stop };
})();
