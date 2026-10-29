import React, { useCallback, useEffect, useState } from 'react';
import * as GameService from '../../services/gameService';
import type { StaffClanChatRow } from '../../services/gameService';

/**
 * Teacher / school-admin view of clan chat in their school.
 * Reported messages are listed first; staff can hide a message or dismiss its reports.
 * Data comes from rpc_staff_clan_chat_feed, which only returns clans led by students of the
 * viewer's own school.
 */
const ClanChatOversight: React.FC = () => {
  const [rows, setRows] = useState<StaffClanChatRow[]>([]);
  const [onlyReported, setOnlyReported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await GameService.staff_clan_chat_feed(onlyReported, 150));
    } catch (e) {
      setError((e as Error).message || 'Could not load clan chat.');
    } finally {
      setLoading(false);
    }
  }, [onlyReported]);

  useEffect(() => {
    void load();
  }, [load]);

  const hide = async (row: StaffClanChatRow) => {
    setBusyId(row.message_id);
    try {
      await GameService.clan_chat_hide(row.message_id);
      setRows(prev => prev.map(r => (r.message_id === row.message_id ? { ...r, hidden_at: new Date().toISOString(), open_reports: 0 } : r)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (row: StaffClanChatRow) => {
    setBusyId(row.message_id);
    try {
      await GameService.staff_dismiss_clan_chat_reports(row.message_id);
      setRows(prev => prev.map(r => (r.message_id === row.message_id ? { ...r, open_reports: 0, report_reasons: null } : r)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const openReports = rows.reduce((sum, r) => sum + (r.open_reports > 0 ? 1 : 0), 0);

  return (
    <section className="clan-chat-oversight" aria-labelledby="clan-chat-oversight-title" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
        >
          <h2 id="clan-chat-oversight-title" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            Clan chat
          </h2>
          {openReports > 0 && (
            <span style={{ background: '#dc2626', color: '#fff', borderRadius: 999, fontSize: 12, fontWeight: 700, padding: '2px 8px' }}>
              {openReports} reported
            </span>
          )}
          <span aria-hidden="true" style={{ fontSize: 12, color: '#64748b' }}>{open ? '▲' : '▼'}</span>
        </button>
        {open && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={onlyReported} onChange={e => setOnlyReported(e.target.checked)} />
              Reported only
            </label>
            <button type="button" onClick={() => void load()} style={{ fontSize: 13, border: '1px solid #cbd5e1', borderRadius: 8, padding: '4px 10px', background: '#fff', cursor: 'pointer' }}>
              Refresh
            </button>
          </div>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 10px' }}>
            Messages from clans in your school, newest first. Reported messages appear at the top.
          </p>
          {error && <p role="alert" style={{ color: '#b91c1c', fontSize: 13 }}>{error}</p>}
          {loading ? (
            <p style={{ fontSize: 13, color: '#64748b' }}>Loading…</p>
          ) : rows.length === 0 ? (
            <p style={{ fontSize: 13, color: '#64748b' }}>{onlyReported ? 'No open reports.' : 'No clan messages yet.'}</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
              {rows.map(row => (
                <li
                  key={row.message_id}
                  style={{
                    border: `1px solid ${row.open_reports > 0 ? '#fca5a5' : '#e2e8f0'}`,
                    background: row.hidden_at ? '#f8fafc' : row.open_reports > 0 ? '#fef2f2' : '#fff',
                    borderRadius: 10,
                    padding: '10px 12px',
                    opacity: row.hidden_at ? 0.7 : 1,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: '#64748b' }}>
                    <span>
                      <strong style={{ color: '#0f172a' }}>{row.username}</strong> · {row.clan_name}
                    </span>
                    <time dateTime={row.created_at}>{new Date(row.created_at).toLocaleString()}</time>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 14, color: '#0f172a', overflowWrap: 'anywhere' }}>{row.message}</p>
                  {row.open_reports > 0 && (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#b91c1c' }}>
                      Reported {row.open_reports}×{row.report_reasons ? ` — ${row.report_reasons}` : ''}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 12 }}>
                    {row.hidden_at ? (
                      <span style={{ color: '#64748b' }}>Hidden from students</span>
                    ) : (
                      <button type="button" disabled={busyId === row.message_id} onClick={() => void hide(row)} style={{ color: '#b91c1c', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
                        Hide message
                      </button>
                    )}
                    {row.open_reports > 0 && !row.hidden_at && (
                      <button type="button" disabled={busyId === row.message_id} onClick={() => void dismiss(row)} style={{ color: '#334155', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
                        Dismiss report
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};

export default ClanChatOversight;
