(() => {
  'use strict';

  const ANSWER_SOURCE = 'BIOLOGY_MASTER_ANSWER_KEY';
  const QUESTION_TIME_SECONDS = 2 * 60;
  const SUPABASE_URL = window.__SUPABASE_ENV__?.VITE_SUPABASE_URL || 'https://sozodkxwhubespiedgxm.supabase.co';
  const SUPABASE_ANON_KEY = window.__SUPABASE_ENV__?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzvem9ka3h3aHViZXNwaWVkZ3htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTUxNjYsImV4cCI6MjA3NzQ3MTE2Nn0.DBfFFWvVjpqXTga0uZcH5qR4ej6VOFBUm-CiCTgGLVA';
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

  function getAccessToken() {
    try {
      const raw = localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
      return raw ? JSON.parse(raw)?.access_token || null : null;
    } catch (_e) { return null; }
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
    if (!timer || isReviewMode()) return;
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
      const profile = JSON.parse(localStorage.getItem('gbrain_profile') || '{}');
      const name = profile.full_name || profile.username || '';
      const cls = profile.class_name || profile.class || '';
      if (name) document.getElementById('studentName').value = name;
      if (cls) document.getElementById('studentClass').value = cls;
    } catch (_e) { /* ignore */ }
  }

  function renderShell() {
    document.title = `AS Biology Ch${config.chapter} — ${config.title}`;
    document.body.innerHTML = `
      <div class="container">
        <div class="header"><div class="header-badge">🧬</div><div><h1 id="quizTitle"></h1><p id="quizSubtitle" class="subtitle"></p></div></div>
        <div class="badge-row"><span class="badge">AS Biology 9700</span><span class="badge" id="partBadge"></span><span class="badge" id="countBadge"></span></div>
        <div class="student-info"><input id="studentName" placeholder="Student name" autocomplete="name" /><input id="studentClass" placeholder="Class" autocomplete="off" /></div>
        <div id="status" class="status">Select one answer for each question, then submit.</div>
        <div id="questions" class="loading">Loading Biology questions…</div>
        <div class="submit-area"><button id="submitBtn" class="primary">Submit test</button><button id="backBtn" class="secondary" type="button">Back to dashboard</button><div id="timer"></div></div>
      </div>`;
    document.getElementById('quizTitle').textContent = `AS Biology Ch${config.chapter} ( ${config.title} ) (Part ${quizPart.part})`;
    document.getElementById('quizSubtitle').textContent = `Chapter ${config.chapter} • Part ${quizPart.part} of ${quizPart.totalParts}`;
    document.getElementById('partBadge').textContent = `Part ${quizPart.part}/${quizPart.totalParts}`;
    document.getElementById('countBadge').textContent = `${totalQuestions} questions`;
    document.getElementById('submitBtn').addEventListener('click', () => handleSubmit());
    document.getElementById('backBtn').addEventListener('click', () => { window.location.href = '/'; });
  }

  function renderQuestions() {
    const container = document.getElementById('questions');
    container.className = '';
    container.innerHTML = questions.map((question) => {
      const code = getQuestionCode(question);
      return `<section class="question-card" data-question-number="${question.number}">
        <div class="question-meta"><strong>Question ${question.number}</strong><span>${code || question.masterKey || ''}</span></div>
        <img class="question-image" src="${getImageSrc(question)}" alt="Biology question ${question.number}" loading="lazy" />
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
    let name = document.getElementById('studentName').value.trim();
    let cls = document.getElementById('studentClass').value.trim();
    if (!name && !options.force) { status.textContent = '⚠️ Please enter your name.'; status.classList.add('warning'); return; }
    if (!cls && !options.force) { status.textContent = '⚠️ Please enter your class.'; status.classList.add('warning'); return; }
    name = name || 'Unknown Student';
    cls = cls || 'Unknown Class';
    const responses = getResponses();
    const result = calculateScore(responses);
    if (result.pending && !options.force) {
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
      quiz_name: `${config.quizBaseName} (Part ${quizPart.part})`,
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
      status.classList.remove('warning');
      status.textContent = `✅ Submitted. Score: ${result.score}/${totalQuestions} (${result.percentage}%).`;
      button.textContent = '✅ Submitted';
      document.querySelectorAll('input').forEach((input) => { input.disabled = true; });
    } catch (error) {
      console.error(error);
      button.disabled = false;
      status.classList.add('warning');
      status.textContent = '⚠️ Submission failed. Please check your connection and try again.';
      startTimer();
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
      review.textContent = correct ? (student === correct ? `✅ Correct: ${correct}` : `Your answer: ${student || '—'} | Correct: ${correct}`) : `⚠️ Correct answer unavailable for ${question.masterKey}`;
      card.appendChild(review);
    });
  }

  async function loadReviewIfNeeded() {
    if (!isReviewMode()) return;
    stopTimer();
    document.getElementById('submitBtn').style.display = 'none';
    const params = new URLSearchParams(window.location.search);
    const studentName = params.get('student_name') || params.get('student') || document.getElementById('studentName').value.trim();
    const quizName = `${config.quizBaseName} (Part ${quizPart.part})`;
    try {
      const filters = [`select=answers`, `quiz_name=eq.${encodeURIComponent(quizName)}`, 'order=created_at.desc', 'limit=1'];
      if (studentName) filters.push(`student_name=eq.${encodeURIComponent(studentName)}`);
      const rows = await supabaseSelect('quiz_scores', filters.join('&'));
      const answers = typeof rows?.[0]?.answers === 'string' ? JSON.parse(rows[0].answers) : rows?.[0]?.answers;
      applyReviewMode(answers?.responses || {});
      document.getElementById('status').textContent = 'Review mode: saved answers are shown with master-key correctness.';
    } catch (error) {
      console.error(error);
      document.getElementById('status').textContent = 'Review mode: unable to load saved responses.';
      document.getElementById('status').classList.add('warning');
    }
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
    if (!isReviewMode()) startTimer();
  }

  document.addEventListener('DOMContentLoaded', () => {
    boot().catch((error) => {
      console.error(error);
      document.body.innerHTML = `<div class="container"><div class="status error">Unable to load this Biology test. ${error.message}</div></div>`;
    });
  });
})();
