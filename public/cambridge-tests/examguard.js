(function () {
  const DEFAULT_MAX_VIOLATIONS = 3;
  const DEFAULT_BLUR_GRACE_MS = 300;
  const DEFAULT_TOAST_DURATION_MS = 4000;
  const DEFAULT_SUSPICIOUS_MIN_CHARS = 80;
  const DEFAULT_SUSPICIOUS_MAX_MS = 1200;
  const STORAGE_PREFIX = 'ExamGuard';
  // Dedup windows: prevent double-counting from related events
  const VISIBILITY_DEDUP_MS = 600;
  const CLIPBOARD_DEDUP_MS = 300;

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
    printStyleEl: null,
    blurOverlayEl: null,
    // Dedup: last visibility/focus violation timestamp and event kind
    lastVisibilityViolationAt: 0,
    lastVisibilityEvent: null, // 'tab_hidden' | 'window_blur'
    // Dedup: last clipboard-shortcut key and timestamp
    lastShortcutKey: null,
    lastShortcutAt: 0,
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
      const key = getStorageKey(config.testId);
      const stored = sessionStorage.getItem(key);
      if (!stored) return;
      // Clear stale violations on fresh page load so students aren't
      // penalised for a page refresh or navigation back to the test.
      sessionStorage.removeItem(key);
      state.violationsCount = 0;
      state.violationTimestamps = [];
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

  // Returns true (and clears the shortcut state) when the clipboard event
  // duplicates a keyboard-shortcut violation that was already counted.
  const ignoreRecentShortcut = (key) => {
    if (state.lastShortcutKey === key && Date.now() - state.lastShortcutAt < CLIPBOARD_DEDUP_MS) {
      state.lastShortcutKey = null;
      return true;
    }
    return false;
  };

  const handleCopy = (event) => {
    event.preventDefault();
    if (ignoreRecentShortcut('c')) return;
    emitViolation('copy');
  };

  const handleCut = (event) => {
    event.preventDefault();
    if (ignoreRecentShortcut('x')) return;
    emitViolation('cut');
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const pastedText = event.clipboardData?.getData('text') || '';
    if (ignoreRecentShortcut('v')) return;
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
      // Record shortcut so the subsequent clipboard event handler deduplicates
      state.lastShortcutKey = key;
      state.lastShortcutAt = Date.now();
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

  // ====== Screenshot & screen-capture prevention ======

  const handlePrintScreen = (event) => {
    const isPrintScreen = event.key === 'PrintScreen';
    const isSnippingTool = (event.metaKey || event.key === 'Meta') && event.shiftKey && event.key.toLowerCase() === 's';
    if (isPrintScreen || isSnippingTool) {
      event.preventDefault();
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('').catch(() => {});
        }
      } catch (e) { /* clipboard API may not be available */ }
      emitViolation('screenshot_attempt', { key: event.key });
    }
  };

  const injectPrintBlocker = () => {
    if (state.printStyleEl) return;
    const style = document.createElement('style');
    style.id = 'examguard-print-blocker';
    style.textContent = [
      '@media print {',
      '  body * { display: none !important; visibility: hidden !important; }',
      '  body::after {',
      '    content: "Printing is disabled during this exam.";',
      '    display: block !important; visibility: visible !important;',
      '    font-size: 24px; text-align: center; padding: 80px 20px;',
      '    color: #333;',
      '  }',
      '}',
    ].join('\n');
    document.head.appendChild(style);
    state.printStyleEl = style;
  };

  const removePrintBlocker = () => {
    if (state.printStyleEl) {
      state.printStyleEl.remove();
      state.printStyleEl = null;
    }
  };

  const handlePrintShortcut = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      emitViolation('print_attempt');
    }
  };

  const createBlurOverlay = () => {
    const el = document.createElement('div');
    el.id = 'examguard-blur-overlay';
    el.style.cssText = [
      'position:fixed; inset:0; z-index:99999;',
      'background:rgba(15,15,25,0.97);',
      'display:flex; align-items:center; justify-content:center;',
      'color:#fff; font-size:20px; font-family:system-ui,sans-serif;',
      'pointer-events:none; opacity:0; transition:opacity 120ms ease;',
    ].join('');
    el.textContent = 'Return to your test to continue.';
    document.body.appendChild(el);
    return el;
  };

  const showBlurOverlay = () => {
    if (!state.config?.actions?.blurOnHide) return;
    if (!state.blurOverlayEl) {
      state.blurOverlayEl = createBlurOverlay();
    }
    state.blurOverlayEl.style.opacity = '1';
    state.blurOverlayEl.style.pointerEvents = 'auto';
  };

  const hideBlurOverlay = () => {
    if (state.blurOverlayEl) {
      state.blurOverlayEl.style.opacity = '0';
      state.blurOverlayEl.style.pointerEvents = 'none';
    }
  };

  const patchGetDisplayMedia = () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return;
    const original = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = function (...args) {
      emitViolation('screen_capture_attempt');
      return original(...args);
    };
  };

  // ====== Visibility / blur handlers (deduplicated) ======

  // Canonical-group dedup: both "window_blur" and "tab_hidden" represent the
  // same user action (leaving the tab), so we map them to a shared canonical
  // key before comparing.  This prevents a single tab-switch from double-
  // counting (blur + hidden) while still allowing two genuinely distinct
  // visibility-loss events that are spaced further apart than VISIBILITY_DEDUP_MS.
  const VISIBILITY_CANONICAL = { window_blur: 'visibility_loss', tab_hidden: 'visibility_loss' };

  const shouldSuppressVisibility = (kind) => {
    const canonical = VISIBILITY_CANONICAL[kind] || kind;
    const now = Date.now();
    if (
      state.lastVisibilityEvent === canonical &&
      now - state.lastVisibilityViolationAt < VISIBILITY_DEDUP_MS
    ) {
      return true;
    }
    state.lastVisibilityEvent = canonical;
    state.lastVisibilityViolationAt = now;
    return false;
  };

  const handleVisibilityChange = () => {
    if (document.hidden) {
      // Always cancel any pending blur timer — visibilitychange is authoritative
      if (state.blurTimer) {
        window.clearTimeout(state.blurTimer);
        state.blurTimer = null;
      }
      showBlurOverlay();
      if (shouldSuppressVisibility('tab_hidden')) {
        console.log('[ExamGuard] tab_hidden skipped — dedup with recent identical event');
        return;
      }
      console.log('[ExamGuard] tab_hidden violation — visibilitychange fired');
      emitViolation('tab_hidden');
    } else {
      if (state.blurTimer) {
        window.clearTimeout(state.blurTimer);
        state.blurTimer = null;
      }
      hideBlurOverlay();
    }
  };

  const handleBlur = () => {
    if (!state.config) return;
    // If document is already hidden, visibilitychange already fired — skip.
    if (document.hidden) return;
    const grace = state.config.blurGraceMs || DEFAULT_BLUR_GRACE_MS;
    if (grace <= 0) {
      if (!document.hidden) {
        if (shouldSuppressVisibility('window_blur')) return;
        emitViolation('window_blur');
      }
      return;
    }
    if (state.blurTimer) window.clearTimeout(state.blurTimer);
    state.blurTimer = window.setTimeout(() => {
      if (!document.hasFocus() && !document.hidden) {
        if (shouldSuppressVisibility('window_blur')) return;
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
        blockScreenshot: true,
        blurOnHide: true,
        ...config.actions,
      },
    };

    console.log('[ExamGuard] ACTIVATED for test:', config.testId);

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

    // Screenshot & print prevention
    if (state.config.actions.blockScreenshot) {
      addListener(document, 'keyup', handlePrintScreen, true);
      addListener(document, 'keydown', handlePrintShortcut, true);
      injectPrintBlocker();
      patchGetDisplayMedia();
    }
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

    // Clean up screenshot prevention
    removePrintBlocker();
    hideBlurOverlay();
    if (state.blurOverlayEl) {
      state.blurOverlayEl.remove();
      state.blurOverlayEl = null;
    }

    state.active = false;
    state.pending = false;
    state.config = null;
    state.violationsCount = 0;
    state.violationTimestamps = [];
    state.blurTimer = null;
    state.inputState = new WeakMap();
    state.lastVisibilityViolationAt = 0;
    state.lastVisibilityEvent = null;
    state.lastShortcutKey = null;
    state.lastShortcutAt = 0;
  };

  window.ExamGuard = { start, stop };
})();
