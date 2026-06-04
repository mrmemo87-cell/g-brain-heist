(() => {
  'use strict';

  const ANSWER_SOURCE = 'BIOLOGY_MASTER_ANSWER_KEY';
  const QUESTION_TIME_SECONDS = 2 * 60;
  const SUPABASE_URL = window.__SUPABASE_ENV__?.VITE_SUPABASE_URL || 'https://sozodkxwhubespiedgxm.supabase.co';
  const SUPABASE_ANON_KEY = window.__SUPABASE_ENV__?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvem9ka3h3aHViZXNwaWVkZ3htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTUxNjYsImV4cCI6MjA3NzQ3MTE2Nn0.DBfFFWvVjpqXTga0uZcH5qR4ej6VOFBUm-CiCTgGLVA';
  const SUPABASE_AUTH_STORAGE_KEY = 'sb-sozodkxwhubespiedgxm-auth-token';

  const config = window.BIOLOGY_IMAGE_QUIZ;
  if (!config) throw new Error('Missing BIOLOGY_IMAGE_QUIZ configuration.');

  let allQuestions = [];
  let questions = [];
  let quizPart = { part: 1, totalParts: config.partSizes.length };
  let totalQuestions = 0;
  let timerInterval = null;
  let startTime = null;
  let hasSubmitted = false;
  let antiCheatAcknowledged = false;
  let timerStarted = false;

  function getAccessToken() {
    try {
      const raw = localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
      return raw ? JSON.parse(raw)?.access_token || null : null;
    } catch (_e) { return null; }
  }

  function getQuizName() {
    return `${config.quizBaseName} (Part ${quizPart.part})`;
  }

  function getQuizId() {
    return `${config.quizBaseId}_part_${quizPart.part}`;
  }

  function parseAnswers(value) {
    if (!value) return {};
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (_e) { return {}; }
    }
    return value;
  }

  function supabaseHeaders() {
    return {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${getAccessToken() || SUPABASE_ANON_KEY}`,
    };
  }

  async function supabaseSelect(table, params) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers: supabaseHeaders() });
    if (!response.ok) throw new Error(await response.text() || response.statusText);
    return response.json();
  }

  async function supabaseInsert(table, payload) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...supabaseHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify([payload]),
    });
    if (!response.ok) throw new Error(await response.text() || response.statusText);
  }

  function getQuizPart() {
    const requested = Number.parseInt(new URLSearchParams(window.location.search).get('part') || '1', 10);
    const totalParts = config.partSizes.length;
    return { part: requested >= 1 && requested <= totalParts ? requested : 1, totalParts };
  }

  function getPartStartIndex(part) {
    return config.partSizes.slice(0, part - 1).reduce((sum, size) => sum + size, 0);
  }

  function splitQuiz() {
    const start = getPartStartIndex(quizPart.part);
    const size = config.partSizes[quizPart.part - 1];
    questions = allQuestions.slice(start, start + size);
    totalQuestions = questions.length;
  }

  function isReviewMode() {
    return new URLSearchParams(window.location.search).get('mode') === 'review';
  }

  function normaliseQuestionPayload(payload) {
    return Array.isArray(payload) ? payload : Array.isArray(payload?.questions) ? payload.questions : [];
  }

  function getQuestionCode(question) {
    if (question.sourceCode) return question.sourceCode;
    if (question.code) return question.code;
    const match = String(question.masterKey || '').match(/^(9700_[msw]\d{2}_qp_\d{2})_(\d{2})$/i);
    return match ? `${match[1]} Q: ${Number.parseInt(match[2], 10)}` : '';
  }

  function getImageSrc(question) {
    if (/^(https?:)?\/\//.test(question.image) || question.image.startsWith('/')) return question.image;
    return `${config.assetBasePath.replace(/\/$/, '')}/${question.image}`;
  }

  function getMasterAnswer(question) {
    const key = question.masterKey;
    if (!key) return '';
    return window.BIOLOGY_MASTER_ANSWER_KEY?.[key] || question.answer || '';
  }

  function collectMetadata() {
    const question_codes = {};
    const question_keys = {};
    const missing = [];
    questions.forEach((question) => {
      const code = getQuestionCode(question);
      const key = question.masterKey || '';
      if (code) question_codes[question.number] = code;
      if (key) question_keys[question.number] = key;
      if (!key || !window.BIOLOGY_MASTER_ANSWER_KEY?.[key]) missing.push(key || `Question ${question.number}`);
    });
    return { question_codes, question_keys, missing };
  }

  function calculateScore(responses) {
    let score = 0;
    const metadata = collectMetadata();
    questions.forEach((question) => {
      const correct = getMasterAnswer(question);
      const student = String(responses[question.number] || '').toUpperCase();
      if (correct && student === correct) score += 1;
    });
    return {
      score,
      total: totalQuestions,
      percentage: totalQuestions ? Math.round((score / totalQuestions) * 100) : 0,
      question_codes: metadata.question_codes,
      question_keys: metadata.question_keys,
      missing: metadata.missing,
      pending: metadata.missing.length > 0,
    };
  }

  function formatTimer(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }

  function startTimer() {
    const timer = document.getElementById('timer');
    if (!timer || isReviewMode() || hasSubmitted) return;
    const duration = totalQuestions * QUESTION_TIME_SECONDS;
    startTime = Date.now();
    const update = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(duration - elapsed, 0);
      timer.textContent = `⏳ Time remaining: ${formatTimer(remaining)}`;
      if (remaining === 0) handleSubmit({ force: true, reason: 'timer_expired' });
    };
    update();
    timerInterval = setInterval(update, 1000);
  }

  function loadStudentInfoFromGame() {
    try {
      const stored = localStorage.getItem('cambridge_test_user');
      const profile = stored ? JSON.parse(stored) : JSON.parse(localStorage.getItem('gbrain_profile') || '{}');
      const name = profile.name || profile.full_name || profile.username || '';
      const cls = profile.class || profile.class_name || '';
      if (name) {
        const nameInput = document.getElementById('studentName');
        nameInput.value = name;
        nameInput.readOnly = true;
        nameInput.style.backgroundColor = '#0f172a';
        nameInput.style.borderColor = '#22c55e';
      }
      if (cls) {
        const classInput = document.getElementById('studentClass');
        classInput.value = cls;
        classInput.readOnly = true;
        classInput.style.backgroundColor = '#0f172a';
        classInput.style.borderColor = '#22c55e';
      }
    } catch (_e) { /* ignore */ }
  }

  function renderShell() {
    document.title = `AS Biology Ch${config.chapter} — ${config.title}`;
    document.body.innerHTML = `
      <div class="container">
        <div class="header"><div class="header-badge">🧬</div><div><h1 id="quizTitle"></h1><p id="quizSubtitle" class="subtitle"></p></div></div>
        <div class="badge-row"><span class="badge">AS Biology 9700</span><span class="badge" id="partBadge"></span><span class="badge" id="countBadge"></span></div>
        <div class="student-info"><input id="studentName" placeholder="Student name" autocomplete="name" /><input id="studentClass" placeholder="Class" autocomplete="off" /></div>
        <div id="status" class="status">✅ Auto-marked: your score stays hidden until your teacher releases it.</div>
        <div id="timer" class="timer-box floating">⏳ Time remaining: 00:00</div>
        <div id="questions" class="loading">Loading Biology questions…</div>
        <div class="submit-area"><button id="submitBtn" class="primary">Submit test</button><button id="backBtn" class="secondary" type="button">Back to dashboard</button></div>
        <div id="score" class="score-box" style="display:none;"></div>
      </div>
      <div id="submitModal" class="modal-overlay">
        <div class="modal-card">
          <h3 class="modal-title">Submit AS Biology Test</h3>
          <p class="modal-body">You're about to submit your answers. Once submitted, you cannot retake this test. Your score will stay hidden until your teacher releases it.</p>
          <div class="modal-actions"><button class="modal-btn secondary" id="cancelSubmitBtn">Continue editing</button><button class="modal-btn primary" id="confirmSubmitBtn">Submit now</button></div>
        </div>
      </div>
      <div id="antiCheatModal" class="modal-overlay">
        <div class="modal-card anti-cheat-card">
          <h3 class="modal-title">Anti-cheat rules</h3>
          <p class="modal-body">This test uses anti-cheat protection. Please read before starting:</p>
          <ul class="anti-cheat-rules"><li>Stay on this tab. Switching tabs or windows counts as a violation.</li><li>Three violations will auto-submit your test immediately.</li><li>Copy, cut, paste, right-click, and drag-and-drop are all disabled.</li><li>Screenshots, screen recording, and printing are blocked.</li><li>Your timer starts only after you click “I understand”.</li></ul>
          <div class="modal-actions"><button class="modal-btn primary" id="antiCheatAcceptBtn">I understand</button></div>
        </div>
      </div>`;
    document.getElementById('quizTitle').textContent = `AS Biology Ch${config.chapter} ( ${config.title} ) (Part ${quizPart.part})`;
    document.getElementById('quizSubtitle').textContent = `Chapter ${config.chapter} • Part ${quizPart.part} of ${quizPart.totalParts}`;
    document.getElementById('partBadge').textContent = `Part ${quizPart.part}/${quizPart.totalParts}`;
    document.getElementById('countBadge').textContent = `${totalQuestions} questions`;
    document.getElementById('submitBtn').addEventListener('click', openSubmitModal);
    document.getElementById('confirmSubmitBtn').addEventListener('click', () => { closeSubmitModal(); handleSubmit(); });
    document.getElementById('cancelSubmitBtn').addEventListener('click', closeSubmitModal);
    document.getElementById('antiCheatAcceptBtn').addEventListener('click', acknowledgeAntiCheat);
    document.getElementById('backBtn').addEventListener('click', () => { handleSubmit({ force: true, reason: 'Exited test — auto-submitted' }); window.setTimeout(() => { window.location.href = '/'; }, 1200); });
  }

  function renderQuestions() {
    const container = document.getElementById('questions');
    container.className = '';
    container.innerHTML = questions.map((question) => {
      const code = getQuestionCode(question);
      return `<section class="question-card" data-question-number="${question.number}">
        <div class="question-meta"><strong class="question-number">Question ${question.number}</strong><span class="question-code">${code}</span></div>
        <img class="question-image" src="${getImageSrc(question)}" alt="Biology question image" loading="lazy" />
        <div class="option-list">${['A', 'B', 'C', 'D'].map((letter) => `<label class="option"><input type="radio" name="q${question.number}" value="${letter}" /> <strong>${letter}</strong></label>`).join('')}</div>
      </section>`;
    }).join('');
  }

  function getResponses() {
    const responses = {};
    questions.forEach((question) => {
      const selected = document.querySelector(`input[name="q${question.number}"]:checked`);
      responses[question.number] = selected ? selected.value : '';
    });
    return responses;
  }

  async function handleSubmit(options = {}) {
    if (hasSubmitted) return;
    const status = document.getElementById('status');
    const button = document.getElementById('submitBtn');
    const isForced = options.force === true;
    const autoSubmitReason = options.autoSubmitReason || options.reason || '';
    let name = document.getElementById('studentName').value.trim();
    let cls = document.getElementById('studentClass').value.trim();
    if (!name && !isForced) { status.textContent = '⚠️ Please enter your name.'; status.classList.add('warning'); return; }
    if (!cls && !isForced) { status.textContent = '⚠️ Please enter your class.'; status.classList.add('warning'); return; }
    name = name || 'Unknown Student';
    cls = cls || 'Unknown Class';
    const responses = getResponses();
    const result = calculateScore(responses);
    if (result.pending && !isForced) {
      status.textContent = `⚠️ Answer metadata unavailable for: ${result.missing.join(', ')}`;
      status.classList.add('warning');
      return;
    }
    stopTimer();
    button.disabled = true;
    status.textContent = '📤 Submitting…';
    const payload = {
      student_name: name,
      student_class: cls,
      quiz_name: getQuizName(),
      score: result.score,
      total_questions: totalQuestions,
      percentage: result.percentage,
      answers: {
        responses,
        question_codes: result.question_codes,
        question_keys: result.question_keys,
        answer_source: ANSWER_SOURCE,
        answer_key_ready: !result.pending,
        pending_answer_key: result.pending,
        missing_answer_keys: result.missing,
        quiz_version: `v1-${totalQuestions}q-part${quizPart.part}`,
      },
      time_taken_seconds: startTime ? Math.floor((Date.now() - startTime) / 1000) : 0,
    };
    try {
      await supabaseInsert('quiz_scores', payload);
      hasSubmitted = true;
      localStorage.setItem(`quiz_student_${getQuizId()}`, name);
      localStorage.setItem(`quiz_class_${getQuizId()}`, cls);
      localStorage.setItem(`quiz_submitted_${getQuizId()}`, JSON.stringify({ score: result.score, total: totalQuestions, submittedAt: new Date().toISOString() }));
      status.classList.remove('warning');
      status.textContent = isForced ? `⚠️ Auto-submitted: ${autoSubmitReason}` : '✅ Submitted successfully! Your teacher will release your score soon.';
      button.textContent = '✅ Submitted';
      document.querySelectorAll('input').forEach((input) => { input.disabled = true; });
      lockQuestions();
      const scoreDiv = document.getElementById('score');
      scoreDiv.style.display = 'block';
      scoreDiv.textContent = '📊 Score submitted. Waiting for teacher to release results.';
      scoreDiv.className = 'score-box pending';
      try {
        window.parent.postMessage({ type: 'CAMBRIDGE_TEST_COMPLETE', quizId: getQuizId(), score: result.score, total: totalQuestions, percentage: result.percentage }, '*');
      } catch (_e) { /* ignore */ }
    } catch (error) {
      console.error(error);
      if (error.message && (error.message.includes('duplicate') || error.message.includes('unique') || error.message.includes('already exists'))) {
        hasSubmitted = true;
        button.textContent = '✅ Already Submitted';
        status.textContent = '🚨 You have already submitted this test (possibly from another tab). Contact your teacher if you need to retake.';
        document.querySelectorAll('input').forEach((input) => { input.disabled = true; });
        lockQuestions();
        return;
      }
      button.disabled = false;
      status.classList.add('warning');
      status.textContent = '⚠️ Submission failed. Please check your connection and try again.';
      if (timerStarted) startTimer();
    }
  }

  function applyReviewMode(responses) {
    document.body.classList.add('review-mode');
    document.querySelectorAll('input').forEach((input) => { input.disabled = true; });
    questions.forEach((question) => {
      const card = document.querySelector(`[data-question-number="${question.number}"]`);
      if (!card) return;
      const correct = getMasterAnswer(question);
      const student = responses?.[question.number] || '';
      const correctInput = correct ? card.querySelector(`input[value="${correct}"]`) : null;
      if (correctInput) correctInput.closest('.option')?.classList.add('correct');
      if (student) {
        const studentInput = card.querySelector(`input[value="${student}"]`);
        if (studentInput) {
          studentInput.checked = true;
          if (correct && student !== correct) studentInput.closest('.option')?.classList.add('incorrect');
        }
      }
      const review = document.createElement('div');
      review.className = `review-answer${student && correct && student !== correct ? ' incorrect' : ''}`;
      review.textContent = correct ? (student === correct ? `✅ Correct: ${correct}` : `Your answer: ${student || '—'} | Correct: ${correct}`) : '⚠️ Correct answer unavailable.';
      card.appendChild(review);
    });
  }

  async function loadReviewIfNeeded() {
    if (!isReviewMode()) return;
    stopTimer();
    document.getElementById('submitBtn').style.display = 'none';
    const params = new URLSearchParams(window.location.search);
    const studentName = params.get('student_name') || params.get('student') || document.getElementById('studentName').value.trim();
    const quizName = getQuizName();
    try {
      const filters = [`select=scores_released,score,total_questions,percentage,answers,time_taken_seconds`, `quiz_name=eq.${encodeURIComponent(quizName)}`, 'order=submitted_at.desc', 'limit=1'];
      if (studentName) filters.push(`student_name=eq.${encodeURIComponent(studentName)}`);
      const rows = await supabaseSelect('quiz_scores', filters.join('&'));
      const row = rows?.[0];
      const scoreDiv = document.getElementById('score');
      if (!row || !row.scores_released) {
        hasSubmitted = !!row;
        document.querySelectorAll('input').forEach((input) => { input.disabled = true; });
        lockQuestions();
        scoreDiv.style.display = 'block';
        scoreDiv.textContent = '📊 Score submitted. Waiting for teacher to release results.';
        scoreDiv.className = 'score-box pending';
        document.getElementById('status').textContent = 'Review mode is locked until your teacher releases results.';
        try { window.parent.postMessage({ type: 'CAMBRIDGE_TEST_REVIEW_MODE' }, '*'); } catch (_e) { /* ignore */ }
        return;
      }
      const timeTaken = typeof row.time_taken_seconds === 'number' ? ` • ⏱️ Time: ${formatTimer(row.time_taken_seconds)}` : '';
      scoreDiv.style.display = 'block';
      scoreDiv.textContent = `✅ Score: ${row.score}/${row.total_questions} (${row.percentage}%)${timeTaken}`;
      scoreDiv.className = 'score-box';
      const answers = parseAnswers(row.answers);
      applyReviewMode(answers?.responses || {});
      document.getElementById('status').textContent = 'Review mode: saved answers are shown with master-key correctness.';
      try { window.parent.postMessage({ type: 'CAMBRIDGE_TEST_REVIEW_MODE' }, '*'); } catch (_e) { /* ignore */ }
    } catch (error) {
      console.error(error);
      document.getElementById('status').textContent = 'Review mode: unable to load saved responses.';
      document.getElementById('status').classList.add('warning');
    }
  }


  async function checkServerSubmission() {
    if (hasSubmitted || isReviewMode()) return;
    const name = document.getElementById('studentName')?.value.trim();
    if (!name) return;
    try {
      const filters = [`select=submitted_at,scores_released,score,total_questions,percentage,answers,time_taken_seconds`, `quiz_name=eq.${encodeURIComponent(getQuizName())}`, `student_name=eq.${encodeURIComponent(name)}`, 'order=submitted_at.desc', 'limit=1'];
      const rows = await supabaseSelect('quiz_scores', filters.join('&'));
      const row = rows?.[0];
      if (!row) return;
      hasSubmitted = true;
      antiCheatAcknowledged = true;
      document.querySelectorAll('input').forEach((input) => { input.disabled = true; });
      const button = document.getElementById('submitBtn');
      button.disabled = true;
      button.textContent = '✓ Submitted';
      const scoreDiv = document.getElementById('score');
      scoreDiv.style.display = 'block';
      lockQuestions();
      stopTimer();
      try { window.parent.postMessage({ type: 'CAMBRIDGE_TEST_REVIEW_MODE' }, '*'); } catch (_e) { /* ignore */ }
      if (row.scores_released) {
        const timeTaken = typeof row.time_taken_seconds === 'number' ? ` • ⏱️ Time: ${formatTimer(row.time_taken_seconds)}` : '';
        scoreDiv.textContent = `✅ Score: ${row.score}/${row.total_questions} (${row.percentage}%)${timeTaken}`;
        scoreDiv.className = 'score-box';
        applyReviewMode(parseAnswers(row.answers)?.responses || {});
      } else {
        scoreDiv.textContent = '📊 Score submitted. Waiting for teacher to release results.';
        scoreDiv.className = 'score-box pending';
      }
    } catch (error) {
      console.error('Failed to check previous Biology submission from server:', error);
    }
  }

  function openSubmitModal() {
    document.getElementById('submitModal')?.classList.add('show');
  }

  function closeSubmitModal() {
    document.getElementById('submitModal')?.classList.remove('show');
  }

  function lockQuestions() {
    document.getElementById('questions')?.classList.add('hidden');
  }

  function unlockQuestions() {
    document.getElementById('questions')?.classList.remove('hidden');
  }

  function openAntiCheatModal() {
    document.getElementById('antiCheatModal')?.classList.add('show');
  }

  function closeAntiCheatModal() {
    document.getElementById('antiCheatModal')?.classList.remove('show');
  }

  function acknowledgeAntiCheat() {
    antiCheatAcknowledged = true;
    closeAntiCheatModal();
    startTimerIfReady();
  }

  function startTimerIfReady() {
    if (timerStarted || hasSubmitted || isReviewMode()) return;
    if (!antiCheatAcknowledged) {
      openAntiCheatModal();
      return;
    }
    timerStarted = true;
    startTimer();
  }

  function startExamGuard() {
    window.setTimeout(() => {
      if (!hasSubmitted && !isReviewMode() && typeof window.ExamGuard !== 'undefined') {
        let autoSubmitTriggered = false;
        window.ExamGuard.start({
          promptContainer: document.querySelector('.container'),
          editor: [],
          onSubmit: () => {
            if (autoSubmitTriggered || hasSubmitted) return;
            autoSubmitTriggered = true;
            handleSubmit({ force: true, skipModal: true, autoSubmitReason: 'ExamGuard violation limit reached' });
          },
          onViolation: (event) => {
            console.warn(`ExamGuard violation (${getQuizName()}):`, event);
            if (event.violationsCount >= 3 && !autoSubmitTriggered && !hasSubmitted) {
              autoSubmitTriggered = true;
              handleSubmit({ force: true, skipModal: true, autoSubmitReason: `ExamGuard: ${event.violationsCount} violations` });
            }
          },
          testId: getQuizId(),
          maxViolations: 3,
          blurGraceMs: 300,
          actions: {
            warn: true,
            showBanner: true,
            autosubmit: true,
            disableEditor: false,
            blockSelectAll: false,
          },
        });
      }
    }, 500);
  }

  async function boot() {
    quizPart = getQuizPart();
    const response = await fetch(config.jsonPath, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Unable to load ${config.jsonPath}`);
    allQuestions = normaliseQuestionPayload(await response.json());
    splitQuiz();
    renderShell();
    loadStudentInfoFromGame();
    renderQuestions();
    await loadReviewIfNeeded();
    await checkServerSubmission();
    startTimerIfReady();
    startExamGuard();
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data && event.data.type === 'FORCE_SUBMIT' && !hasSubmitted) {
      handleSubmit({ force: true, skipModal: true, autoSubmitReason: 'Exited test — auto-submitted' });
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    boot().catch((error) => {
      console.error(error);
      document.body.innerHTML = `<div class="container"><div class="status error">Unable to load this Biology test. ${error.message}</div></div>`;
    });
  });
})();
