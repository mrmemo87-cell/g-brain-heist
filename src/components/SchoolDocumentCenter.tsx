import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import {
  createSchoolDocumentId,
  openSchoolDocumentPreview,
  safeCsvCell,
  type SchoolDocumentMeta,
  type SchoolDocumentOptions,
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
  payload: Record<string, unknown>;
}

interface SchoolDocumentCenterProps {
  schoolId: string;
}

const audienceLabel = (value: SchoolDocumentRecord['audience']) => ({
  family: 'Family', student: 'Student', teacher: 'Teacher', internal: 'Internal',
})[value];

const SchoolDocumentCenter: React.FC<SchoolDocumentCenterProps> = ({ schoolId }) => {
  const [records, setRecords] = useState<SchoolDocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [audience, setAudience] = useState<'all' | SchoolDocumentRecord['audience']>('all');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void supabase.from('school_document_records')
      .select('id,document_id,template_key,template_version,title,audience,status,confidentiality,source_type,source_id,generated_at,payload')
      .eq('school_id', schoolId)
      .order('generated_at', { ascending: false })
      .limit(150)
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError('Document history could not be loaded.');
        else setRecords((data ?? []) as SchoolDocumentRecord[]);
        setLoading(false);
      });
    return () => { active = false; };
  }, [schoolId]);

  const visibleRecords = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return records.filter((record) => {
      if (audience !== 'all' && record.audience !== audience) return false;
      return !normalized || `${record.title} ${record.document_id} ${record.template_key}`.toLowerCase().includes(normalized);
    });
  }, [audience, query, records]);

  const reprint = (record: SchoolDocumentRecord) => {
    const payload = record.payload as Partial<SchoolDocumentOptions> & { payloadOmitted?: boolean; rawHtml?: string };
    if (typeof payload.rawHtml === 'string') {
      const preview = window.open('', '_blank');
      if (!preview) { setError('The document preview was blocked. Allow pop-ups and try again.'); return; }
      preview.opener = null;
      preview.document.open();
      preview.document.write(payload.rawHtml);
      preview.document.close();
      return;
    }
    if (payload.payloadOmitted || !payload.meta || typeof payload.bodyHtml !== 'string') {
      setError('This document contains a large visual asset and must be regenerated from its original workspace.');
      return;
    }
    const originalMeta = payload.meta as SchoolDocumentMeta;
    openSchoolDocumentPreview({
      meta: {
        ...originalMeta,
        documentId: createSchoolDocumentId(originalMeta.templateVersion.split('-')[0] || 'document'),
        generatedAt: new Date().toISOString(),
        sourceType: 'document_reprint',
        sourceId: record.document_id,
      },
      bodyHtml: payload.bodyHtml,
      orientation: payload.orientation,
      paper: payload.paper,
      fileName: payload.fileName,
      inkSaver: payload.inkSaver,
    });
  };

  const exportHistory = () => {
    const header = ['Document ID', 'Title', 'Audience', 'Status', 'Confidentiality', 'Template', 'Generated'].map(safeCsvCell).join(',');
    const rows = visibleRecords.map((record) => [record.document_id, record.title, audienceLabel(record.audience), record.status, record.confidentiality, record.template_version, record.generated_at].map(safeCsvCell).join(','));
    const url = URL.createObjectURL(new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `school-document-history-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-5" aria-labelledby="document-center-title">
      <header className="teacher-section-header">
        <div><h2 id="document-center-title">Document Center</h2><p className="mt-1 text-sm text-slate-500">A secure audit trail of reports, rosters, papers and school documents generated from your workspace.</p></div>
        <button type="button" className="teacher-btn teacher-btn-secondary" onClick={exportHistory} disabled={!visibleRecords.length}>Export history</button>
      </header>
      <div className="teacher-card grid gap-3 p-4 sm:grid-cols-[1fr_180px]">
        <label><span className="sr-only">Search document history</span><input className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or document ID…" /></label>
        <label><span className="sr-only">Filter by audience</span><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={audience} onChange={(event) => setAudience(event.target.value as typeof audience)}><option value="all">All audiences</option><option value="family">Family</option><option value="student">Student</option><option value="teacher">Teacher</option><option value="internal">Internal</option></select></label>
      </div>
      {error ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="status">{error}</div> : null}
      {loading ? <div className="teacher-card p-10 text-center text-slate-500">Loading document history…</div> : visibleRecords.length ? (
        <div className="grid gap-3">
          {visibleRecords.map((record) => {
            const recordPayload = record.payload as Partial<SchoolDocumentOptions> & { payloadOmitted?: boolean; rawHtml?: string };
            const canReprint = !recordPayload.payloadOmitted && (Boolean(recordPayload.bodyHtml) || Boolean(recordPayload.rawHtml));
            return <article key={record.id} className="teacher-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{audienceLabel(record.audience)}</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${record.status === 'draft' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{record.status}</span><span className="text-xs text-slate-400">{record.template_version}</span></div><h3 className="mt-2 font-bold text-slate-900">{record.title}</h3><p className="mt-1 font-mono text-xs text-slate-500">{record.document_id}</p><p className="mt-1 text-xs text-slate-500">{new Date(record.generated_at).toLocaleString()}</p></div>
              <button type="button" className="teacher-btn teacher-btn-primary" onClick={() => reprint(record)} disabled={!canReprint}>{canReprint ? 'Open copy' : 'Regenerate at source'}</button>
            </article>;
          })}
        </div>
      ) : <div className="teacher-card p-10 text-center text-slate-500">No documents match this view yet. New reports and classroom documents will appear here after they are generated.</div>}
    </section>
  );
};

export default SchoolDocumentCenter;
