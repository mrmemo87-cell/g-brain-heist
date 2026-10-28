import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_DEFAULT_TITLE,
  ANNOUNCEMENT_TITLE_MAX,
  announcementErrorMessage,
  groupStudentsByClass,
  validateAnnouncement,
  type AnnouncementStudent,
} from '../src/lib/teacherAnnouncement';

interface Props {
  students: AnnouncementStudent[];
  onClose: () => void;
}

type SendResult = { recipients: number; reachable: number };

/**
 * Teacher → students push announcement. Recipients come from the teacher's own roster;
 * the server re-checks every student against that roster before anything is queued.
 */
const TeacherAnnouncementModal: React.FC<Props> = ({ students, onClose }) => {
  const groups = useMemo(() => groupStudentsByClass(students), [students]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [reachable, setReachable] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  // How many of the selected students have notifications on (server answers only for own roster).
  useEffect(() => {
    if (selected.size === 0) { setReachable(null); return; }
    let active = true;
    const timer = window.setTimeout(async () => {
      const { data, error: rpcError } = await supabase.rpc('rpc_teacher_push_reachable_students', { p_student_ids: [...selected] });
      if (!active) return;
      setReachable(rpcError ? null : Array.isArray(data) ? data.length : 0);
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sending) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sending]);

  const classState = (ids: string[]) => {
    const n = ids.filter((id) => selected.has(id)).length;
    return n === 0 ? 'none' : n === ids.length ? 'all' : 'some';
  };
  const toggleClass = (ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const all = ids.every((id) => next.has(id));
      ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
      return next;
    });
    setResult(null);
  };
  const toggleStudent = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setResult(null);
  };

  const send = async () => {
    setError(null);
    const check = validateAnnouncement(selected.size, title, body);
    if (!check.ok) { setError(announcementErrorMessage(check.error)); return; }
    setSending(true);
    const { data, error: rpcError } = await supabase.rpc('rpc_teacher_send_push_announcement', {
      p_student_ids: [...selected],
      p_title: check.title,
      p_body: check.body,
    });
    setSending(false);
    if (rpcError) { setError(announcementErrorMessage(rpcError.message)); return; }
    const r = (data || {}) as { recipients?: number; reachable?: number };
    setResult({ recipients: r.recipients ?? selected.size, reachable: r.reachable ?? 0 });
    setBody('');
  };

  const previewTitle = title.trim() || ANNOUNCEMENT_DEFAULT_TITLE;
  const previewBody = body.trim() || 'Your message will appear here.';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="teacher-announcement-title"
      data-testid="teacher-announcement-modal"
      onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div>
            <h2 id="teacher-announcement-title" className="font-heading text-lg text-white">Send a notification</h2>
            <p className="mt-0.5 text-xs text-slate-400">Goes to the phones of selected students who turned notifications on.</p>
          </div>
          <button type="button" onClick={onClose} disabled={sending} aria-label="Close" className="h-9 w-9 flex-none rounded-full border border-slate-700 text-slate-400 hover:text-white">×</button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">To</h3>
            {groups.length === 0 ? (
              <p className="text-sm text-slate-400">No students in your classes yet.</p>
            ) : (
              <div className="space-y-2">
                {groups.map((g) => {
                  const ids = g.students.map((s) => s.id);
                  const state = classState(ids);
                  const count = ids.filter((id) => selected.has(id)).length;
                  return (
                    <div key={g.classCode} className="rounded-2xl border border-slate-800">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleClass(ids)}
                          aria-pressed={state === 'all'}
                          className={`min-h-[40px] flex-1 rounded-xl px-3 text-left text-sm font-semibold transition ${state === 'all' ? 'bg-cyan-400/15 text-cyan-200' : state === 'some' ? 'bg-cyan-400/5 text-cyan-100' : 'text-slate-200 hover:bg-slate-800/60'}`}
                        >
                          {state === 'all' ? '✓ ' : ''}{g.classCode}
                          <span className="ml-2 text-xs font-normal text-slate-400">
                            {state === 'none' ? `${ids.length} ${ids.length === 1 ? 'student' : 'students'}` : `${count} of ${ids.length} selected`}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpanded((e) => (e === g.classCode ? null : g.classCode))}
                          className="min-h-[40px] rounded-xl px-3 text-xs text-slate-400 hover:text-white"
                          aria-expanded={expanded === g.classCode}
                        >
                          {expanded === g.classCode ? 'Hide' : 'Choose students'}
                        </button>
                      </div>
                      {expanded === g.classCode && (
                        <ul style={{ listStyle: 'none', margin: 0 }} className="grid gap-1 border-t border-slate-800 px-3 py-2 sm:grid-cols-2">
                          {g.students.map((s) => (
                            <li key={s.id} style={{ margin: 0 }}>
                              <label className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-slate-800/60">
                                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleStudent(s.id)} className="h-4 w-4 accent-cyan-400" />
                                <span className="truncate">{s.name}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {selected.size > 0 && (
              <p className="mt-2 text-xs text-slate-400" data-testid="announcement-reach">
                {selected.size} selected
                {reachable !== null && ` · ${reachable} ${reachable === 1 ? 'has' : 'have'} notifications on`}
                {reachable !== null && reachable < selected.size && '. The others won’t get it until they turn notifications on.'}
              </p>
            )}
          </section>

          <section className="space-y-3">
            <label className="block">
              <span className="mb-1 flex justify-between text-sm font-semibold text-slate-200">
                Title <span className="text-xs font-normal text-slate-500">optional · {title.length}/{ANNOUNCEMENT_TITLE_MAX}</span>
              </span>
              <input
                value={title}
                maxLength={ANNOUNCEMENT_TITLE_MAX}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={ANNOUNCEMENT_DEFAULT_TITLE}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-base text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 flex justify-between text-sm font-semibold text-slate-200">
                Message <span className={`text-xs font-normal ${body.length > ANNOUNCEMENT_BODY_MAX - 20 ? 'text-amber-300' : 'text-slate-500'}`}>{body.length}/{ANNOUNCEMENT_BODY_MAX}</span>
              </span>
              <textarea
                value={body}
                maxLength={ANNOUNCEMENT_BODY_MAX}
                onChange={(e) => { setBody(e.target.value); setResult(null); }}
                rows={3}
                placeholder="e.g. Bring your textbooks tomorrow."
                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-base text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </label>
          </section>

          <section aria-label="Preview">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Preview</h3>
            <div className="flex gap-3 rounded-2xl bg-slate-800/80 p-3">
              <img src="/icons/icon-192.png" alt="" width={36} height={36} className="h-9 w-9 flex-none rounded-lg" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{previewTitle}</p>
                <p className="line-clamp-3 text-sm text-slate-300">{previewBody}</p>
              </div>
            </div>
          </section>

          {error && <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
          {result && (
            <p role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200" data-testid="announcement-result">
              Sent. {result.reachable} {result.reachable === 1 ? 'phone' : 'phones'} will get it within about a minute.
              {result.recipients > result.reachable && ` ${result.recipients - result.reachable} selected ${result.recipients - result.reachable === 1 ? 'student doesn’t' : 'students don’t'} have notifications on yet.`}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
          <button type="button" onClick={onClose} disabled={sending} className="min-h-[44px] rounded-xl px-4 text-sm text-slate-300 hover:text-white">
            {result ? 'Done' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending || selected.size === 0 || !body.trim()}
            className="min-h-[44px] rounded-xl border border-cyan-400/60 bg-cyan-400/15 px-5 text-sm font-bold text-cyan-100 transition hover:bg-cyan-400/25 disabled:opacity-50"
            data-testid="announcement-send"
          >
            {sending ? 'Sending…' : result ? 'Send another' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TeacherAnnouncementModal;
