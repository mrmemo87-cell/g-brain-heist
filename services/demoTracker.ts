// Records what a demo visitor does (sections opened, buttons used, time spent) so the
// Brains Heist team can follow up. Only runs on the demo site, only after the visitor
// registered on the entry form and agreed to it. Events are batched and sent to the
// demo database through rpc_demo_track; nothing is sent anywhere else.
import { supabase } from './supabaseClient';
import { isDemoMode, readStoredDemoVisitor } from './demoMode';

interface DemoEvent {
  type: string;
  label?: string;
  path?: string;
  at: string;
  meta?: Record<string, unknown>;
}

const FLUSH_MS = 8000;
const HEARTBEAT_MS = 30000;
const MAX_QUEUE = 150;

let started = false;
let visitorId: string | null = null;
let sessionId = '';
let queue: DemoEvent[] = [];
let flushTimer: number | null = null;
let heartbeatTimer: number | null = null;
let lastSection = '';
let visibleSince = Date.now();
let unsent: DemoEvent[] = [];

const nowIso = () => new Date().toISOString();

const uuid = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
};

const currentPath = () => `${window.location.pathname}${window.location.search}`;

/** The section the visitor is looking at: the active navigation item, else the page title. */
const currentSection = (): string => {
  const selectors = [
    '.teacher-nav-btn.active .teacher-nav-label',
    '.teacher-mobile-bottom-nav button[aria-current="page"]',
    '[aria-current="page"]',
    '.student-dashboard-nav-item.is-active .student-dashboard-nav-label',
    'nav [data-active="true"]',
    'h1',
  ];
  for (const selector of selectors) {
    const node = document.querySelector<HTMLElement>(selector);
    const text = node?.textContent?.trim();
    if (text) return text.slice(0, 80);
  }
  return (document.title || '').replace(/\s*[|·-]\s*Brains Heist.*$/i, '').trim().slice(0, 80);
};

const push = (event: DemoEvent) => {
  if (!started) return;
  queue.push(event);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  if (queue.length >= 25) void flush();
};

export const trackDemoEvent = (type: string, label?: string, meta?: Record<string, unknown>) => {
  push({ type, label, path: currentPath(), at: nowIso(), meta });
};

const flush = async (keepalive = false): Promise<void> => {
  if (!visitorId || (queue.length === 0 && unsent.length === 0)) return;
  const batch = [...unsent, ...queue].slice(-200);
  queue = [];
  unsent = [];
  try {
    if (keepalive) {
      // Page is closing: a keepalive POST survives unload where a normal request would not.
      const url = `${(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')}/rest/v1/rpc/rpc_demo_track`;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      await fetch(url, {
        method: 'POST', keepalive: true,
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_visitor_id: visitorId, p_session_id: sessionId, p_events: batch }),
      });
      return;
    }
    const { error } = await supabase.rpc('rpc_demo_track', { p_visitor_id: visitorId, p_session_id: sessionId, p_events: batch });
    if (error) unsent = batch.slice(-100);
  } catch {
    unsent = batch.slice(-100);
  }
};

const noteSection = (force = false) => {
  const section = currentSection();
  if (section && (force || section !== lastSection)) {
    lastSection = section;
    push({ type: 'section', label: section, path: currentPath(), at: nowIso() });
  }
};

const heartbeat = () => {
  if (document.visibilityState !== 'visible') return;
  const seconds = Math.min(HEARTBEAT_MS / 1000, Math.round((Date.now() - visibleSince) / 1000));
  visibleSince = Date.now();
  noteSection();
  push({ type: 'heartbeat', label: lastSection, path: currentPath(), at: nowIso(), meta: { seconds } });
};

const describeTarget = (target: EventTarget | null): { label: string; kind: string } | null => {
  const element = target instanceof Element ? target : null;
  const actionable = element?.closest<HTMLElement>('button, a, [role="button"], [role="tab"], summary, input[type="submit"]');
  if (!actionable) return null;
  const label = (actionable.getAttribute('aria-label') || actionable.getAttribute('title') || actionable.textContent || '')
    .replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!label) return null;
  const kind = actionable.closest('.teacher-nav-container, .teacher-mobile-bottom-nav, nav') ? 'nav' : actionable.tagName.toLowerCase();
  return { label, kind };
};

/** Start recording for the registered visitor. Safe to call more than once. */
export const startDemoTracking = (enteredAs?: string): void => {
  if (started || typeof window === 'undefined' || !isDemoMode()) return;
  const visitor = readStoredDemoVisitor();
  if (!visitor) return;
  started = true;
  visitorId = visitor.id;
  sessionId = uuid();
  visibleSince = Date.now();

  push({ type: 'enter', label: enteredAs || visitor.enteredAs || 'teacher', path: currentPath(), at: nowIso(),
    meta: { screen: `${window.screen.width}x${window.screen.height}`, viewport: `${window.innerWidth}x${window.innerHeight}` } });
  window.setTimeout(() => noteSection(true), 1500);

  document.addEventListener('click', (event) => {
    const described = describeTarget(event.target);
    if (!described) return;
    push({ type: 'click', label: described.label, path: currentPath(), at: nowIso(), meta: { kind: described.kind, section: lastSection } });
    window.setTimeout(() => noteSection(), 600);
  }, true);

  const history = window.history;
  const wrap = (method: 'pushState' | 'replaceState') => {
    const original = history[method].bind(history);
    history[method] = ((...args: Parameters<History['pushState']>) => {
      const result = original(...args);
      window.setTimeout(() => { push({ type: 'page', label: document.title.slice(0, 80), path: currentPath(), at: nowIso() }); noteSection(); }, 300);
      return result;
    }) as History['pushState'];
  };
  wrap('pushState'); wrap('replaceState');
  window.addEventListener('popstate', () => window.setTimeout(() => noteSection(), 300));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      heartbeat();
      push({ type: 'hidden', label: lastSection, path: currentPath(), at: nowIso() });
      void flush(true);
    } else {
      visibleSince = Date.now();
      push({ type: 'visible', label: lastSection, path: currentPath(), at: nowIso() });
    }
  });
  window.addEventListener('pagehide', () => { heartbeat(); push({ type: 'exit', label: lastSection, path: currentPath(), at: nowIso() }); void flush(true); });

  flushTimer = window.setInterval(() => { void flush(); }, FLUSH_MS);
  heartbeatTimer = window.setInterval(heartbeat, HEARTBEAT_MS);
};

export const stopDemoTracking = (): void => {
  if (!started) return;
  push({ type: 'signout', label: lastSection, path: currentPath(), at: nowIso() });
  void flush();
  if (flushTimer) window.clearInterval(flushTimer);
  if (heartbeatTimer) window.clearInterval(heartbeatTimer);
  started = false;
};
