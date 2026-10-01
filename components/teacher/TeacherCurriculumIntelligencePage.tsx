import React, { useEffect, useMemo, useState } from 'react';
import type { Profile } from '../../types';
import * as GameService from '../../services/gameService';
import EconomicsDiagnosticLauncher from './EconomicsDiagnosticLauncher';
import {
  getTeacherCurriculumGroups,
  getTeacherCurriculumIntelligence,
  type CurriculumTeachingGroup,
  type CurriculumSubskillEvidence,
  type TeacherCurriculumIntelligence,
} from '../../services/teacherCurriculumIntelligenceService';

interface TeacherCurriculumIntelligencePageProps {
  profile: Profile;
  onBack: () => void;
}

type EvidenceFilter = 'all' | 'assessed' | 'low_data' | 'review' | 'not_assessed';

const pct = (value: number | null | undefined) => (
  typeof value === 'number' ? `${value.toFixed(value % 1 ? 1 : 0)}%` : '—'
);

const humanizePhase = (phase?: string) => (
  phase ? phase.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Not set'
);

const evidenceLabel = (
  evidence: CurriculumSubskillEvidence | undefined,
  studentCount: number,
): { label: string; tone: string } => {
  if (!evidence || evidence.studentsWithEvidence === 0) return { label: 'Not assessed', tone: 'slate' };
  if (evidence.teacherReviewStudents > 0 || evidence.contradictoryStudents > 0) return { label: 'Review evidence', tone: 'amber' };
  if (evidence.assessedStudents > 0) return { label: 'Assessed evidence', tone: 'emerald' };
  if (evidence.lowDataStudents > 0) return { label: 'Low-data evidence', tone: 'violet' };
  if (evidence.staleStudents > 0) return { label: 'Evidence is stale', tone: 'orange' };
  if (studentCount > 0) return { label: 'Evidence recorded', tone: 'blue' };
  return { label: 'No students', tone: 'slate' };
};

const toneClasses: Record<string, string> = {
  slate: 'border-slate-200 bg-slate-50 text-slate-600',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  violet: 'border-violet-200 bg-violet-50 text-violet-800',
  orange: 'border-orange-200 bg-orange-50 text-orange-800',
  blue: 'border-blue-200 bg-blue-50 text-blue-800',
};

const reteachTone = (priority: 'urgent' | 'high' | 'watch') => ({
  urgent: 'border-rose-200 bg-rose-50 text-rose-800',
  high: 'border-amber-200 bg-amber-50 text-amber-800',
  watch: 'border-sky-200 bg-sky-50 text-sky-800',
}[priority]);

const studentStatusLabel = (status: string) => ({
  persistent: 'Persistent',
  recurring: 'Recurring',
  new_focus: 'New',
  improving: 'Improving',
  resolved: 'Resolved',
}[status] || status.replace(/_/g, ' '));

const paperEvidenceState = (state: 'not_assessed' | 'low_data' | 'evidence_established') => ({
  not_assessed: { label: 'Not assessed', className: 'border-slate-200 bg-slate-50 text-slate-600' },
  low_data: { label: 'Building evidence', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  evidence_established: { label: 'Evidence established', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
}[state]);

const curriculumGroupStorageKey = (profileId: string) => `bh:curriculum-intelligence:selected-group:${profileId}`;

const TeacherCurriculumIntelligencePage: React.FC<TeacherCurriculumIntelligencePageProps> = ({
  profile,
  onBack,
}) => {
  const [groups, setGroups] = useState<CurriculumTeachingGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [snapshot, setSnapshot] = useState<TeacherCurriculumIntelligence | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [strandCode, setStrandCode] = useState('all');
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceFilter>('all');
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
  const [selectedLeaf, setSelectedLeaf] = useState<GameService.TeacherAcademicSkillRegistryLeaf | null>(null);
  const [focuses, setFocuses] = useState<GameService.TeacherAcademicEvidenceFocus[]>([]);
  const [focusLoading, setFocusLoading] = useState(false);
  const [diagnosticLauncherOpen, setDiagnosticLauncherOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!profile.school_id) {
        setLoadingGroups(false);
        setError('Curriculum Intelligence becomes available when your teacher account is connected to a school.');
        return;
      }
      setLoadingGroups(true);
      setError('');
      try {
        const rows = await getTeacherCurriculumGroups(profile.school_id);
        if (!active) return;
        setGroups(rows);
        let rememberedGroupId = '';
        try {
          rememberedGroupId = window.localStorage.getItem(curriculumGroupStorageKey(profile.id)) || '';
        } catch {
          rememberedGroupId = '';
        }
        const rememberedGroup = rows.find((group) => group.id === rememberedGroupId);
        setSelectedGroupId((rememberedGroup || rows[0])?.id || '');
      } catch (loadError) {
        console.error('Curriculum Intelligence groups failed to load', loadError);
        if (active) setError('We could not load your curriculum groups. Refresh and try again.');
      } finally {
        if (active) setLoadingGroups(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [profile.school_id]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) || null,
    [groups, selectedGroupId],
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!profile.school_id || !selectedGroup) {
        setSnapshot(null);
        return;
      }
      setLoadingSnapshot(true);
      setError('');
      setSelectedLeaf(null);
      setFocuses([]);
      try {
        const result = await getTeacherCurriculumIntelligence(profile.school_id, selectedGroup);
        if (!active) return;
        setSnapshot(result);
        const firstSkill = result.registry.skills[0]?.skillCode;
        setExpandedSkills(firstSkill ? new Set([firstSkill]) : new Set());
      } catch (loadError) {
        console.error('Curriculum Intelligence snapshot failed to load', loadError);
        if (active) {
          setSnapshot(null);
          setError('This curriculum map is not available for this teaching group yet. Refresh and try again, or contact your school administrator if the subject was recently configured.');
        }
      } finally {
        if (active) setLoadingSnapshot(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [profile.school_id, selectedGroup]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!selectedLeaf || !selectedGroup) {
        setFocuses([]);
        return;
      }
      setFocusLoading(true);
      try {
        const rows = await GameService.get_teacher_academic_evidence_focuses(
          selectedGroup.subjectLabel,
          selectedGroup.gradeNumber,
          selectedLeaf.subskillCode,
        );
        if (active) setFocuses(rows);
      } catch (focusError) {
        console.warn('Evidence Focus catalogue unavailable', focusError);
        if (active) setFocuses([]);
      } finally {
        if (active) setFocusLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [selectedLeaf, selectedGroup]);

  const strands = useMemo(() => {
    if (!snapshot) return [];
    const byCode = new Map<string, string>();
    snapshot.registry.skills.forEach((leaf) => byCode.set(leaf.strandCode, leaf.strandName));
    return [...byCode.entries()].map(([code, name]) => ({ code, name }));
  }, [snapshot]);

  const groupedSkills = useMemo(() => {
    if (!snapshot) return [];
    const search = query.trim().toLocaleLowerCase();
    const skills = new Map<string, {
      code: string;
      name: string;
      description?: string;
      strandCode: string;
      strandName: string;
      leaves: GameService.TeacherAcademicSkillRegistryLeaf[];
    }>();

    snapshot.registry.skills.forEach((leaf) => {
      if (strandCode !== 'all' && leaf.strandCode !== strandCode) return;
      const evidence = snapshot.evidenceBySubskill[leaf.subskillCode];
      const matchesEvidence =
        evidenceFilter === 'all'
        || (evidenceFilter === 'assessed' && (evidence?.assessedStudents || 0) > 0)
        || (evidenceFilter === 'low_data' && (evidence?.lowDataStudents || 0) > 0)
        || (evidenceFilter === 'review' && ((evidence?.teacherReviewStudents || 0) > 0 || (evidence?.contradictoryStudents || 0) > 0))
        || (evidenceFilter === 'not_assessed' && (!evidence || evidence.studentsWithEvidence === 0));
      if (!matchesEvidence) return;

      const searchable = [
        leaf.strandName,
        leaf.skillName,
        leaf.skillDescription,
        leaf.subskillName,
        leaf.subskillDescription,
        leaf.subskillCode,
      ].filter(Boolean).join(' ').toLocaleLowerCase();
      if (search && !searchable.includes(search)) return;

      if (!skills.has(leaf.skillCode)) {
        skills.set(leaf.skillCode, {
          code: leaf.skillCode,
          name: leaf.skillName,
          description: leaf.skillDescription,
          strandCode: leaf.strandCode,
          strandName: leaf.strandName,
          leaves: [],
        });
      }
      skills.get(leaf.skillCode)?.leaves.push(leaf);
    });

    return [...skills.values()].sort((a, b) => (
      a.strandName.localeCompare(b.strandName) || a.name.localeCompare(b.name)
    ));
  }, [evidenceFilter, query, snapshot, strandCode]);

  const alignments = snapshot?.registry.frameworkAlignments || [];
  const contentAlignments = alignments.filter((item) => item.alignmentLevel === 'subject_content');
  const aoAlignments = alignments.filter((item) => item.alignmentLevel === 'assessment_objective');
  const experience = snapshot?.experience;
  const canLaunchEconomicsDiagnostic = Boolean(
    profile.school_id
    && selectedGroup
    && /economics/i.test(selectedGroup.subjectLabel)
    && snapshot?.registry.supported
    && (snapshot.paperReadiness?.profiledQuestionCount || 0) > 0
  );

  const toggleSkill = (code: string) => {
    setExpandedSkills((current) => (
      current.has(code)
        ? new Set([...current].filter((item) => item !== code))
        : new Set([...current, code])
    ));
  };

  if (loadingGroups) {
    return <div className="p-6 text-sm text-slate-500">Preparing Curriculum Intelligence…</div>;
  }

  return (
    <section className="mx-auto w-full max-w-[1500px] space-y-5 p-4 sm:p-6" aria-labelledby="curriculum-intelligence-title">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <button type="button" onClick={onBack} className="mb-3 text-sm font-semibold text-slate-500 hover:text-slate-900">← Teacher dashboard</button>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">{experience?.eyebrow || 'Curriculum Intelligence'}</span>
              {snapshot?.registry.registryVersion ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{snapshot.registry.registryVersion}</span> : null}
            </div>
            <h1 id="curriculum-intelligence-title" className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{experience?.headline || 'Know what is mapped, what has evidence, and what still needs assessment.'}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{experience?.intro || 'This workspace separates curriculum coverage from attainment.'} “Not assessed” means Brains Heist does not yet have enough governed evidence; it does not mean a student is weak.</p>
          </div>

          <div className="min-w-[280px] space-y-2">
            <label className="block rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Teaching group</span>
              <select
                value={selectedGroupId}
                onChange={(event) => {
                  const nextGroupId = event.target.value;
                  setSelectedGroupId(nextGroupId);
                  setDiagnosticLauncherOpen(false);
                  setQuery('');
                  setStrandCode('all');
                  setEvidenceFilter('all');
                  try {
                    window.localStorage.setItem(curriculumGroupStorageKey(profile.id), nextGroupId);
                  } catch {
                    // Selection still works if browser storage is unavailable.
                  }
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-500"
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.subjectLabel} · Grade {group.gradeNumber} · {group.name}
                  </option>
                ))}
              </select>
            </label>
            {canLaunchEconomicsDiagnostic ? (
              <button
                type="button"
                onClick={() => setDiagnosticLauncherOpen(true)}
                className="group w-full rounded-2xl bg-gradient-to-r from-slate-950 via-blue-950 to-cyan-950 px-4 py-3 text-left text-white shadow-lg shadow-cyan-950/10 transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                <span className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300">Governed assessment</span>
                    <strong className="mt-0.5 block text-sm">Create Economics Diagnostic</strong>
                  </span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-lg transition group-hover:bg-white/15" aria-hidden="true">→</span>
                </span>
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <strong className="block">Curriculum data is not ready yet.</strong>
          {error}
        </div>
      ) : null}

      {loadingSnapshot ? <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading governed curriculum and class evidence…</div> : null}

      {!loadingSnapshot && snapshot && !snapshot.registry.supported ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8">
          <h2 className="text-xl font-black text-slate-950">No governed registry for {selectedGroup?.subjectLabel}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">This subject can still be taught and assigned, but Curriculum Intelligence stays unavailable until Brains Heist publishes a canonical skill registry for this subject.</p>
        </div>
      ) : null}

      {!loadingSnapshot && snapshot?.registry.supported ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ['Students', snapshot.summary.studentCount, 'Current teaching-group roster'],
              ['Curriculum leaves', snapshot.summary.curriculumSubskills, 'Governed atomic subskills'],
              ['Evidence observed', pct(snapshot.summary.observedPairPercent), `${snapshot.summary.observedPairs} student-skill pairs`],
              ['Assessed evidence', pct(snapshot.summary.assessedPairPercent), `${snapshot.summary.assessedPairs} higher-readiness pairs`],
              ['Teacher review', snapshot.summary.teacherReviewPairs, 'Contradictory / review-required pairs'],
            ].map(([label, value, description]) => (
              <article key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
                <strong className="mt-1 block text-2xl font-black text-slate-950">{value}</strong>
                <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
              </article>
            ))}
          </div>

          <section className="space-y-4 rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-5 text-white shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Teaching radar</span>
                <h2 className="mt-1 text-2xl font-black">{experience?.radarTitle || 'What should I teach next?'}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{experience?.radarDescription || 'Brains Heist prioritises only governed longitudinal evidence.'} Resolved needs are celebrated rather than treated as current weakness.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-5 text-slate-300">
                <strong className="block text-white">Decision rule</strong>
                Targeted practice can support learning, but it does not prove mastery. A later independent assessment is still required.
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {([
                ['content', experience?.contentDimension.title || 'Subject knowledge', experience?.contentDimension.description || 'Core subject knowledge and methods.', snapshot.dimensions.content],
                ['reasoning', experience?.reasoningDimension.title || 'Application & reasoning', experience?.reasoningDimension.description || 'Applying knowledge, reasoning and communicating independently.', snapshot.dimensions.reasoning],
              ] as const).map(([key, title, description, dimension]) => (
                <article key={key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-300">{key === 'content' ? 'Dimension A' : 'Dimension B'}</span>
                      <h3 className="mt-1 text-lg font-black">{title}</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
                    </div>
                    <strong className="rounded-xl bg-white/10 px-3 py-2 text-xl">{dimension.hotspotCount}</strong>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div className="rounded-xl bg-black/20 p-2"><span className="block text-slate-400">Students</span><strong className="mt-1 block text-base">{dimension.impactedStudents}</strong></div>
                    <div className="rounded-xl bg-black/20 p-2"><span className="block text-slate-400">Persistent</span><strong className="mt-1 block text-base text-rose-300">{dimension.persistentStudents}</strong></div>
                    <div className="rounded-xl bg-black/20 p-2"><span className="block text-slate-400">Recurring</span><strong className="mt-1 block text-base text-amber-300">{dimension.recurringStudents}</strong></div>
                    <div className="rounded-xl bg-black/20 p-2"><span className="block text-slate-400">Improving</span><strong className="mt-1 block text-base text-emerald-300">{dimension.improvingStudents}</strong></div>
                  </div>
                </article>
              ))}
            </div>

            {snapshot.reteachNext.length ? (
              <div className="grid gap-3 xl:grid-cols-2">
                {snapshot.reteachNext.slice(0, 6).map((recommendation) => (
                  <article key={recommendation.subskillCode} className="rounded-2xl border border-white/10 bg-white p-4 text-slate-900 shadow-lg shadow-black/10">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">#{recommendation.rank} reteach next</span>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${reteachTone(recommendation.priority)}`}>{recommendation.priority}</span>
                          <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-800">{recommendation.dimension === 'reasoning' ? (experience?.reasoningDimension.title || 'Reasoning') : (experience?.contentDimension.title || 'Knowledge')}</span>
                        </div>
                        <h3 className="mt-3 text-lg font-black leading-tight text-slate-950">{recommendation.subskillName}</h3>
                        <p className="mt-1 text-xs text-slate-500">{recommendation.strandName} · {recommendation.skillName}</p>
                      </div>
                      <div className="text-right">
                        <strong className="block text-2xl font-black text-slate-950">{recommendation.impactedStudents}</strong>
                        <span className="text-[11px] text-slate-500">students</span>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Why now</span>
                      <p className="mt-1 text-xs leading-5 text-slate-700">{recommendation.whyNow}</p>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-600">{experience?.barrierLabel || 'Likely learning barrier to test'}</span>
                        <p className="mt-1 text-xs leading-5 text-slate-700">{recommendation.misconception}</p>
                      </div>
                      <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-700">{experience?.classroomMoveLabel || 'Classroom move'}</span>
                        <p className="mt-1 text-xs leading-5 text-slate-700">{recommendation.classroomMove}</p>
                      </div>
                    </div>

                    <div className="mt-3">
                      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{experience?.reteachLabel || 'Four-step reteach'}</span>
                      <ol className="mt-2 grid gap-2 text-xs leading-5 text-slate-700 sm:grid-cols-2">
                        {recommendation.teachSequence.map((step, index) => (
                          <li key={step} className="flex gap-2 rounded-xl border border-slate-100 p-2">
                            <strong className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[10px] text-white">{index + 1}</strong>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs leading-5 md:grid-cols-2">
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3"><strong className="block text-emerald-800">{experience?.reassessmentLabel || 'Reassess independently'}</strong><span className="mt-1 block text-slate-700">{recommendation.reassessment}</span></div>
                      <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3"><strong className="block text-violet-800">{experience?.assessmentLensLabel || 'Assessment lens'}</strong><span className="mt-1 block text-slate-700">{recommendation.examinerLens}</span></div>
                    </div>

                    <details className="mt-3 rounded-xl border border-slate-200">
                      <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-700">Affected students ({recommendation.affectedStudents.length})</summary>
                      <div className="flex flex-wrap gap-2 border-t border-slate-100 p-3">
                        {recommendation.affectedStudents.map((student) => (
                          <span key={student.studentId} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                            {student.studentName} · {studentStatusLabel(student.status)}
                          </span>
                        ))}
                      </div>
                    </details>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <strong className="text-base">{experience?.noHotspotTitle || 'No qualified class hotspot yet.'}</strong>
                <p className="mt-1 text-sm leading-6 text-slate-300">{experience?.noHotspotDescription || 'Current governed evidence does not yet justify a class-level teaching priority.'} Continue normal assessment and this radar will populate as qualified evidence accumulates.</p>
              </div>
            )}

            {snapshot.hotspots.some((hotspot) => hotspot.improvingStudents > 0 || hotspot.resolvedStudents > 0) ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Movement worth noticing</span>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {snapshot.hotspots
                    .filter((hotspot) => hotspot.improvingStudents > 0 || hotspot.resolvedStudents > 0)
                    .slice(0, 8)
                    .map((hotspot) => {
                      const leaf = snapshot.registry.skills.find((item) => item.subskillCode === hotspot.subskillCode);
                      return <span key={hotspot.subskillCode} className="rounded-full bg-white/10 px-3 py-1.5 text-slate-200">{leaf?.subskillName || hotspot.subskillCode} · {hotspot.improvingStudents} improving · {hotspot.resolvedStudents} resolved</span>;
                    })}
                </div>
              </div>
            ) : null}
          </section>

          {snapshot.paperReadiness ? (
            <section className="overflow-hidden rounded-3xl border border-blue-200 bg-white shadow-sm">
              <div className="bg-gradient-to-r from-blue-950 via-indigo-950 to-violet-950 p-5 text-white sm:p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div className="max-w-3xl">
                    <span className="text-xs font-black uppercase tracking-[0.18em] text-blue-300">Cambridge 0455 · 2027–2029</span>
                    <h2 className="mt-1 text-2xl font-black">Paper Readiness</h2>
                    <p className="mt-2 text-sm leading-6 text-blue-100/80">A governed view of the examination evidence this class has actually produced. Topic performance is never silently converted into AO or paper readiness.</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs leading-5 text-blue-100">
                      <strong className="block text-white">Evidence only · no predicted grade</strong>
                      Observed accuracy is classroom evidence from profiled Brains Heist Verified items. It is not an exam mark, forecast or grade boundary.
                    </div>
                    {canLaunchEconomicsDiagnostic ? (
                      <button
                        type="button"
                        onClick={() => setDiagnosticLauncherOpen(true)}
                        className="rounded-2xl border border-cyan-300/25 bg-cyan-300/15 px-4 py-3 text-left text-xs font-black text-cyan-50 transition hover:bg-cyan-300/20"
                      >
                        + Create independent Paper 1 diagnostic
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div><span className="text-[11px] font-black uppercase tracking-wide text-blue-300">Paper 1</span><h3 className="mt-1 text-lg font-black">Multiple Choice</h3></div>
                      <strong className="text-2xl">30%</strong>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-blue-100/75">1 hour · 40 questions · 40 marks · all subject content · AO1 + AO2 · calculations and diagram analysis may be required.</p>
                  </article>
                  <article className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div><span className="text-[11px] font-black uppercase tracking-wide text-violet-300">Paper 2</span><h3 className="mt-1 text-lg font-black">Structured Questions</h3></div>
                      <strong className="text-2xl">70%</strong>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-blue-100/75">2 hours · 80 marks · Section A compulsory data response (20) · Section B answer 3 of 4 questions (60) · AO1 + AO2 + AO3.</p>
                  </article>
                </div>
              </div>

              <div className="space-y-5 p-5 sm:p-6">
                <div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <span className="text-xs font-black uppercase tracking-[0.15em] text-blue-700">Evidence by exam demand</span>
                      <h3 className="mt-1 text-xl font-black text-slate-950">What has this class actually practised under governed evidence?</h3>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">{snapshot.paperReadiness.profiledQuestionCount} verified Economics item{snapshot.paperReadiness.profiledQuestionCount === 1 ? '' : 's'} profiled</span>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-3">
                    {[snapshot.paperReadiness.paper1, snapshot.paperReadiness.paper2SectionA, snapshot.paperReadiness.paper2SectionB].map((paper) => {
                      const state = paperEvidenceState(paper.state);
                      return (
                        <article key={paper.key} className="rounded-2xl border border-slate-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div><h4 className="font-black text-slate-950">{paper.title}</h4><p className="mt-1 text-xs leading-5 text-slate-500">{paper.subtitle}</p></div>
                            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${state.className}`}>{state.label}</span>
                          </div>
                          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-xl bg-slate-50 p-2"><dt className="text-slate-400">Students</dt><dd className="mt-1 text-base font-black text-slate-900">{paper.studentsWithEvidence}/{snapshot.paperReadiness.studentCount}</dd></div>
                            <div className="rounded-xl bg-slate-50 p-2"><dt className="text-slate-400">Verified questions</dt><dd className="mt-1 text-base font-black text-slate-900">{paper.distinctQuestions}</dd></div>
                            <div className="rounded-xl bg-slate-50 p-2"><dt className="text-slate-400">Assignments</dt><dd className="mt-1 text-base font-black text-slate-900">{paper.distinctAssignments}</dd></div>
                            <div className="rounded-xl bg-slate-50 p-2"><dt className="text-slate-400">Responses</dt><dd className="mt-1 text-base font-black text-slate-900">{paper.gradedResponses}</dd></div>
                          </dl>
                          <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                            <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Observed classroom accuracy</span>
                            <strong className="mt-1 block text-xl font-black text-slate-950">{paper.observedAccuracy == null ? '—' : pct(paper.observedAccuracy)}</strong>
                            <p className="mt-1 text-[11px] leading-4 text-slate-500">{paper.state === 'evidence_established' ? 'Enough evidence for a class reporting signal under the current policy.' : 'Do not interpret this as a stable readiness signal yet.'}</p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <article className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><span className="text-xs font-black uppercase tracking-[0.14em] text-violet-700">Assessment objectives</span><h3 className="mt-1 text-lg font-black text-slate-950">Official weighting vs evidence collected</h3></div>
                      <span className="rounded-full bg-violet-50 px-3 py-1 text-[11px] font-bold text-violet-800">AO evidence is question-profiled, never inferred from topic alone</span>
                    </div>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[680px] text-left text-xs">
                        <thead><tr className="border-b border-slate-200 text-slate-400"><th className="pb-2">AO</th><th className="pb-2">Qualification</th><th className="pb-2">Paper 1</th><th className="pb-2">Paper 2</th><th className="pb-2">Evidence responses</th><th className="pb-2">Questions</th><th className="pb-2">Observed accuracy</th></tr></thead>
                        <tbody>
                          {snapshot.paperReadiness.assessmentObjectives.map((ao) => (
                            <tr key={ao.code} className="border-b border-slate-100 last:border-0">
                              <td className="py-3"><strong className="text-slate-900">{ao.code}</strong><span className="ml-2 text-slate-500">{ao.name}</span></td>
                              <td className="py-3 font-bold text-slate-700">{ao.officialQualificationWeight}%</td>
                              <td className="py-3 text-slate-600">{ao.paper1Weight}%</td>
                              <td className="py-3 text-slate-600">{ao.paper2Weight}%</td>
                              <td className="py-3 font-bold text-slate-900">{ao.gradedResponses}</td>
                              <td className="py-3 text-slate-700">{ao.distinctQuestions}</td>
                              <td className="py-3 font-bold text-slate-900">{ao.observedAccuracy == null ? '—' : pct(ao.observedAccuracy)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>

                  <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <span className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">Evidence gaps</span>
                    <h3 className="mt-1 text-lg font-black text-amber-950">What should we assess next?</h3>
                    {snapshot.paperReadiness.evidenceGaps.length ? (
                      <ul className="mt-3 space-y-2 text-xs leading-5 text-amber-900">
                        {snapshot.paperReadiness.evidenceGaps.slice(0, 7).map((gap) => <li key={gap} className="rounded-xl border border-amber-200 bg-white/70 p-2.5">{gap}</li>)}
                      </ul>
                    ) : (
                      <p className="mt-3 text-xs leading-5 text-amber-900">No major evidence-format gap is currently visible. Continue broad independent assessment rather than over-practising one paper pattern.</p>
                    )}
                    <div className="mt-3 border-t border-amber-200 pt-3 text-[11px] leading-5 text-amber-800">
                      Reporting policy: at least {snapshot.paperReadiness.reportingPolicy.minimumDistinctQuestions} distinct verified questions, {snapshot.paperReadiness.reportingPolicy.minimumDistinctAssignments} assignments and sufficient roster participation before a paper-format signal is called established.
                    </div>
                  </aside>
                </div>

                {snapshot.paperReadiness.profiledQuestionCount === 0 ? (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                    <strong className="block">The readiness framework is live; the verified Economics assessment bank is the next dependency.</strong>
                    Production currently has no Brains Heist Verified Economics questions with Cambridge 0455 paper/AO profiles. Until those are governed and assigned, this view correctly remains unassessed rather than manufacturing a readiness score.
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-4">
              <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-700">Programme alignment</span>
                    <h2 className="mt-1 text-xl font-black text-slate-950">{snapshot.registry.cambridgeProgrammes?.[0]?.name || selectedGroup?.subjectLabel}</h2>
                    <p className="mt-1 text-sm text-slate-500">{humanizePhase(snapshot.registry.phase)} · {alignments[0]?.sourceVersion || 'Version not supplied'} · external framework metadata</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    {aoAlignments.map((item) => <span key={item.externalReferenceCode || item.externalStrand} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-violet-800">{item.externalReferenceCode?.replace('CIE0455-', '') || item.externalStrand}</span>)}
                  </div>
                </div>
                {contentAlignments.length ? (
                  <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {contentAlignments.map((item) => (
                      <div key={item.externalReferenceCode || item.externalStrand} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{item.externalReferenceCode}</span>
                        <strong className="mt-1 block text-sm text-slate-800">{item.externalStrand}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>

              <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-3">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-700">Curriculum navigator</span>
                    <h2 className="mt-1 text-xl font-black text-slate-950">{experience?.navigatorTitle || 'Curriculum map'}</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{experience?.navigatorDescription || 'Strand → skill → subskill'}</p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_190px]">
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={experience?.searchPlaceholder || 'Search concepts, skills or codes…'} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-cyan-500" />
                    <select value={strandCode} onChange={(event) => setStrandCode(event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700">
                      <option value="all">All strands</option>
                      {strands.map((strand) => <option key={strand.code} value={strand.code}>{strand.name}</option>)}
                    </select>
                    <select value={evidenceFilter} onChange={(event) => setEvidenceFilter(event.target.value as EvidenceFilter)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700">
                      <option value="all">All evidence states</option>
                      <option value="assessed">Assessed evidence</option>
                      <option value="low_data">Low-data evidence</option>
                      <option value="review">Needs review</option>
                      <option value="not_assessed">Not assessed</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  {groupedSkills.map((skill) => {
                    const expanded = expandedSkills.has(skill.code);
                    return (
                      <div key={skill.code} className="overflow-hidden rounded-2xl border border-slate-200">
                        <button type="button" onClick={() => toggleSkill(skill.code)} className="flex w-full items-start justify-between gap-4 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100">
                          <div>
                            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{skill.strandName}</span>
                            <strong className="mt-0.5 block text-sm text-slate-900">{skill.name}</strong>
                            {skill.description ? <p className="mt-1 text-xs leading-5 text-slate-500">{skill.description}</p> : null}
                          </div>
                          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-500">{skill.leaves.length} {expanded ? '−' : '+'}</span>
                        </button>
                        {expanded ? (
                          <div className="divide-y divide-slate-100">
                            {skill.leaves.map((leaf) => {
                              const evidence = snapshot.evidenceBySubskill[leaf.subskillCode];
                              const badge = evidenceLabel(evidence, snapshot.summary.studentCount);
                              return (
                                <button key={leaf.subskillCode} type="button" onClick={() => setSelectedLeaf(leaf)} className="grid w-full gap-3 px-4 py-3 text-left hover:bg-cyan-50/40 md:grid-cols-[minmax(0,1fr)_180px_150px] md:items-center">
                                  <div>
                                    <strong className="block text-sm text-slate-800">{leaf.subskillName}</strong>
                                    <span className="mt-0.5 block font-mono text-[11px] text-slate-400">{leaf.subskillCode}</span>
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    <strong className="text-slate-700">{evidence?.studentsWithEvidence || 0}/{snapshot.summary.studentCount}</strong> students with evidence
                                  </div>
                                  <span className={`w-fit rounded-full border px-2.5 py-1 text-[11px] font-bold ${toneClasses[badge.tone]}`}>{badge.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {!groupedSkills.length ? <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No curriculum items match these filters.</div> : null}
                </div>
              </article>
            </div>

            <aside className="space-y-4">
              <article className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-300">Evidence health</span>
                <h2 className="mt-1 text-lg font-black">Class evidence readiness</h2>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-4"><span className="text-slate-300">Observed curriculum pairs</span><strong>{pct(snapshot.summary.observedPairPercent)}</strong></div>
                  <div className="flex justify-between gap-4"><span className="text-slate-300">Assessed evidence pairs</span><strong>{pct(snapshot.summary.assessedPairPercent)}</strong></div>
                  <div className="flex justify-between gap-4"><span className="text-slate-300">Average evidence confidence</span><strong>{pct(snapshot.summary.averageConfidence)}</strong></div>
                  <div className="flex justify-between gap-4"><span className="text-slate-300">Low-data pairs</span><strong>{snapshot.summary.lowDataPairs}</strong></div>
                  <div className="flex justify-between gap-4"><span className="text-slate-300">Contradictory pairs</span><strong>{snapshot.summary.contradictoryPairs}</strong></div>
                </div>
                <p className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs leading-5 text-slate-300">These are evidence-quality signals, not attainment scores. Brains Heist will not call an unassessed curriculum area a weakness.</p>
              </article>

              <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-700">Selected {experience?.subjectName || 'curriculum'} subskill</span>
                {selectedLeaf ? (
                  <>
                    <h3 className="mt-2 text-lg font-black text-slate-950">{selectedLeaf.subskillName}</h3>
                    <p className="mt-1 font-mono text-[11px] text-slate-400">{selectedLeaf.subskillCode}</p>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{selectedLeaf.subskillDescription}</p>
                    {(() => {
                      const evidence = snapshot.evidenceBySubskill[selectedLeaf.subskillCode];
                      return (
                        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                          <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Evidence</dt><dd className="mt-1 font-black text-slate-900">{evidence?.studentsWithEvidence || 0}/{snapshot.summary.studentCount}</dd></div>
                          <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Assessed</dt><dd className="mt-1 font-black text-slate-900">{evidence?.assessedStudents || 0}</dd></div>
                          <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Low data</dt><dd className="mt-1 font-black text-slate-900">{evidence?.lowDataStudents || 0}</dd></div>
                          <div className="rounded-xl bg-slate-50 p-3"><dt className="text-slate-500">Review</dt><dd className="mt-1 font-black text-slate-900">{evidence?.teacherReviewStudents || 0}</dd></div>
                        </dl>
                      );
                    })()}
                    <div className="mt-5 border-t border-slate-100 pt-4">
                      <div className="flex items-center justify-between"><strong className="text-sm text-slate-900">Evidence Focus catalogue</strong><span className="text-xs text-slate-400">{focusLoading ? 'Loading…' : focuses.length}</span></div>
                      <div className="mt-2 space-y-2">
                        {focuses.map((focus) => <div key={focus.code} className="rounded-xl border border-slate-200 p-3"><strong className="block text-xs text-slate-800">{focus.name}</strong><p className="mt-1 text-xs leading-5 text-slate-500">{focus.description}</p></div>)}
                        {!focusLoading && !focuses.length ? <p className="text-xs leading-5 text-slate-500">No active Evidence Focus was returned for this subskill.</p> : null}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-slate-500">{experience?.selectedLeafPrompt || 'Select a curriculum subskill to inspect its evidence readiness and governed Evidence Focus catalogue.'}</p>
                )}
              </article>

              {snapshot.summary.profilesUnavailable > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">{snapshot.summary.profilesUnavailable} student evidence profile{snapshot.summary.profilesUnavailable === 1 ? ' was' : 's were'} unavailable for this snapshot. The navigator did not treat those missing records as low performance.</div>
              ) : null}
            </aside>
          </section>
        </>
      ) : null}

      {profile.school_id && selectedGroup ? (
        <EconomicsDiagnosticLauncher
          open={diagnosticLauncherOpen}
          schoolId={profile.school_id}
          groupId={selectedGroup.id}
          groupName={selectedGroup.name}
          onClose={() => setDiagnosticLauncherOpen(false)}
        />
      ) : null}
    </section>
  );
};

export default TeacherCurriculumIntelligencePage;
