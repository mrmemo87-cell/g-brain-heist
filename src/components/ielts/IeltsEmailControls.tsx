import React, { useEffect, useState } from 'react';
import '../../styles/ielts-ui.css';
import { emailStatusText, ieltsEmailStatus, type IeltsEmailQueued, type IeltsEmailStatus } from '../../../services/ieltsEmailService';

/** Tick boxes a teacher sees before giving students work. Defaults come from the caller (task: on; feedback: off). */
export function IeltsEmailOptions({ email, onEmail, remind, onRemind, hasDue, label = 'Email these students about this task' }:
  { email: boolean; onEmail: (v: boolean) => void; remind?: boolean; onRemind?: (v: boolean) => void; hasDue?: boolean; label?: string }) {
  return <div className="ix-email-options">
    <label className="ix-check"><input type="checkbox" checked={email} onChange={e => onEmail(e.target.checked)} /><span>{label}<span className="ix-muted"> · a short email with a link. No scores or notes are included.</span></span></label>
    {onRemind && hasDue && <label className="ix-check"><input type="checkbox" checked={!!remind} disabled={!email} onChange={e => onRemind(e.target.checked)} /><span>Remind them the day before it’s due<span className="ix-muted"> · not sent if they have already handed it in</span></span></label>}
  </div>;
}

/** After sending: what happened to the emails, refreshed for about a minute. */
export function IeltsEmailStatusLine({ queued, error }: { queued: IeltsEmailQueued | null; error?: string }) {
  const [status, setStatus] = useState<IeltsEmailStatus | null>(null);
  useEffect(() => {
    if (!queued?.keys.length) return;
    let alive = true, n = 0;
    const tick = () => { ieltsEmailStatus(queued.keys).then(s => { if (alive) setStatus(s); }).catch(() => {}); };
    tick();
    const id = window.setInterval(() => { n += 1; if (n > 8) { window.clearInterval(id); return; } tick(); }, 8000);
    return () => { alive = false; window.clearInterval(id); };
  }, [queued]);
  if (error) return <p className="ix-muted" role="status">{error}</p>;
  if (!queued) return null;
  return <p className="ix-muted" role="status">{status ? emailStatusText(status, queued.queued) : `Email: queued for ${queued.queued}.`}</p>;
}
