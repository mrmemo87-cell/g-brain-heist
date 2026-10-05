import React, { useEffect, useMemo, useState } from 'react';
import type { Profile } from '../../types';
import * as GameService from '../../services/gameService';
import { ProfileIcon, ProfileSection, ProfileStat } from '../student-progress/AcademicProfilePremium';
import '../student-progress/AcademicProfilePremium.css';
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
  onCreateDiagnostic?: (groupId: string) => void;
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
  if (evidence.teacherReviewStudents > 0 || evidence.contradictoryStudents > 0) return { label: 'Needs review', tone: 'amber' };
  if (evidence.assessedStudents > 0) return { label: 'Decision-ready', tone: 'emerald' };
  if (evidence.lowDataStudents > 0) return { label: 'Building evidence', tone: 'violet' };
  if (evidence.staleStudents > 0) return { label: 'Evidence is outdated', tone: 'orange' };
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
  onCreateDiagnostic,
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
  const [curriculumExplorerOpen, setCurriculumExplorerOpen] = useState(false);

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
        console.warn('Curriculum skill detail unavailable', focusError);
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

  const strandSummaries = useMemo(() => {
    if (!snapshot) return [];
    const summaries = new Map<string, {
      code: string;
      name: string;
      leafCount: number;
      leavesWithEvidence: number;
      decisionReadyLeaves: number;
      reviewLeaves: number;
    }>();
    snapshot.registry.skills.forEach((leaf) => {
      const current = summaries.get(leaf.strandCode) || {
        code: leaf.strandCode,
        name: leaf.strandName,
        leafCount: 0,
        leavesWithEvidence: 0,
        decisionReadyLeaves: 0,
        reviewLeaves: 0,
      };
      const evidence = snapshot.evidenceBySubskill[leaf.subskillCode];
      current.leafCount += 1;
      if ((evidence?.studentsWithEvidence || 0) > 0) current.leavesWithEvidence += 1;
      if ((evidence?.assessedStudents || 0) > 0) current.decisionReadyLeaves += 1;
      if ((evidence?.teacherReviewStudents || 0) > 0 || (evidence?.contradictoryStudents || 0) > 0) current.reviewLeaves += 1;
      summaries.set(leaf.strandCode, current);
    });
    return [...summaries.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [snapshot]);

  const skillsToCheckNext = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.registry.skills
      .map((leaf) => ({ leaf, evidence: snapshot.evidenceBySubskill[leaf.subskillCode] }))
      .filter(({ evidence }) => Boolean(
        evidence
        && evidence.lowDataStudents > 0
        && evidence.assessedStudents === 0
        && evidence.teacherReviewStudents === 0
        && evidence.contradictoryStudents === 0
      ))
      .sort((a, b) => (
        (b.evidence?.lowDataStudents || 0) - (a.evidence?.lowDataStudents || 0)
        || (b.evidence?.studentsWithEvidence || 0) - (a.evidence?.studentsWithEvidence || 0)
        || (b.evidence?.averageConfidence || 0) - (a.evidence?.averageConfidence || 0)
        || a.leaf.subskillName.localeCompare(b.leaf.subskillName)
      ))
      .slice(0, 6);
  }, [snapshot]);

  const classSnapshot = useMemo(() => {
    if (!snapshot) return null;
    if (snapshot.summary.studentCount === 0) {
      return {
        title: 'No students are currently in this teaching group.',
        body: 'Curriculum Intelligence will begin building a class picture when students are added and complete governed work.',
        next: 'Check the teaching-group roster before planning from this page.',
      };
    }
    if (snapshot.reteachNext.length > 0) {
      const first = snapshot.reteachNext[0];
      return {
        title: `${snapshot.reteachNext.length} confirmed teaching priorit${snapshot.reteachNext.length === 1 ? 'y' : 'ies'}.`,
        body: `The strongest current class pattern is “${first.subskillName}”, affecting ${first.impactedStudents} student${first.impactedStudents === 1 ? '' : 's'}.`,
        next: 'Use the priority cards below to plan a targeted response, then reassess independently.',
      };
    }
    if (snapshot.summary.observedPairs === 0) {
      return {
        title: 'No class evidence has been recorded yet.',
        body: 'There is no class-wide teaching priority yet because Brains Heist has not observed enough curriculum evidence for this class.',
        next: 'Continue normal teaching and assessment. This view will populate automatically.',
      };
    }
    if (snapshot.summary.assessedPairs === 0) {
      return {
        title: 'Evidence is building, but no class-wide priority is confirmed yet.',
        body: `Brains Heist has early evidence across ${snapshot.summary.observedPairs} student-skill area${snapshot.summary.observedPairs === 1 ? '' : 's'}, but it is not yet strong enough for a longitudinal teaching decision.`,
        next: 'Sample the suggested skills again in a later independent assessment before treating them as persistent needs.',
      };
    }
    return {
      title: 'No shared class-wide need is confirmed right now.',
      body: `${snapshot.summary.assessedPairs} student-skill area${snapshot.summary.assessedPairs === 1 ? ' is' : 's are'} decision-ready, but the current evidence does not form a qualified shared class pattern.`,
      next: 'Continue normal assessment and watch the early-evidence list for areas worth checking again.',
    };
  }, [snapshot]);

  const alignments = snapshot?.registry.frameworkAlignments || [];
  const contentAlignments = alignments.filter((item) => item.alignmentLevel === 'subject_content');
  const aoAlignments = alignments.filter((item) => item.alignmentLevel === 'assessment_objective');
  const experience = snapshot?.experience;
  const canPrepareDiagnostic = Boolean(
    profile.school_id
    && selectedGroup
    && onCreateDiagnostic
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
    <section className="sap-premium mx-auto w-full space-y-4" style={{ maxWidth: 1500 }} aria-labelledby="curriculum-intelligence-title">
      <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 max-w-3xl">
            <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900">
              <ProfileIcon name="back" /> Teacher dashboard
            </button>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-blue-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">Curriculum Intelligence</span>
              {snapshot?.registry.phase ? <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{humanizePhase(snapshot.registry.phase)}</span> : null}
            </div>
            <h1 id="curriculum-intelligence-title" className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              {selectedGroup ? `${selectedGroup.subjectLabel} · Grade ${selectedGroup.gradeNumber} · ${selectedGroup.name}` : 'Curriculum Intelligence'}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{experience?.headline || 'See what the class is ready for, where patterns are emerging, and what to check next.'}</p>
          </div>

          <div className="min-w-[300px] space-y-2">
            <label className="block rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="mb-1 block text-xs font-bold text-slate-600">Teaching group</span>
              <select
                value={selectedGroupId}
                onChange={(event) => {
                  const nextGroupId = event.target.value;
                  setSelectedGroupId(nextGroupId);
                  setQuery('');
                  setStrandCode('all');
                  setEvidenceFilter('all');
                  setCurriculumExplorerOpen(false);
                  try {
                    window.localStorage.setItem(curriculumGroupStorageKey(profile.id), nextGroupId);
                  } catch {
                    // Selection still works if browser storage is unavailable.
                  }
                }}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500"
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.subjectLabel} · Grade {group.gradeNumber} · {group.name}
                  </option>
                ))}
              </select>
            </label>
            {canPrepareDiagnostic && selectedGroup ? (
              <button
                type="button"
                onClick={() => onCreateDiagnostic?.(selectedGroup.id)}
                className="w-full rounded-lg bg-slate-950 px-4 py-3 text-left text-white transition hover:bg-slate-800"
              >
                <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">Governed assessment</span>
                <strong className="mt-0.5 block text-sm">Create Diagnostic →</strong>
                <span className="mt-1 block text-[11px] leading-4 text-slate-300">Brain Heist will check this group’s verified question pool first.</span>
              </button>
            ) : snapshot?.registry.supported ? (
              <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-500">
                <strong className="block text-slate-800">{experience?.subjectName || selectedGroup?.subjectLabel} evidence updates automatically</strong>
                from completed governed assignments and assessments.
              </p>
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
          <div className="ap-overview">
            <ProfileStat
              label="Students"
              icon="support"
              value={snapshot.summary.studentCount}
              detail="Current teaching-group roster"
            />
            <ProfileStat
              label="Evidence coverage"
              icon="document"
              value={pct(snapshot.summary.observedPairPercent)}
              detail={`${snapshot.summary.observedPairs} student-skill areas have evidence`}
            />
            <ProfileStat
              label="Ready for decisions"
              icon="target"
              tone={snapshot.summary.assessedPairs > 0 ? 'neutral' : 'blue'}
              value={snapshot.summary.assessedPairs}
              detail="Student-skill areas with decision-ready evidence"
            />
            <ProfileStat
              label="Needs review"
              icon="info"
              tone={snapshot.summary.teacherReviewPairs > 0 ? 'amber' : 'neutral'}
              value={snapshot.summary.teacherReviewPairs}
              detail="Evidence conflicts or teacher review required"
            />
          </div>

          {classSnapshot ? (
            <section className="ap-snapshot" aria-label="Class snapshot">
              <span className="ap-icon-disc"><ProfileIcon name="document" /></span>
              <h2>Class snapshot</h2>
              <div>
                <p><strong>{classSnapshot.title}</strong> {classSnapshot.body}</p>
                <p><strong>Next step:</strong> {classSnapshot.next}</p>
              </div>
            </section>
          ) : null}

          <ProfileSection
            title="What needs attention?"
            icon="target"
            subtitle="Only repeated, governed evidence becomes a class teaching priority."
          >
            {snapshot.reteachNext.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {snapshot.reteachNext.slice(0, 6).map((recommendation) => (
                  <article key={recommendation.subskillCode} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-slate-950 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">#{recommendation.rank} priority</span>
                          <span className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${reteachTone(recommendation.priority)}`}>{recommendation.priority}</span>
                          <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-800">{recommendation.dimension === 'reasoning' ? (experience?.reasoningDimension.title || 'Application & reasoning') : (experience?.contentDimension.title || 'Subject knowledge')}</span>
                        </div>
                        <h3 className="mt-3 text-base font-bold text-slate-950">{recommendation.subskillName}</h3>
                        <p className="mt-1 text-xs text-slate-500">{recommendation.strandName} · {recommendation.skillName}</p>
                      </div>
                      <div className="text-right">
                        <strong className="block text-2xl font-bold text-slate-950">{recommendation.impactedStudents}</strong>
                        <span className="text-[11px] text-slate-500">students affected</span>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg bg-slate-50 p-3">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Why this is showing</span>
                        <p className="mt-1 text-xs leading-5 text-slate-700">{recommendation.whyNow}</p>
                      </div>
                      <div className="rounded-lg bg-blue-50 p-3">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-blue-700">Suggested classroom move</span>
                        <p className="mt-1 text-xs leading-5 text-slate-700">{recommendation.classroomMove}</p>
                      </div>
                    </div>

                    <p className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs leading-5 text-slate-700">
                      <strong className="text-emerald-800">Reassess independently:</strong> {recommendation.reassessment}
                    </p>

                    <details className="mt-3 rounded-lg border border-slate-200">
                      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">Teaching plan and affected students</summary>
                      <div className="space-y-3 border-t border-slate-100 p-3">
                        <ol className="grid gap-2 text-xs leading-5 text-slate-700 sm:grid-cols-2">
                          {recommendation.teachSequence.map((step, index) => (
                            <li key={step} className="flex gap-2 rounded-md bg-slate-50 p-2">
                              <strong className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white">{index + 1}</strong>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                        <div className="flex flex-wrap gap-2">
                          {recommendation.affectedStudents.map((student) => (
                            <span key={student.studentId} className="ap-evidence-chip ap-evidence-chip--followup">{student.studentName} · {studentStatusLabel(student.status)}</span>
                          ))}
                        </div>
                      </div>
                    </details>
                  </article>
                ))}
              </div>
            ) : (
              <div className="ap-support-empty">
                <span className="ap-icon-disc"><ProfileIcon name="target" /></span>
                <strong>No confirmed class pattern yet</strong>
                <p>There may still be individual learning needs, but the current evidence is not strong enough to recommend a class-wide focus. Keep assessing normally; repeated patterns will appear here automatically.</p>
              </div>
            )}
          </ProfileSection>

          <ProfileSection
            title="Class learning picture"
            icon="trend"
            subtitle="Confirmed patterns by broad learning area. Early evidence is kept separate."
          >
            <div className="grid gap-3 md:grid-cols-2">
              {([
                ['content', experience?.contentDimension.title || 'Subject knowledge', experience?.contentDimension.description || 'Core subject knowledge and methods.', snapshot.dimensions.content],
                ['reasoning', experience?.reasoningDimension.title || 'Application & reasoning', experience?.reasoningDimension.description || 'Applying knowledge, reasoning and communicating independently.', snapshot.dimensions.reasoning],
              ] as const).map(([key, title, description, dimension]) => (
                <article key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-bold text-slate-950">{title}</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
                  {dimension.hotspotCount > 0 ? (
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div><span className="block text-[11px] text-slate-500">Students needing action</span><strong className="mt-1 block text-lg text-slate-950">{dimension.impactedStudents}</strong></div>
                      <div><span className="block text-[11px] text-slate-500">Persistent</span><strong className="mt-1 block text-lg text-rose-700">{dimension.persistentStudents}</strong></div>
                      <div><span className="block text-[11px] text-slate-500">Recurring</span><strong className="mt-1 block text-lg text-amber-700">{dimension.recurringStudents}</strong></div>
                      <div><span className="block text-[11px] text-slate-500">Improving</span><strong className="mt-1 block text-lg text-emerald-700">{dimension.improvingStudents}</strong></div>
                    </div>
                  ) : (
                    <p className="mt-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">No confirmed class-wide need in this area yet.</p>
                  )}
                </article>
              ))}
            </div>
          </ProfileSection>

          <ProfileSection
            title="Skills to check next"
            icon="document"
            subtitle="Early evidence worth sampling again before making a class-wide teaching decision."
          >
            {skillsToCheckNext.length ? (
              <div className="divide-y divide-slate-100">
                {skillsToCheckNext.map(({ leaf, evidence }) => (
                  <div key={leaf.subskillCode} className="grid gap-3 py-3 first:pt-1 md:grid-cols-[minmax(0,1fr)_180px_120px] md:items-center">
                    <div>
                      <strong className="block text-sm text-slate-900">{leaf.subskillName}</strong>
                      <span className="mt-0.5 block text-xs text-slate-500">{leaf.strandName} · {leaf.skillName}</span>
                    </div>
                    <div className="text-xs text-slate-600">
                      <strong className="text-slate-900">{evidence?.lowDataStudents || 0}/{snapshot.summary.studentCount}</strong> students with early evidence
                    </div>
                    <span className="ap-evidence-chip ap-evidence-chip--developing">Check again</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ap-empty">No early evidence is currently waiting for confirmation.</p>
            )}
          </ProfileSection>

          {snapshot.hotspots.some((hotspot) => hotspot.improvingStudents > 0 || hotspot.resolvedStudents > 0) ? (
            <p className="ap-notice">
              <ProfileIcon name="strength" />
              <span><strong>Progress worth noticing:</strong> some previously identified needs are improving or resolved. They remain visible in the evidence record without being treated as current weaknesses.</span>
            </p>
          ) : null}
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
                    {canPrepareDiagnostic && selectedGroup ? (
                      <button
                        type="button"
                        onClick={() => onCreateDiagnostic?.(selectedGroup.id)}
                        className="rounded-2xl border border-cyan-300/25 bg-cyan-300/15 px-4 py-3 text-left text-xs font-black text-cyan-50 transition hover:bg-cyan-300/20"
                      >
                        + Prepare governed diagnostic
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

          <ProfileSection
            title="Curriculum overview"
            icon="book"
            subtitle={`${snapshot.summary.curriculumSubskills} curriculum skills tracked for this phase. Open an area to explore the detailed map.`}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {strandSummaries.map((strand) => (
                <button
                  key={strand.code}
                  type="button"
                  onClick={() => {
                    setStrandCode(strand.code);
                    setEvidenceFilter('all');
                    setQuery('');
                    setCurriculumExplorerOpen(true);
                  }}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <strong className="text-sm text-slate-950">{strand.name}</strong>
                    <span className="rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">{strand.leafCount} skills</span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-600">
                    {strand.leavesWithEvidence} with evidence · {strand.decisionReadyLeaves} decision-ready
                    {strand.reviewLeaves ? ` · ${strand.reviewLeaves} need review` : ''}
                  </p>
                </button>
              ))}
            </div>
            <div className="mt-4 border-t border-slate-100 pt-3">
              <button type="button" onClick={() => setCurriculumExplorerOpen((open) => !open)} className="ap-button">
                <ProfileIcon name="book" /> {curriculumExplorerOpen ? 'Hide full curriculum' : 'Explore full curriculum'}
              </button>
            </div>
          </ProfileSection>

          {curriculumExplorerOpen ? (
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]" aria-label="Full curriculum explorer">
              <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex flex-col gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-950">{experience?.navigatorTitle || 'Curriculum map'}</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Search and inspect the full curriculum only when you need the detail.</p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_190px]">
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={experience?.searchPlaceholder || 'Search skills…'} className="rounded-md border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
                    <select value={strandCode} onChange={(event) => setStrandCode(event.target.value)} className="rounded-md border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700">
                      <option value="all">All curriculum areas</option>
                      {strands.map((strand) => <option key={strand.code} value={strand.code}>{strand.name}</option>)}
                    </select>
                    <select value={evidenceFilter} onChange={(event) => setEvidenceFilter(event.target.value as EvidenceFilter)} className="rounded-md border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700">
                      <option value="all">All evidence states</option>
                      <option value="assessed">Decision-ready</option>
                      <option value="low_data">Building evidence</option>
                      <option value="review">Needs review</option>
                      <option value="not_assessed">Not assessed</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  {groupedSkills.map((skill) => {
                    const expanded = expandedSkills.has(skill.code);
                    return (
                      <div key={skill.code} className="overflow-hidden rounded-lg border border-slate-200">
                        <button type="button" onClick={() => toggleSkill(skill.code)} className="flex w-full items-start justify-between gap-4 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100">
                          <div>
                            <span className="text-[11px] font-semibold text-slate-500">{skill.strandName}</span>
                            <strong className="mt-0.5 block text-sm text-slate-900">{skill.name}</strong>
                            {skill.description ? <p className="mt-1 text-xs leading-5 text-slate-500">{skill.description}</p> : null}
                          </div>
                          <span className="shrink-0 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">{skill.leaves.length} {expanded ? '−' : '+'}</span>
                        </button>
                        {expanded ? (
                          <div className="divide-y divide-slate-100">
                            {skill.leaves.map((leaf) => {
                              const evidence = snapshot.evidenceBySubskill[leaf.subskillCode];
                              const badge = evidenceLabel(evidence, snapshot.summary.studentCount);
                              return (
                                <button key={leaf.subskillCode} type="button" onClick={() => setSelectedLeaf(leaf)} className="grid w-full gap-3 px-4 py-3 text-left hover:bg-blue-50/40 md:grid-cols-[minmax(0,1fr)_180px_140px] md:items-center">
                                  <div>
                                    <strong className="block text-sm text-slate-800">{leaf.subskillName}</strong>
                                    <span className="mt-0.5 block text-xs text-slate-500">{leaf.strandName} · {leaf.skillName}</span>
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    <strong className="text-slate-700">{evidence?.studentsWithEvidence || 0}/{snapshot.summary.studentCount}</strong> students with evidence
                                  </div>
                                  <span className={`w-fit rounded-md border px-2.5 py-1 text-[11px] font-semibold ${toneClasses[badge.tone]}`}>{badge.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {!groupedSkills.length ? <p className="ap-empty">No curriculum items match these filters.</p> : null}
                </div>
              </article>

              <aside className="space-y-4">
                <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <span className="text-xs font-semibold text-blue-700">Selected skill</span>
                  {selectedLeaf ? (
                    <>
                      <h3 className="mt-2 text-base font-bold text-slate-950">{selectedLeaf.subskillName}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{selectedLeaf.subskillDescription}</p>
                      {(() => {
                        const evidence = snapshot.evidenceBySubskill[selectedLeaf.subskillCode];
                        return (
                          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-md bg-slate-50 p-3"><dt className="text-slate-500">Students with evidence</dt><dd className="mt-1 font-bold text-slate-900">{evidence?.studentsWithEvidence || 0}/{snapshot.summary.studentCount}</dd></div>
                            <div className="rounded-md bg-slate-50 p-3"><dt className="text-slate-500">Decision-ready</dt><dd className="mt-1 font-bold text-slate-900">{evidence?.assessedStudents || 0}</dd></div>
                            <div className="rounded-md bg-slate-50 p-3"><dt className="text-slate-500">Building evidence</dt><dd className="mt-1 font-bold text-slate-900">{evidence?.lowDataStudents || 0}</dd></div>
                            <div className="rounded-md bg-slate-50 p-3"><dt className="text-slate-500">Needs review</dt><dd className="mt-1 font-bold text-slate-900">{evidence?.teacherReviewStudents || 0}</dd></div>
                          </dl>
                        );
                      })()}
                      <details className="mt-4 rounded-lg border border-slate-200">
                        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">What this skill measures</summary>
                        <div className="space-y-2 border-t border-slate-100 p-3">
                          <p className="text-[11px] text-slate-400">Registry code: {selectedLeaf.subskillCode}</p>
                          {focuses.map((focus) => <div key={focus.code} className="rounded-md bg-slate-50 p-3"><strong className="block text-xs text-slate-800">{focus.name}</strong><p className="mt-1 text-xs leading-5 text-slate-500">{focus.description}</p></div>)}
                          {focusLoading ? <p className="text-xs text-slate-500">Loading skill detail…</p> : null}
                          {!focusLoading && !focuses.length ? <p className="text-xs leading-5 text-slate-500">No additional governed skill detail is available.</p> : null}
                        </div>
                      </details>
                    </>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-slate-500">{experience?.selectedLeafPrompt || 'Select a curriculum skill to inspect its evidence.'}</p>
                  )}
                </article>
              </aside>
            </section>
          ) : null}

          <details className="ap-section">
            <summary className="ap-method-summary">
              <span className="ap-method-title">
                <h2>About this evidence</h2>
                <p>Framework alignment, evidence readiness and technical interpretation.</p>
              </span>
              <span className="ap-method-controls"><span className="when-closed">Open</span><span className="when-open">Close</span></span>
            </summary>
            <div className="ap-method-body space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-3"><span className="text-xs text-slate-500">Evidence coverage</span><strong className="mt-1 block text-lg text-slate-950">{pct(snapshot.summary.observedPairPercent)}</strong><p className="mt-1 text-xs text-slate-500">{snapshot.summary.observedPairs} observed student-skill areas</p></div>
                <div className="rounded-lg bg-slate-50 p-3"><span className="text-xs text-slate-500">Decision-ready evidence</span><strong className="mt-1 block text-lg text-slate-950">{pct(snapshot.summary.assessedPairPercent)}</strong><p className="mt-1 text-xs text-slate-500">{snapshot.summary.assessedPairs} student-skill areas</p></div>
                <div className="rounded-lg bg-slate-50 p-3"><span className="text-xs text-slate-500">Evidence confidence</span><strong className="mt-1 block text-lg text-slate-950">{pct(snapshot.summary.averageConfidence)}</strong><p className="mt-1 text-xs text-slate-500">Quality/readiness signal, not attainment</p></div>
              </div>

              <p className="ap-notice"><ProfileIcon name="info" /> These are evidence-quality signals, not attainment scores. “Not assessed” or “building evidence” never means a student is weak.</p>
              <p className="ap-notice"><ProfileIcon name="shield" /> Suggested teaching actions support learning; they do not prove mastery. Confirm improvement with a later independent assessment.</p>

              <div className="rounded-lg border border-slate-200 p-4">
                <span className="text-xs font-semibold text-blue-700">Programme & curriculum alignment</span>
                <h3 className="mt-1 text-base font-bold text-slate-950">{snapshot.registry.cambridgeProgrammes?.[0]?.name || `${experience?.subjectName || selectedGroup?.subjectLabel} curriculum`}</h3>
                <p className="mt-1 text-xs text-slate-500">{humanizePhase(snapshot.registry.phase)} · {alignments[0]?.sourceVersion || 'Version not supplied'} · external framework metadata</p>
                {contentAlignments.length || aoAlignments.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[...contentAlignments, ...aoAlignments].map((item) => (
                      <span key={item.externalReferenceCode || item.externalStrand} className="ap-evidence-chip">{item.externalReferenceCode || item.externalStrand}</span>
                    ))}
                  </div>
                ) : null}
              </div>

              <dl className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md bg-slate-50 p-3"><dt className="text-slate-500">Building evidence</dt><dd className="mt-1 font-bold text-slate-900">{snapshot.summary.lowDataPairs}</dd></div>
                <div className="rounded-md bg-slate-50 p-3"><dt className="text-slate-500">Stale evidence</dt><dd className="mt-1 font-bold text-slate-900">{snapshot.summary.stalePairs}</dd></div>
                <div className="rounded-md bg-slate-50 p-3"><dt className="text-slate-500">Contradictory evidence</dt><dd className="mt-1 font-bold text-slate-900">{snapshot.summary.contradictoryPairs}</dd></div>
                <div className="rounded-md bg-slate-50 p-3"><dt className="text-slate-500">Registry version</dt><dd className="mt-1 font-bold text-slate-900">{snapshot.registry.registryVersion || '—'}</dd></div>
              </dl>

              {snapshot.summary.profilesUnavailable > 0 ? (
                <p className="ap-notice ap-notice--warning"><ProfileIcon name="info" /> {snapshot.summary.profilesUnavailable} student evidence profile{snapshot.summary.profilesUnavailable === 1 ? ' was' : 's were'} unavailable. Missing records are never treated as low performance.</p>
              ) : null}
            </div>
          </details>
        </>
      ) : null}

    </section>
  );
};

export default TeacherCurriculumIntelligencePage;
