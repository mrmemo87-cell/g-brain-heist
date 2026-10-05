import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React, { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import DiagnosticComposer from '../components/teacher/DiagnosticComposer';
import { useAssignmentQuestionSelection } from '../src/hooks/useAssignmentQuestionSelection';
import { composeDiagnostic, fetchDiagnosticComposerCapabilities, type PreparedDiagnostic } from '../services/diagnosticComposerService';
import { supabase } from '../services/supabaseClient';
import type { SchoolSubjectGroup } from '../services/schoolSubjectGroupService';

const group = (id: string, subject = 'ESL') => ({
  id, name: `Grade 7 ${subject}`, schoolSubjectName: subject, gradeLevel: '7', studentCount: 14,
} as SchoolSubjectGroup);
const groups = [group('english'), group('economics', 'Economics')];
const capabilities = (id = 'english') => ({
  success: true, ready: true, group: { id },
  depths: [{ questionCount: 10, name: 'Quick Diagnostic', available: true, recommended: true, estimatedMinutes: 10 }],
});
const prepared = (id = 'english', subject = 'ESL') => ({
  success: true, groupId: id, groupName: `Grade 7 ${subject}`, gradeLevel: '7',
  schoolSubjectName: subject, academicSubjectId: 'subject-id', defaultTitle: 'Diagnostic',
  questionCount: 10, questionIds: Array.from({ length: 10 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`),
} as PreparedDiagnostic);
const deferred = () => {
  let resolve!: (value: { data: unknown; error: unknown }) => void;
  const promise = new Promise<{ data: unknown; error: unknown }>((done) => { resolve = done; });
  return { promise, resolve };
};

test('diagnostic handoff and request lifecycle', async (t) => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' });
  const globals = globalThis as unknown as Record<string, unknown>;
  const original = new Map(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globals['window'] = dom.window;
  globals['document'] = dom.window.document;
  globals['IS_REACT_ACT_ENVIRONMENT'] = true;
  const container = dom.window.document.getElementById('root')!;
  let root: Root;
  const mount = async (element: React.ReactElement) => {
    root = createRoot(container);
    await act(async () => { root.render(createElement(StrictMode, null, element)); });
  };
  const rerender = async (element: React.ReactElement) => {
    await act(async () => { root.render(createElement(StrictMode, null, element)); });
  };
  const unmount = async () => { await act(async () => root.unmount()); };
  const button = (text: string) => Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(text))!;
  const props = { open: true, schoolId: 'school', teachingGroups: groups, initialGroupId: 'english', onClose() {}, onPrepared() {} };

  try {
    await t.test('first render never claims the pool is insufficient before checking it', () => {
      const html = renderToString(createElement(DiagnosticComposer, props));
      assert.match(html, /Checking the governed question pool/);
      assert.doesNotMatch(html, /Diagnostic not ready|does not yet have enough/);
    });

    await t.test('prepared selections survive first use, repeat use, subject changes and teacher edits', async () => {
      let state!: ReturnType<typeof useAssignmentQuestionSelection>;
      function Probe() {
        state = useAssignmentQuestionSelection();
        return createElement('output', null, state.assignmentQuestionIds.length);
      }
      await mount(createElement(Probe));
      try {
        for (const subject of ['ESL', 'ESL', 'Economics', 'Science']) {
          const ids = prepared(subject, subject).questionIds;
          await act(async () => {
            // The portal resets the draft and installs the prepared context in one batch.
            state.setAssignmentSubject('');
            state.setAssignmentQuestionIds([]);
            state.setAssignmentSubject(subject);
            state.setAssignmentQuestionIds(ids);
          });
          assert.equal(state.assignmentSubject, subject);
          assert.deepEqual(state.assignmentQuestionIds, ids);
          await act(async () => state.chooseAssignmentSubject(subject));
          assert.deepEqual(state.assignmentQuestionIds, ids);
          await act(async () => state.setAssignmentQuestionIds((current) => current.slice(1)));
          await rerender(createElement(Probe));
          assert.deepEqual(state.assignmentQuestionIds, ids.slice(1), 'rerenders must not restore teacher-removed questions');
        }
        await act(async () => state.chooseAssignmentSubject('Maths'));
        assert.deepEqual(state.assignmentQuestionIds, [], 'deliberate subject changes clear the selection');
        await act(async () => { state.setAssignmentSubject('English'); state.setAssignmentQuestionIds(['from-bank']); });
        await act(async () => state.chooseAssignmentSubject('English'));
        assert.deepEqual(state.assignmentQuestionIds, ['from-bank']);
        await act(async () => state.chooseAssignmentSubject('Maths'));
        assert.deepEqual(state.assignmentQuestionIds, [], 'same-subject import must not leave a stale skip-reset flag');
      } finally { await unmount(); }
    });

    await t.test('slow checks show loading, failed checks offer retry, and genuine shortages remain explicit', async (ctx) => {
      const pending = deferred();
      let response = pending.promise;
      ctx.mock.method(supabase, 'rpc', (() => response) as unknown as typeof supabase.rpc);
      await mount(createElement(DiagnosticComposer, props));
      try {
        assert.match(container.textContent!, /Checking the governed question pool/);
        assert.equal(button('Prepare in Assignment Wizard').disabled, true);
        assert.doesNotMatch(container.textContent!, /Diagnostic not ready/);
        await act(async () => pending.resolve({ data: null, error: { message: 'network timeout' } }));
        assert.match(container.textContent!, /Could not check diagnostic availability/);
        assert.doesNotMatch(container.textContent!, /Diagnostic not ready|does not yet have enough/);
        response = Promise.resolve({ data: { ...capabilities(), ready: false, reason: 'governed_pool_too_small', depths: [] }, error: null });
        await act(async () => button('Retry availability check').click());
        assert.match(container.textContent!, /Diagnostic not ready/);
        assert.equal(button('Prepare in Assignment Wizard').disabled, true);
      } finally { await unmount(); }
    });

    await t.test('a late previous-group response cannot replace the current group; roster refresh preserves the choice', async (ctx) => {
      const first = deferred();
      ctx.mock.method(supabase, 'rpc', ((_name: string, args: { p_group_id: string }) => args.p_group_id === 'english'
        ? first.promise : Promise.resolve({ data: capabilities('economics'), error: null })) as unknown as typeof supabase.rpc);
      await mount(createElement(DiagnosticComposer, props));
      try {
        const select = container.querySelector('select')!;
        await act(async () => { select.value = 'economics'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
        await act(async () => first.resolve({ data: { ...capabilities(), ready: false, depths: [] }, error: null }));
        await rerender(createElement(DiagnosticComposer, { ...props, teachingGroups: [...groups] }));
        assert.equal(container.querySelector('select')!.value, 'economics');
        assert.equal(button('Prepare in Assignment Wizard').disabled, false);
        assert.doesNotMatch(container.textContent!, /Diagnostic not ready/);
      } finally { await unmount(); }
    });

    await t.test('real composer hands every question into shared selection state exactly once', async (ctx) => {
      const pending = deferred();
      let calls = 0;
      ctx.mock.method(supabase, 'rpc', ((name: string) => {
        if (name === 'rpc_teacher_compose_diagnostic') { calls++; return pending.promise; }
        return Promise.resolve({ data: capabilities(), error: null });
      }) as unknown as typeof supabase.rpc);
      let state!: ReturnType<typeof useAssignmentQuestionSelection>;
      function Harness() {
        state = useAssignmentQuestionSelection();
        return createElement(DiagnosticComposer, { ...props, onPrepared(diagnostic: PreparedDiagnostic) {
          state.setAssignmentSubject('');
          state.setAssignmentQuestionIds([]);
          state.setAssignmentSubject(diagnostic.schoolSubjectName);
          state.setAssignmentQuestionIds(diagnostic.questionIds);
        } });
      }
      await mount(createElement(Harness));
      try {
        await act(async () => state.setAssignmentSubject('English'));
        const prepareButton = button('Prepare in Assignment Wizard');
        await act(async () => { prepareButton.click(); prepareButton.click(); });
        assert.equal(calls, 1);
        assert.equal(container.querySelector('select')!.disabled, true);
        await act(async () => pending.resolve({ data: prepared(), error: null }));
        assert.equal(state.assignmentSubject, 'ESL');
        assert.deepEqual(state.assignmentQuestionIds, prepared().questionIds);
      } finally { await unmount(); }
    });

    await t.test('closing and reopening suppresses a late prepared form and starts a fresh check', async (ctx) => {
      const pending = deferred();
      let handoffs = 0;
      ctx.mock.method(supabase, 'rpc', ((name: string) => name === 'rpc_teacher_compose_diagnostic'
        ? pending.promise : Promise.resolve({ data: capabilities(), error: null })) as unknown as typeof supabase.rpc);
      const view = (open: boolean) => createElement(DiagnosticComposer, { ...props, open, onPrepared() { handoffs++; } });
      await mount(view(true));
      try {
        await act(async () => button('Prepare in Assignment Wizard').click());
        await rerender(view(false));
        await rerender(view(true));
        await act(async () => pending.resolve({ data: prepared(), error: null }));
        assert.equal(handoffs, 0);
        assert.equal(button('Prepare in Assignment Wizard').disabled, false);
      } finally { await unmount(); }
    });

    await t.test('incomplete and wrong-group RPC responses cannot open an empty wizard', async (ctx) => {
      let payload: unknown;
      ctx.mock.method(supabase, 'rpc', (() => Promise.resolve({ data: payload, error: null })) as unknown as typeof supabase.rpc);
      for (const invalid of [null, {}, { ...prepared(), success: false }, { ...prepared(), groupId: 'other' },
        { ...prepared(), questionIds: [] }, { ...prepared(), questionIds: prepared().questionIds.slice(1) },
        { ...prepared(), questionIds: Array(10).fill(prepared().questionIds[0]) },
        { ...prepared(), questionCount: 30 }, { ...prepared(), schoolSubjectName: '' }]) {
        payload = invalid;
        await assert.rejects(composeDiagnostic('school', 'english', 10), /complete diagnostic question set/);
      }
      payload = prepared();
      assert.equal((await composeDiagnostic('school', 'english', 10)).questionIds.length, 10);
      for (const invalid of [null, {}, { ...capabilities(), group: { id: 'other' } }, { ...capabilities(), depths: [] }]) {
        payload = invalid;
        await assert.rejects(fetchDiagnosticComposerCapabilities('school', 'english'), /availability could not be verified/);
      }
    });
  } finally {
    dom.window.close();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globals[key];
    }
  }
});

test('portal uses explicit subject choice and has no post-handoff clearing effect', () => {
  const source = readFileSync('components/TeacherPortal.tsx', 'utf8');
  assert.match(source, /useAssignmentQuestionSelection\(\)/);
  assert.match(source, /setAssignmentSubject=\{chooseAssignmentSubject\}/);
  assert.doesNotMatch(source, /questionBankSubjectRef/);
  assert.doesNotMatch(source, /setAssignmentQuestionIds\(\[\]\);\s*\}, \[assignmentSubject\]\)/);
});
