import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const feed = readFileSync('components/NewsFeed.tsx', 'utf8');
const css = readFileSync('src/index.css', 'utf8');

test('reaction counts only appear once someone has reacted', () => {
  assert.match(feed, /\{count > 0 && <span className="feed-reaction__count">/);
});

test('posts show who reacted and the actor avatar', () => {
  assert.match(feed, /reactorsLine\(reactors\)/);
  assert.match(feed, /<Avatar name=\{actorName\} src=\{event\.actor_avatar\}/);
});

test('celebration moments are highlighted', () => {
  assert.match(feed, /CELEBRATION_KINDS = new Set<NewsEvent\['kind'\]>\(\['level_up', 'achievement_earned', 'streak_milestone'\]\)/);
});

test('animations respect reduced motion and performance mode', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.feed-item,/);
  assert.match(css, /body:not\(\.performance-mode-disabled\) \.feed-item__shimmer/);
});

test('phones scroll the page, not a box inside the feed', () => {
  assert.match(css, /@media \(max-width: 640px\)\s*\{\s*\.student-activity-feed__list \{ max-height: none; overflow: visible; \}/);
});
