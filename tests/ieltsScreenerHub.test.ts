import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IeltsScreenerCard } from '../src/components/ielts/IeltsScreenerCard';
import type { IeltsScreenerEntry } from '../services/ieltsScreenerLaunchService';

const entry: IeltsScreenerEntry = { title: 'Reading Screener A', code: 'bh-reading-screener-a',
  exam_event_id: '00000000-0000-0000-0000-000000000001', assignment_id: '00000000-0000-0000-0000-000000000002',
  attempt_id: '00000000-0000-0000-0000-000000000003', status: 'completed', duration_minutes: 20, starts_at: '2026-10-06T00:00:00Z' };

test('completed screener separates saved result from exposed-item practice', () => {
  const html = renderToStaticMarkup(React.createElement(IeltsScreenerCard, { skill: 'reading', entry, onNavigate: () => {} }));
  assert.match(html, /View saved result/);
  assert.match(html, /Repeat for practice/);
  assert.match(html, /do not measure improvement/);
  assert.ok(html.indexOf('View saved result') < html.indexOf('Repeat for practice'));
  assert.doesNotMatch(html, /Start new screener attempt|Start Reading check|estimated band/i);
});

test('unfinished screener offers recovery without claiming completion or a result', () => {
  for (const status of ['in_progress', 'expired'] as const) {
    const html = renderToStaticMarkup(React.createElement(IeltsScreenerCard, { skill: 'reading', entry: { ...entry, status }, onNavigate: () => {} }));
    assert.match(html, status === 'in_progress' ? /Resume check/ : /Open saved attempt/);
    assert.doesNotMatch(html, /View saved result|Repeat for practice|Completed/);
  }
});

test('Reading card accurately states reviewed Academic scope and question count', () => {
  const html = renderToStaticMarkup(React.createElement(IeltsScreenerCard, { skill: 'reading', entry: { ...entry, status: 'ready', assignment_id: null, attempt_id: null }, onNavigate: () => {} }));
  assert.match(html, /Two passages · 12 questions · Academic Reading/);
  assert.match(html, /20 minutes/);
  assert.match(html, /Start Reading check/);
  assert.doesNotMatch(html, /10 Qs|Overall band|Completed/);
});
