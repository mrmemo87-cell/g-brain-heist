import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  GraduationCap,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  UserRoundCheck,
  UsersRound,
  X,
} from 'lucide-react';
import {
  getCurrentSchool,
  listSchoolMembers,
  type SchoolMember,
} from '../../services/schoolAdminService';
import {
  bootstrapSchoolOperations,
  createAttendanceSession,
  getSchoolOpsSettings,
  getStudent360,
  listAttendanceCodes,
  listAttendanceRecords,
  listAttendanceSessions,
  listGroupStudentIds,
  listPeriods,
  listScheduleTemplates,
  listTeachingGroups,
  removePeriod,
  saveAttendanceRecords,
  savePeriod,
  saveSchoolOpsSettings,
  submitAttendanceSession,
  syncClassesToTeachingGroups,
  updateScheduleTemplate,
  type AttendanceCode,
  type AttendanceSession,
  type ScheduleTemplate,
  type SchoolOpsPeriod,
  type SchoolOpsPreset,
  type SchoolOpsSettings,
  type Student360Payload,
  type TeachingGroup,
} from '../../services/schoolOperationsService';

type View = 'today' | 'attendance' | 'timetable' | 'students' | 'setup';

type DraftMark = { code_id: string; minutes_late?: number | null; reason?: string | null };

const TODAY = new Date().toISOString().slice(0, 10);
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BLOCK_TYPES = [
  ['lesson', 'Lesson'],
  ['registration', 'Register'],
  ['break', 'Break'],
  ['lunch', 'Lunch'],
  ['assembly', 'Assembly'],
  ['prayer', 'Prayer'],
  ['advisory', 'Advisory'],
  ['study', 'Study'],
  ['club', 'Club'],
  ['intervention', 'Intervention'],
  ['exam', 'Exam'],
  ['custom', 'Other'],
] as const;

const PRESETS: Array<{ id: SchoolOpsPreset; label: string }> = [
  { id: 'british', label: 'British / Cambridge' },
  { id: 'ib', label: 'IB' },
  { id: 'american', label: 'American' },
  { id: 'primary', label: 'Primary' },
  { id: 'online', label: 'Online' },
  { id: 'custom', label: 'Custom' },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function shortTime(value?: string | null) {
  return value ? value.slice(0, 5) : '';
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

function memberName(member: SchoolMember) {
  return member.full_name?.trim() || member.username || member.email || 'Student';
}

function ShellButton({ children, onClick, disabled, tone = 'dark', className = '' }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'dark' | 'light' | 'ghost';
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'dark' && 'bg-slate-950 text-white shadow-sm hover:bg-slate-800',
        tone === 'light' && 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
        tone === 'ghost' && 'text-slate-600 hover:bg-slate-100',
        className,
      )}
    >{children}</button>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

function EmptyState({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-5 text-center">
      <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-500">{icon}</div>
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export default function SchoolOperationsPage() {
  const [view, setView] = useState<View>('today');
  const [schoolId, setSchoolId] = useState('');
  const [schoolName, setSchoolName] = useState('School');
  const [settings, setSettings] = useState<SchoolOpsSettings | null>(null);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [groups, setGroups] = useState<TeachingGroup[]>([]);
  const [students, setStudents] = useState<SchoolMember[]>([]);
  const [codes, setCodes] = useState<AttendanceCode[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const activeTemplate = useMemo(
    () => templates.find((template) => template.is_default) || templates[0] || null,
    [templates],
  );

  async function loadMembers(id: string) {
    const all: SchoolMember[] = [];
    let offset = 0;
    let total = 1;
    while (offset < total && offset < 5000) {
      const page = await listSchoolMembers(id, { role: 'student', limit: 200, offset });
      all.push(...page.members);
      total = page.total;
      if (!page.members.length) break;
      offset += page.members.length;
    }
    setStudents(all);
  }

  async function loadCore(id: string) {
    const [nextSettings, nextTemplates, nextCodes, nextSessions] = await Promise.all([
      getSchoolOpsSettings(id),
      listScheduleTemplates(id),
      listAttendanceCodes(id),
      listAttendanceSessions(id, TODAY),
    ]);
    setSettings(nextSettings);
    setTemplates(nextTemplates);
    setCodes(nextCodes);
    setSessions(nextSessions);
    const nextGroups = await syncClassesToTeachingGroups(id);
    setGroups(nextGroups);
    await loadMembers(id);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const overview = await getCurrentSchool();
        if (!overview?.school?.id) throw new Error('School admin access is required.');
        if (!alive) return;
        setSchoolId(overview.school.id);
        setSchoolName(overview.school.name || 'School');
        let current = await getSchoolOpsSettings(overview.school.id);
        if (!current) {
          await bootstrapSchoolOperations(overview.school.id, 'custom');
          current = await getSchoolOpsSettings(overview.school.id);
        }
        if (!alive) return;
        await loadCore(overview.school.id);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : 'School Operations could not be opened.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function refresh() {
    if (!schoolId) return;
    try {
      setWorking(true);
      setError('');
      await loadCore(schoolId);
      setNotice('Updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not refresh.');
    } finally {
      setWorking(false);
    }
  }

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-slate-50"><Loader2 className="h-7 w-7 animate-spin text-slate-500" /></div>;
  }

  if (error && !schoolId) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-6">
        <div className="max-w-sm rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="text-base font-bold text-slate-900">School Operations unavailable</div>
          <div className="mt-2 text-sm text-slate-500">{error}</div>
          <ShellButton className="mt-4" tone="light" onClick={() => window.location.assign('/')}><ArrowLeft className="h-4 w-4" /> Back</ShellButton>
        </div>
      </div>
    );
  }

  const nav: Array<{ id: View; label: string; icon: React.ReactNode }> = [
    { id: 'today', label: 'Today', icon: <Sparkles className="h-4 w-4" /> },
    { id: 'attendance', label: 'Attendance', icon: <UserRoundCheck className="h-4 w-4" /> },
    { id: 'timetable', label: 'Timetable', icon: <CalendarDays className="h-4 w-4" /> },
    { id: 'students', label: 'Students', icon: <UsersRound className="h-4 w-4" /> },
    { id: 'setup', label: 'Setup', icon: <Settings2 className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => window.location.assign('/')} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50" aria-label="Back to Brain Heist">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-950">{schoolName}</div>
              <div className="text-xs text-slate-500">School Operations</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {notice ? <span className="hidden text-xs font-semibold text-emerald-600 sm:inline">{notice}</span> : null}
            <button type="button" onClick={refresh} disabled={working} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50" aria-label="Refresh">
              <RefreshCw className={cx('h-4 w-4', working && 'animate-spin')} />
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6">
          <nav className="flex min-w-max gap-1 pb-2">
            {nav.map((item) => (
              <button key={item.id} type="button" onClick={() => setView(item.id)} className={cx('flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition', view === item.id ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800')}>
                {item.icon}{item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7">
        {error ? <div className="mb-4 flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button onClick={() => setError('')}><X className="h-4 w-4" /></button></div> : null}
        {view === 'today' ? <TodayView schoolId={schoolId} sessions={sessions} codes={codes} groups={groups} students={students} onGo={setView} /> : null}
        {view === 'attendance' ? <AttendanceView schoolId={schoolId} groups={groups} students={students} codes={codes} onChanged={refresh} /> : null}
        {view === 'timetable' && activeTemplate ? <TimetableView schoolId={schoolId} template={activeTemplate} onTemplateChanged={refresh} /> : null}
        {view === 'timetable' && !activeTemplate ? <EmptyState icon={<CalendarDays className="h-5 w-5" />} title="No timetable yet" action={<ShellButton onClick={() => setView('setup')}>Set up</ShellButton>} /> : null}
        {view === 'students' ? <StudentsView schoolId={schoolId} students={students} /> : null}
        {view === 'setup' && settings ? <SetupView settings={settings} template={activeTemplate} onSaved={async () => { await refresh(); setNotice('Settings saved'); }} /> : null}
      </main>
    </div>
  );
}

function TodayView({ sessions, codes, groups, students, onGo }: {
  schoolId: string;
  sessions: AttendanceSession[];
  codes: AttendanceCode[];
  groups: TeachingGroup[];
  students: SchoolMember[];
  onGo: (view: View) => void;
}) {
  const submitted = sessions.filter((session) => session.status === 'submitted' || session.status === 'locked').length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Today</h1><div className="mt-1 text-sm text-slate-500">{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date())}</div></div>
        <ShellButton onClick={() => onGo('attendance')}><UserRoundCheck className="h-4 w-4" /> Take attendance</ShellButton>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Registers" value={sessions.length} hint={`${submitted} submitted`} />
        <Stat label="Students" value={students.length} />
        <Stat label="Groups" value={groups.length} />
        <Stat label="Codes" value={codes.length} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold">Registers</h2><button className="text-xs font-semibold text-slate-500 hover:text-slate-900" onClick={() => onGo('attendance')}>Open</button></div>
          {!sessions.length ? <EmptyState icon={<UserRoundCheck className="h-5 w-5" />} title="No registers today" /> : (
            <div className="divide-y divide-slate-100">
              {sessions.slice(0, 8).map((session) => (
                <div key={session.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0"><div className="truncate text-sm font-semibold">{session.label || session.session_type.toUpperCase()}</div><div className="text-xs text-slate-400">{session.session_type}</div></div>
                  <span className={cx('rounded-full px-2.5 py-1 text-[11px] font-bold', session.status === 'submitted' || session.status === 'locked' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>{session.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/40">
          <h2 className="text-sm font-bold">Quick access</h2>
          <div className="mt-3 space-y-2">
            {[
              ['timetable', 'Timetable', CalendarDays],
              ['students', 'Student 360°', GraduationCap],
              ['setup', 'School setup', Settings2],
            ].map(([id, label, Icon]) => (
              <button key={String(id)} onClick={() => onGo(id as View)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-left transition hover:bg-slate-50">
                <span className="flex items-center gap-2.5 text-sm font-semibold"><Icon className="h-4 w-4 text-slate-400" />{String(label)}</span><ChevronRight className="h-4 w-4 text-slate-300" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function AttendanceView({ schoolId, groups, students, codes, onChanged }: {
  schoolId: string;
  groups: TeachingGroup[];
  students: SchoolMember[];
  codes: AttendanceCode[];
  onChanged: () => Promise<void>;
}) {
  const [date, setDate] = useState(TODAY);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [selected, setSelected] = useState<AttendanceSession | null>(null);
  const [groupId, setGroupId] = useState(groups[0]?.id || '');
  const [sessionType, setSessionType] = useState('am');
  const [groupStudentIds, setGroupStudentIds] = useState<string[]>([]);
  const [marks, setMarks] = useState<Record<string, DraftMark>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const studentById = useMemo(() => new Map(students.map((student) => [student.user_id, student])), [students]);
  const visibleStudents = groupStudentIds.map((id) => studentById.get(id)).filter(Boolean) as SchoolMember[];
  const presentCode = codes.find((code) => code.code === 'P') || codes.find((code) => code.counts_as_present) || codes[0];

  async function loadSessions() {
    setSessions(await listAttendanceSessions(schoolId, date));
  }

  useEffect(() => { void loadSessions(); }, [date, schoolId]);
  useEffect(() => { if (!groupId && groups[0]) setGroupId(groups[0].id); }, [groups, groupId]);

  async function openSession(session: AttendanceSession) {
    if (!session.group_id) return;
    setBusy(true);
    try {
      const [ids, records] = await Promise.all([listGroupStudentIds(session.group_id), listAttendanceRecords(session.id)]);
      const next: Record<string, DraftMark> = {};
      for (const row of records as any[]) next[row.student_id] = { code_id: row.code_id, minutes_late: row.minutes_late, reason: row.reason };
      setGroupStudentIds(ids);
      setMarks(next);
      setSelected(session);
    } finally { setBusy(false); }
  }

  async function createRegister() {
    if (!groupId) return;
    setBusy(true);
    try {
      const group = groups.find((item) => item.id === groupId);
      const session = await createAttendanceSession({ school_id: schoolId, session_date: date, session_type: sessionType, group_id: groupId, label: `${group?.name || 'Group'} · ${sessionType.toUpperCase()}` });
      await loadSessions();
      await openSession(session);
    } finally { setBusy(false); }
  }

  function markAllPresent() {
    if (!presentCode) return;
    setMarks(Object.fromEntries(visibleStudents.map((student) => [student.user_id, { code_id: presentCode.id }])));
  }

  async function save(submit = false) {
    if (!selected) return;
    const missing = visibleStudents.filter((student) => !marks[student.user_id]);
    if (submit && missing.length) { setMessage(`${missing.length} unmarked`); return; }
    setBusy(true);
    try {
      const rows = Object.entries(marks).map(([student_id, value]) => ({ student_id, ...value }));
      await saveAttendanceRecords(schoolId, selected.id, rows);
      if (submit) {
        await submitAttendanceSession(selected.id);
        setSelected({ ...selected, status: 'submitted', submitted_at: new Date().toISOString() });
      }
      setMessage(submit ? 'Submitted' : 'Saved');
      await loadSessions();
      await onChanged();
    } finally { setBusy(false); }
  }

  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><button onClick={() => setSelected(null)} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white"><ArrowLeft className="h-4 w-4" /></button><div><h1 className="text-xl font-bold">{selected.label}</h1><div className="text-xs text-slate-500">{date} · {visibleStudents.length} students</div></div></div>
          <div className="flex gap-2"><ShellButton tone="light" onClick={markAllPresent}><Check className="h-4 w-4" /> All present</ShellButton><ShellButton disabled={busy || selected.status === 'submitted' || selected.status === 'locked'} onClick={() => void save(true)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Submit</ShellButton></div>
        </div>
        {message ? <div className="text-sm font-semibold text-slate-500">{message}</div> : null}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {visibleStudents.map((student, index) => (
            <div key={student.user_id} className={cx('flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between', index > 0 && 'border-t border-slate-100')}>
              <div className="flex min-w-0 items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{initials(memberName(student))}</div><div className="min-w-0"><div className="truncate text-sm font-semibold">{memberName(student)}</div><div className="text-xs text-slate-400">{student.username}</div></div></div>
              <div className="flex flex-wrap gap-1.5">
                {codes.map((code) => (
                  <button key={code.id} type="button" disabled={selected.status === 'submitted' || selected.status === 'locked'} onClick={() => setMarks((current) => ({ ...current, [student.user_id]: { code_id: code.id } }))} className={cx('min-w-10 rounded-lg border px-2.5 py-2 text-xs font-bold transition', marks[student.user_id]?.code_id === code.id ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>{code.code}</button>
                ))}
              </div>
            </div>
          ))}
          {!visibleStudents.length ? <div className="p-8 text-center text-sm text-slate-500">No students in this group.</div> : null}
        </div>
        <div className="flex justify-end"><ShellButton tone="light" disabled={busy || selected.status === 'submitted' || selected.status === 'locked'} onClick={() => void save(false)}>Save draft</ShellButton></div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight">Attendance</h1><div className="mt-1 text-sm text-slate-500">Fast register, exceptions only.</div></div><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-slate-400" /></div>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-[1fr_150px_auto]">
          <select value={groupId} onChange={(event) => setGroupId(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none"><option value="">Choose group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
          <select value={sessionType} onChange={(event) => setSessionType(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none"><option value="am">AM</option><option value="pm">PM</option><option value="daily">Daily</option><option value="lesson">Lesson</option><option value="online">Online</option><option value="activity">Activity</option></select>
          <ShellButton disabled={!groupId || busy} onClick={() => void createRegister()}><Plus className="h-4 w-4" /> New register</ShellButton>
        </div>
      </section>
      {!sessions.length ? <EmptyState icon={<UserRoundCheck className="h-5 w-5" />} title="No registers for this date" /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sessions.map((session) => (
            <button key={session.id} type="button" disabled={!session.group_id || busy} onClick={() => void openSession(session)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50">
              <div className="flex items-start justify-between gap-2"><div><div className="text-sm font-bold">{session.label || session.session_type}</div><div className="mt-1 text-xs text-slate-400">{session.session_type.toUpperCase()}</div></div><span className={cx('rounded-full px-2 py-1 text-[10px] font-bold uppercase', session.status === 'submitted' || session.status === 'locked' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>{session.status}</span></div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TimetableView({ schoolId, template, onTemplateChanged }: { schoolId: string; template: ScheduleTemplate; onTemplateChanged: () => Promise<void> }) {
  const [periods, setPeriods] = useState<SchoolOpsPeriod[]>([]);
  const [day, setDay] = useState('Mon');
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ label: 'Period 1', block_type: 'lesson', starts_at: '08:00', ends_at: '08:45', attendance_required: true });

  async function load() { setPeriods(await listPeriods(template.id)); }
  useEffect(() => { void load(); }, [template.id]);
  const dayPeriods = periods.filter((period) => period.day_key === day).sort((a, b) => a.position - b.position);

  async function addBlock() {
    setBusy(true);
    try {
      await savePeriod({ school_id: schoolId, template_id: template.id, day_key: day, position: dayPeriods.length + 1, ...draft, starts_at: `${draft.starts_at}:00`, ends_at: `${draft.ends_at}:00` });
      await load();
      setShowForm(false);
      setDraft((current) => ({ ...current, label: `Period ${dayPeriods.length + 2}` }));
    } finally { setBusy(false); }
  }

  async function publish() {
    setBusy(true);
    try { await updateScheduleTemplate(template.id, { status: template.status === 'published' ? 'draft' : 'published' }); await onTemplateChanged(); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold tracking-tight">Timetable</h1><span className={cx('rounded-full px-2.5 py-1 text-[10px] font-bold uppercase', template.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{template.status}</span></div><div className="mt-1 text-sm text-slate-500">{template.name}</div></div><div className="flex gap-2"><ShellButton tone="light" onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Add block</ShellButton><ShellButton disabled={busy} onClick={() => void publish()}>{template.status === 'published' ? 'Unpublish' : 'Publish'}</ShellButton></div></div>
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5">
        {DAYS.map((item) => <button key={item} onClick={() => setDay(item)} className={cx('min-w-16 flex-1 rounded-xl px-3 py-2 text-sm font-bold transition', day === item ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50')}>{item}</button>)}
      </div>
      {!dayPeriods.length ? <EmptyState icon={<Clock3 className="h-5 w-5" />} title={`No blocks on ${day}`} action={<ShellButton onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Add first block</ShellButton>} /> : (
        <div className="space-y-2">
          {dayPeriods.map((period) => (
            <div key={period.id} className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <div className="w-20 shrink-0 text-center"><div className="text-sm font-bold">{shortTime(period.starts_at)}</div><div className="text-[11px] text-slate-400">{shortTime(period.ends_at)}</div></div>
              <div className="h-9 w-px bg-slate-100" />
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{period.label}</div><div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400"><span className="capitalize">{period.block_type}</span>{period.attendance_required ? <span>• register</span> : null}</div></div>
              <button type="button" onClick={async () => { await removePeriod(period.id); await load(); }} className="grid h-8 w-8 place-items-center rounded-lg text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100" aria-label="Remove block"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
      {showForm ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/30 p-0 backdrop-blur-sm sm:place-items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false); }}>
          <div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
            <div className="mb-4 flex items-center justify-between"><div><div className="text-base font-bold">New block</div><div className="text-xs text-slate-400">{day}</div></div><button onClick={() => setShowForm(false)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
            <div className="space-y-3">
              <input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="Label" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-slate-400" />
              <div className="grid grid-cols-2 gap-2"><input type="time" value={draft.starts_at} onChange={(event) => setDraft({ ...draft, starts_at: event.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /><input type="time" value={draft.ends_at} onChange={(event) => setDraft({ ...draft, ends_at: event.target.value })} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /></div>
              <select value={draft.block_type} onChange={(event) => setDraft({ ...draft, block_type: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold">{BLOCK_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold"><span>Take attendance</span><input type="checkbox" checked={draft.attendance_required} onChange={(event) => setDraft({ ...draft, attendance_required: event.target.checked })} className="h-4 w-4 accent-slate-950" /></label>
            </div>
            <ShellButton className="mt-4 w-full" disabled={busy || !draft.label || !draft.starts_at || !draft.ends_at} onClick={() => void addBlock()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add block</ShellButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StudentsView({ schoolId, students }: { schoolId: string; students: SchoolMember[] }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SchoolMember | null>(null);
  const [profile, setProfile] = useState<Student360Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const filtered = students.filter((student) => `${memberName(student)} ${student.username} ${student.email}`.toLowerCase().includes(search.toLowerCase())).slice(0, 100);

  async function openStudent(student: SchoolMember) {
    setSelected(student); setProfile(null); setBusy(true);
    try { setProfile(await getStudent360(schoolId, student.user_id)); } finally { setBusy(false); }
  }

  if (selected) {
    const attendance = profile?.attendance || { recorded: 0, present: 0, late: 0 };
    const rate = attendance.recorded ? Math.round((attendance.present / attendance.recorded) * 100) : null;
    const focus = profile?.focus || [];
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3"><button onClick={() => { setSelected(null); setProfile(null); }} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white"><ArrowLeft className="h-4 w-4" /></button><div className="min-w-0"><h1 className="truncate text-xl font-bold">{memberName(selected)}</h1><div className="text-xs text-slate-500">Student 360°</div></div></div>
        {busy ? <div className="grid min-h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div> : (
          <>
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-slate-950 text-base font-bold text-white">{initials(memberName(selected))}</div><div className="min-w-0"><div className="truncate text-lg font-bold">{profile?.student?.full_name || memberName(selected)}</div><div className="truncate text-sm text-slate-500">{profile?.placement?.class_name || selected.batch || 'No current class'}</div></div></div>
                <div className="grid grid-cols-3 gap-2"><div className="rounded-xl bg-slate-50 px-3 py-2 text-center"><div className="text-lg font-bold">{rate === null ? '—' : `${rate}%`}</div><div className="text-[10px] font-semibold uppercase text-slate-400">Attendance</div></div><div className="rounded-xl bg-slate-50 px-3 py-2 text-center"><div className="text-lg font-bold">{attendance.late}</div><div className="text-[10px] font-semibold uppercase text-slate-400">Late</div></div><div className="rounded-xl bg-slate-50 px-3 py-2 text-center"><div className="text-lg font-bold">{focus.length}</div><div className="text-[10px] font-semibold uppercase text-slate-400">Signals</div></div></div>
              </div>
            </section>
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 text-sm font-bold">Learning signals</div>{!focus.length ? <div className="py-8 text-center text-sm text-slate-400">No recent signals</div> : <div className="space-y-2">{focus.slice(0, 8).map((item: any, index) => <div key={index} className="rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-3"><div className="truncate text-sm font-semibold">{item.subskill || item.skill || item.topic || item.subject || 'Learning observation'}</div>{item.evidence_percentage != null ? <span className="text-xs font-bold text-slate-500">{Math.round(Number(item.evidence_percentage))}%</span> : null}</div><div className="mt-1 text-xs text-slate-400">{[item.subject, item.observation_type].filter(Boolean).join(' · ')}</div></div>)}</div>}</section>
              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 text-sm font-bold">Snapshot</div><div className="divide-y divide-slate-100 text-sm">{[['Username', profile?.student?.username || selected.username], ['Email', profile?.student?.email || selected.email], ['Grade', profile?.placement?.grade_level || selected.grade || '—'], ['Recorded sessions', attendance.recorded]].map(([label, value]) => <div key={String(label)} className="flex items-center justify-between gap-4 py-3"><span className="text-slate-400">{label}</span><span className="truncate font-semibold text-slate-700">{String(value || '—')}</span></div>)}</div></section>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold tracking-tight">Students</h1><div className="mt-1 text-sm text-slate-500">One student, one record.</div></div>
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students" className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-slate-400" /></div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((student) => <button key={student.user_id} onClick={() => void openStudent(student)} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-bold text-slate-600">{initials(memberName(student))}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{memberName(student)}</div><div className="truncate text-xs text-slate-400">{student.batch || student.username}</div></div><ChevronRight className="h-4 w-4 text-slate-300" /></button>)}
      </div>
      {!filtered.length ? <EmptyState icon={<UsersRound className="h-5 w-5" />} title="No students found" /> : null}
    </div>
  );
}

function SetupView({ settings, template, onSaved }: { settings: SchoolOpsSettings; template: ScheduleTemplate | null; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<SchoolOpsSettings>(settings);
  const [busy, setBusy] = useState(false);

  useEffect(() => setDraft(settings), [settings]);

  async function save() {
    setBusy(true);
    try {
      await saveSchoolOpsSettings(draft);
      if (template && (template.cycle_type !== draft.cycle_type || template.cycle_length !== draft.cycle_length)) await updateScheduleTemplate(template.id, { cycle_type: draft.cycle_type, cycle_length: draft.cycle_length });
      await onSaved();
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div><h1 className="text-2xl font-bold tracking-tight">Setup</h1><div className="mt-1 text-sm text-slate-500">Start simple. Change anything later.</div></div>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-bold">School model</div>
        <div className="mt-3 flex flex-wrap gap-2">{PRESETS.map((preset) => <button key={preset.id} onClick={() => setDraft({ ...draft, preset: preset.id })} className={cx('rounded-xl border px-3 py-2 text-xs font-bold transition', draft.preset === preset.id ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>{preset.label}</button>)}</div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-bold">Language</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{[['grade', 'Grade'], ['class', 'Class'], ['homeroom', 'Homeroom'], ['period', 'Period']].map(([key, placeholder]) => <label key={key} className="rounded-xl border border-slate-200 px-3 py-2"><span className="text-[10px] font-bold uppercase text-slate-400">{placeholder}</span><input value={draft.terminology?.[key] || ''} onChange={(event) => setDraft({ ...draft, terminology: { ...draft.terminology, [key]: event.target.value } })} className="block w-full border-0 bg-transparent p-0 text-sm font-semibold outline-none" /></label>)}</div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-bold">Schedule</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2"><label className="rounded-xl border border-slate-200 px-3 py-2"><span className="text-[10px] font-bold uppercase text-slate-400">Cycle</span><select value={draft.cycle_type} onChange={(event) => setDraft({ ...draft, cycle_type: event.target.value as SchoolOpsSettings['cycle_type'] })} className="block w-full bg-transparent text-sm font-semibold outline-none"><option value="weekly">Weekly</option><option value="ab">Week A / B</option><option value="rotating">Rotating days</option><option value="custom">Custom</option></select></label><label className="rounded-xl border border-slate-200 px-3 py-2"><span className="text-[10px] font-bold uppercase text-slate-400">Cycle length</span><input type="number" min={1} max={20} value={draft.cycle_length} onChange={(event) => setDraft({ ...draft, cycle_length: Number(event.target.value) || 1 })} className="block w-full border-0 bg-transparent p-0 text-sm font-semibold outline-none" /></label></div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-bold">Attendance</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">{[['am_pm', 'AM / PM'], ['lesson', 'By lesson'], ['daily', 'Daily']].map(([key, label]) => <button key={key} type="button" onClick={() => setDraft({ ...draft, attendance_mode: { ...draft.attendance_mode, [key]: !draft.attendance_mode?.[key as keyof typeof draft.attendance_mode] } })} className={cx('flex items-center justify-between rounded-xl border px-3 py-3 text-sm font-semibold', draft.attendance_mode?.[key as keyof typeof draft.attendance_mode] ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 text-slate-600')}><span>{label}</span>{draft.attendance_mode?.[key as keyof typeof draft.attendance_mode] ? <Check className="h-4 w-4" /> : null}</button>)}</div>
      </section>
      <div className="flex justify-end"><ShellButton disabled={busy} onClick={() => void save()}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save setup</ShellButton></div>
    </div>
  );
}
