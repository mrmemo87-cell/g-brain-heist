import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import {
  createSchoolDocumentId,
  openSchoolDocumentPreview,
  safeCsvCell,
  schoolDocumentTypeLabel,
  type SchoolDocumentMeta,
  type SchoolDocumentOptions,
  type SchoolDocumentVisibilityScope,
} from '../lib/schoolDocument';

interface SchoolDocumentRecord {
  id: string;
  document_id: string;
  template_key: string;
  template_version: string;
  title: string;
  audience: SchoolDocumentMeta['audience'];
  status: SchoolDocumentMeta['status'];
  confidentiality: SchoolDocumentMeta['confidentiality'];
  source_type: string | null;
  source_id: string | null;
  generated_at: string;
  generated_by: string | null;
  owner_teacher_id: string | null;
  class_id: string | null;
  student_user_id: string | null;
  visibility_scope: SchoolDocumentVisibilityScope;
  payload: Record<string, unknown>;
}

export interface SchoolDocumentStaffOption { userId: string; label: string }

interface SchoolDocumentCenterProps {
  schoolId: string;
  mode?: 'teacher' | 'admin';
  staffOptions?: SchoolDocumentStaffOption[];
  onOpenSource?: (source: 'classes' | 'teachers' | 'admissions' | 'cambridge' | 'ielts') => void;
}

const audienceLabel = (value: SchoolDocumentRecord['audience']) => ({
  family: 'Family', student: 'Student', teacher: 'Teacher', internal: 'Internal',
})[value];

const visibilityLabels: Record<SchoolDocumentVisibilityScope, string> = {
  private: 'Only me',
  class_staff: 'Assigned class staff',
  school_staff: 'Teaching staff',
  student_family: 'Student or family',
  admin_only: 'School administrators',
};

const visibilityHelp: Record<SchoolDocumentVisibilityScope, string> = {
  private: 'Visible to its creator and school administrators.',
  class_staff: 'Visible to staff currently assigned to the linked class.',
  school_staff: 'Visible to active teaching staff in this school.',
  student_family: 'Visible to the named student when the document is final.',
  admin_only: 'Visible only to school administrators.',
};

const RECORD_COLUMNS = 'id,document_id,template_key,template_version,title,audience,status,confidentiality,source_type,source_id,student_user_id,generated_at,generated_by,owner_teacher_id,class_id,visibility_scope,payload';
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (character) => `\\${character}`);

const SchoolDocumentCenter: React.FC<SchoolDocumentCenterProps> = ({ schoolId, mode = 'teacher', staffOptions = [], onOpenSource }) => {
  const [records, setRecords] = useState<SchoolDocumentRecord[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [audience, setAudience] = useState<'all' | SchoolDocumentRecord['audience']>('all');
  const [ownership, setOwnership] = useState<'mine' | 'shared' | 'all'>(mode === 'teacher' ? 'mine' : 'all');
  const [savingId, setSavingId] = useState('');
  const [accessRecord, setAccessRecord] = useState<SchoolDocumentRecord | null>(null);
  const [granteeIds, setGranteeIds] = useState<Set<string>>(new Set());

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id ?? '';
    setCurrentUserId(uid);
    const makeRequest = () => supabase.from('school_document_records')
      .select(RECORD_COLUMNS)
      .eq('school_id', schoolId)
      .order('generated_at', { ascending: false });
    const normalized = query.trim();
    let loadedRecords: SchoolDocumentRecord[] = [];
    let loadError: { message: string } | null = null;
    if (normalized) {
      const safe = escapeLike(normalized);
      const [referenceResult, titleResult] = await Promise.all([
        makeRequest().ilike('document_id', `%${safe}%`).limit(250),
        makeRequest().ilike('title', `%${safe}%`).limit(250),
      ]);
      loadError = referenceResult.error || titleResult.error;
      const unique = new Map<string, SchoolDocumentRecord>();
      [...(referenceResult.data ?? []), ...(titleResult.data ?? [])].forEach((record) => unique.set(record.id, record as SchoolDocumentRecord));
      loadedRecords = [...unique.values()].sort((left, right) => right.generated_at.localeCompare(left.generated_at));
    } else {
      const result = await makeRequest().limit(150);
      loadError = result.error;
      loadedRecords = (result.data ?? []) as SchoolDocumentRecord[];
    }
    if (loadError) setError('Document history could not be loaded.');
    else setRecords(loadedRecords);
    setLoading(false);
  }, [query, schoolId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRecords(); }, query.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [loadRecords, query]);

  const visibleRecords = useMemo(() => records.filter((record) => {
    if (audience !== 'all' && record.audience !== audience) return false;
    if (mode === 'teacher' && ownership === 'mine') return record.owner_teacher_id === currentUserId || record.generated_by === currentUserId;
    if (mode === 'teacher' && ownership === 'shared') return record.owner_teacher_id !== currentUserId && record.generated_by !== currentUserId;
    return true;
  }), [audience, currentUserId, mode, ownership, records]);

  const reprint = (record: SchoolDocumentRecord) => {
    const payload = record.payload as Partial<SchoolDocumentOptions> & { payloadOmitted?: boolean; rawHtml?: string };
    if (typeof payload.rawHtml === 'string') {
      const preview = window.open('', '_blank');
      if (!preview) { setError('The document preview was blocked. Allow pop-ups and try again.'); return; }
      preview.opener = null;
      preview.document.open(); preview.document.write(payload.rawHtml); preview.document.close();
      return;
    }
    if (payload.payloadOmitted || !payload.meta || typeof payload.bodyHtml !== 'string') {
      setError('This document contains a large visual asset and must be regenerated from its original workspace.');
      return;
    }
    const originalMeta = payload.meta as SchoolDocumentMeta;
    openSchoolDocumentPreview({
      meta: { ...originalMeta, documentId: createSchoolDocumentId(originalMeta.templateVersion), generatedAt: new Date().toISOString(), sourceType: 'document_reprint', sourceId: record.document_id },
      bodyHtml: payload.bodyHtml, orientation: payload.orientation, paper: payload.paper, fileName: payload.fileName, inkSaver: payload.inkSaver,
    });
  };

  const updateVisibility = async (record: SchoolDocumentRecord, visibilityScope: SchoolDocumentVisibilityScope) => {
    setSavingId(record.id); setError(''); setNotice('');
    const { error: saveError } = await supabase.from('school_document_records').update({ visibility_scope: visibilityScope, updated_at: new Date().toISOString() }).eq('id', record.id).eq('school_id', schoolId);
    if (saveError) setError('The sharing setting could not be changed.');
    else { setRecords((items) => items.map((item) => item.id === record.id ? { ...item, visibility_scope: visibilityScope } : item)); setNotice('Sharing setting updated.'); }
    setSavingId('');
  };

  const openAccess = async (record: SchoolDocumentRecord) => {
    setAccessRecord(record); setError('');
    const { data, error: loadError } = await supabase.from('school_document_access_grants').select('grantee_user_id').eq('document_record_id', record.id).eq('school_id', schoolId);
    if (loadError) setError('Individual access could not be loaded.');
    setGranteeIds(new Set((data ?? []).map((row: { grantee_user_id: string }) => row.grantee_user_id)));
  };

  const toggleGrant = async (userId: string) => {
    if (!accessRecord) return;
    setSavingId(accessRecord.id); setError('');
    const selected = granteeIds.has(userId);
    const request = selected
      ? supabase.from('school_document_access_grants').delete().eq('document_record_id', accessRecord.id).eq('grantee_user_id', userId)
      : supabase.from('school_document_access_grants').insert({ document_record_id: accessRecord.id, school_id: schoolId, grantee_user_id: userId });
    const { error: saveError } = await request;
    if (saveError) setError('Individual access could not be updated.');
    else setGranteeIds((current) => { const next = new Set(current); selected ? next.delete(userId) : next.add(userId); return next; });
    setSavingId('');
  };

  const exportHistory = () => {
    const header = ['Document reference', 'Title', 'Document type', 'Audience', 'Status', 'Sharing', 'Generated'].map(safeCsvCell).join(',');
    const rows = visibleRecords.map((record) => [record.document_id, record.title, schoolDocumentTypeLabel(record.template_version, record.title), audienceLabel(record.audience), record.status, visibilityLabels[record.visibility_scope], record.generated_at].map(safeCsvCell).join(','));
    const url = URL.createObjectURL(new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `school-document-history-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <section className={`school-document-center ${mode === 'admin' ? 'is-admin' : 'is-teacher'} space-y-5`} aria-labelledby="document-center-title">
      <header className="teacher-section-header"><div><h2 id="document-center-title">Document Center</h2><p className="mt-1 text-sm text-slate-500">Find, reprint and safely share official school documents by their reference.</p></div><button type="button" className="teacher-btn teacher-btn-secondary" onClick={exportHistory} disabled={!visibleRecords.length}>Export history</button></header>
      {mode === 'admin' && onOpenSource ? <div className="teacher-card p-4"><h3 className="font-bold text-slate-900">Create a school document</h3><p className="mt-1 text-sm text-slate-500">Choose the workspace that owns the source information.</p><div className="mt-3 flex flex-wrap gap-2">{([['classes', 'Class lists & registers'], ['teachers', 'Teacher allocations'], ['admissions', 'Admissions reports'], ['cambridge', 'Cambridge reports'], ['ielts', 'IELTS documents']] as const).map(([source, label]) => <button key={source} type="button" className="teacher-btn teacher-btn-secondary" onClick={() => onOpenSource(source)}>{label}</button>)}</div></div> : null}
      <div className="teacher-card grid gap-3 p-4 md:grid-cols-[1fr_180px_180px]"><label><span className="sr-only">Search document history</span><input className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Enter a document reference or title…" /></label><label><span className="sr-only">Filter by audience</span><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={audience} onChange={(event) => setAudience(event.target.value as typeof audience)}><option value="all">All audiences</option><option value="family">Family</option><option value="student">Student</option><option value="teacher">Teacher</option><option value="internal">Internal</option></select></label>{mode === 'teacher' ? <label><span className="sr-only">Filter by ownership</span><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={ownership} onChange={(event) => setOwnership(event.target.value as typeof ownership)}><option value="mine">My documents</option><option value="shared">Shared with me</option><option value="all">All I can access</option></select></label> : <div className="flex items-center rounded-lg bg-indigo-50 px-3 text-sm font-semibold text-indigo-800">All school documents</div>}</div>
      {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">{notice}</div> : null}{error ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="alert">{error}</div> : null}
      {loading ? <div className="teacher-card p-10 text-center text-slate-500">Loading document history…</div> : visibleRecords.length ? <div className="grid gap-3">{visibleRecords.map((record) => {
        const payload = record.payload as Partial<SchoolDocumentOptions> & { payloadOmitted?: boolean; rawHtml?: string };
        const canReprint = !payload.payloadOmitted && (Boolean(payload.bodyHtml) || Boolean(payload.rawHtml));
        const ownsRecord = record.owner_teacher_id === currentUserId || record.generated_by === currentUserId;
        const canSetVisibility = mode === 'admin' || ownsRecord;
        return <article key={record.id} className="teacher-card p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{audienceLabel(record.audience)}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${record.status === 'draft' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{record.status === 'draft' ? 'Draft' : 'Final'}</span><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{visibilityLabels[record.visibility_scope]}</span></div><h3 className="mt-2 font-bold text-slate-900">{record.title}</h3><p className="mt-1 text-sm text-slate-600">{schoolDocumentTypeLabel(record.template_version, record.title)}</p><p className="mt-1 font-mono text-xs font-semibold text-slate-600">{record.document_id}</p><p className="mt-1 text-xs text-slate-500">{new Date(record.generated_at).toLocaleString()}</p></div><div className="flex flex-col gap-2 sm:flex-row sm:items-end"><label className="text-xs font-semibold text-slate-600">Sharing<select aria-label={`Sharing for ${record.title}`} className="mt-1 block min-w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" value={record.visibility_scope} disabled={!canSetVisibility || savingId === record.id} title={visibilityHelp[record.visibility_scope]} onChange={(event) => void updateVisibility(record, event.target.value as SchoolDocumentVisibilityScope)}><option value="private">Only me</option><option value="class_staff" disabled={!record.class_id}>Assigned class staff</option><option value="school_staff">Teaching staff</option><option value="student_family" disabled={!record.student_user_id || record.status !== 'final'}>Student or family</option>{mode === 'admin' ? <option value="admin_only">School administrators</option> : null}</select></label>{mode === 'admin' && staffOptions.length ? <button type="button" className="teacher-btn teacher-btn-secondary" onClick={() => void openAccess(record)}>Individual access</button> : null}<button type="button" className="teacher-btn teacher-btn-primary" onClick={() => reprint(record)} disabled={!canReprint}>{canReprint ? 'Open printable copy' : 'Regenerate at source'}</button></div></div></article>;
      })}</div> : <div className="teacher-card p-10 text-center text-slate-500">No documents match this view. Generate a document from its school or teaching workspace and it will appear here.</div>}
      {accessRecord ? <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="document-access-title"><div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h3 id="document-access-title" className="text-lg font-bold text-slate-900">Individual access</h3><p className="mt-1 text-sm text-slate-500">Give selected school staff access without changing the general sharing setting.</p></div><button type="button" className="teacher-btn teacher-btn-secondary" onClick={() => setAccessRecord(null)}>Close</button></div><div className="mt-5 grid gap-2">{staffOptions.filter((staff) => staff.userId !== accessRecord.owner_teacher_id).map((staff) => <label key={staff.userId} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={granteeIds.has(staff.userId)} disabled={savingId === accessRecord.id} onChange={() => void toggleGrant(staff.userId)} /><span>{staff.label}</span></label>)}</div></div></div> : null}
    </section>
  );
};

export default SchoolDocumentCenter;
