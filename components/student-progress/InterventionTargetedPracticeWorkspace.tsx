import React, { useEffect, useMemo, useState } from 'react';
import type { QuestionDifficulty, StudentForAssignment, Subject, TeacherQuestion } from '../../types';
import * as GameService from '../../services/gameService';
import {
  createInterventionPracticeAssignment,
  createLearningIntervention,
  registerInterventionPractice,
} from '../../services/studentInterventionService';
import { FEATURE_KEYS, getEntitlements } from '../../services/entitlementService';
import { tryConsumePilotQuota } from '../../services/tierService';
import { brainsAlert } from '../../src/utils/brainsAlert';
import AssignmentWizard from '../teacher/AssignmentWizard';
import type { TargetedPracticeContext } from './TeacherInterventionIntelligencePageV2';
import './TeacherInterventionIntelligencePageV2.css';

interface InterventionTargetedPracticeWorkspaceProps {
  context: TargetedPracticeContext;
  onBack: () => void;
  onComplete: () => void;
}

const normalize = (value?: string | null) => (value || '')
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const isOfficialVerifiedQuestion = (question: TeacherQuestion, grade: number) => {
  const gradeEligible = Number.isInteger(grade)
    && grade > 0
    && Boolean(question.eligible_grade_levels?.length)
    && question.eligible_grade_levels!.includes(grade);
  return question.content_origin === 'brain_heist'
    && question.verification_status === 'verified'
    && question.analytics_eligible === true
    && question.is_public === true
    && question.is_active === true
    && Boolean(question.verified_content_hash)
    && question.current_content_hash === question.verified_content_hash
    && gradeEligible;
};

const localDateTime = (daysFromNow: number) => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(23, 59, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const InterventionTargetedPracticeWorkspace: React.FC<InterventionTargetedPracticeWorkspaceProps> = ({ context, onBack, onComplete }) => {
  const subject = context.recommendation.subject as Subject;
  const studentGrade = Number(context.student.grade || 0);
  const [questions, setQuestions] = useState<TeacherQuestion[]>([]);
  const [teacherId, setTeacherId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assignmentQuestionIds, setAssignmentQuestionIds] = useState<string[]>([]);
  const [assignmentTitle, setAssignmentTitle] = useState(`${context.recommendation.skill} · Targeted Practice`);
  const [assignmentDescription, setAssignmentDescription] = useState(`Focused practice for ${context.student.name}, based on reviewed intervention evidence in ${context.recommendation.skill}.`);
  const [assignmentInstructions, setAssignmentInstructions] = useState(`Work carefully through this short practice. Focus on ${context.recommendation.diagnostic_targets.join(', ') || context.recommendation.skill}. This practice helps rehearse the skill; Brains Heist will still use later assessed work to judge independent improvement.`);
  const [assignmentDueAt, setAssignmentDueAt] = useState(localDateTime(7));
  const [assignmentAssignedAt, setAssignmentAssignedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [assignmentPublishStatus, setAssignmentPublishStatus] = useState<'draft' | 'scheduled' | 'published'>('published');
  const [assignmentCloseAfterDue, setAssignmentCloseAfterDue] = useState(false);
  const [assignmentNotifyByEmail, setAssignmentNotifyByEmail] = useState(false);
  const [assignmentDifficulty, setAssignmentDifficulty] = useState<QuestionDifficulty>('medium');
  const [assignmentTopicMode, setAssignmentTopicMode] = useState<'general' | 'custom'>('custom');
  const [assignmentTopicName, setAssignmentTopicName] = useState(context.recommendation.skill);
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([context.student.id]);
  const [assignmentMode, setAssignmentMode] = useState<'batch' | 'custom'>('custom');
  const [assignmentBatches, setAssignmentBatches] = useState<string[]>([]);

  const targetStudent = useMemo<StudentForAssignment>(() => ({
    id: context.student.id,
    username: context.student.name,
    display_name: context.student.name,
    grade: studentGrade,
    batch: (context.student.class_name || null) as StudentForAssignment['batch'],
    avatar_url: null,
  }), [context.student.class_name, context.student.id, context.student.name, studentGrade]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setLoadError(null);
      try {
        const entitlements = await getEntitlements(true);
        if (!entitlements.canUse(FEATURE_KEYS.ASSIGNMENTS)) throw new Error('Assignments are not included in this school plan.');
        const [teacher, allQuestions] = await Promise.all([GameService.get_teacher_profile(), GameService.get_all_questions()]);
        if (!teacher) throw new Error('Teacher profile could not be loaded.');
        if (cancelled) return;
        setTeacherId(teacher.id);
        const subjectQuestions = allQuestions.filter((question) => normalize(question.subject) === normalize(subject));
        setQuestions(subjectQuestions);
        // The backend resolves exact canonical leaf matches first, followed by
        // other verified items under the same governed primary skill. The UI
        // never substitutes text-similar questions for those authoritative IDs.
        const byId = new Map(subjectQuestions.map((question) => [question.id, question]));
        const governed = (context.recommendation.recommended_question_ids || [])
          .map((questionId) => byId.get(questionId))
          .filter((question): question is TeacherQuestion => Boolean(question))
          .filter((question) => isOfficialVerifiedQuestion(question, studentGrade))
          .map((question) => question.id);
        setAssignmentQuestionIds(governed);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Targeted practice could not be prepared.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [context, studentGrade, subject]);

  const save = async (publishStatus: 'draft' | 'scheduled' | 'published', event?: React.FormEvent) => {
    event?.preventDefault();
    if (!assignmentQuestionIds.length) return brainsAlert('Choose at least one question for this targeted practice.', 'info');
    if (!teacherId) return brainsAlert('Teacher profile could not be loaded. Please reopen targeted practice.', 'error');
    if (selectedStudentIds.length !== 1 || selectedStudentIds[0] !== context.student.id) {
      setSelectedStudentIds([context.student.id]);
      return brainsAlert('Intervention practice is locked to the selected student.', 'error');
    }
    if (!assignmentTitle.trim()) return brainsAlert('Assignment title is required.', 'info');
    try {
      setAssignmentSubmitting(true);
      const quota = await tryConsumePilotQuota('assignments_created');
      if (!quota.proceed) throw new Error(quota.error || 'The assignment creation limit has been reached.');
      const toIso = (value: string) => value ? new Date(value).toISOString() : undefined;
      const assignment = await createInterventionPracticeAssignment({
        teacherId,
        subject,
        topicName: assignmentTopicMode === 'custom' ? assignmentTopicName.trim() || context.recommendation.skill : 'General',
        questionIds: assignmentQuestionIds,
        assignedAt: publishStatus === 'published' ? new Date().toISOString() : toIso(assignmentAssignedAt) || new Date().toISOString(),
        dueAt: toIso(assignmentDueAt),
        title: assignmentTitle.trim(),
        description: assignmentDescription || undefined,
        instructions: assignmentInstructions || undefined,
        difficulty: assignmentDifficulty,
        publishStatus,
        closeSubmissionsAfterDue: assignmentCloseAfterDue,
        notifyStudentsByEmail: assignmentNotifyByEmail,
        studentId: context.student.id,
        skillKey: context.recommendation.skill_key,
        diagnosticTargets: context.recommendation.diagnostic_targets,
      });

      let interventionId: string | null = null;
      if (!context.recommendation.has_open_intervention) {
        try {
          const target = context.recommendation.diagnostic_targets[0] || context.recommendation.skill;
          interventionId = await createLearningIntervention({
            studentId: context.student.id,
            skillKey: context.recommendation.skill_key,
            interventionType: context.recommendation.recommended_type,
            goal: context.recommendation.suggested_goal,
            teachingAction: `Complete targeted practice “${assignment.title || assignmentTitle.trim()}” (${assignment.question_count ?? assignmentQuestionIds.length} questions) for ${target}.`,
            evidenceTask: `After practice, review the next qualifying assessed task for accurate, independent use of ${target.toLowerCase()}. Targeted-practice accuracy alone does not mark the weakness as resolved.`,
            targetDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
            targetStatus: 'improving',
            minimumFollowUpObservations: 2,
            minimumSuccessfulObservations: 2,
          });
          await registerInterventionPractice({
            assignmentId: assignment.id,
            studentId: context.student.id,
            skillKey: context.recommendation.skill_key,
            diagnosticTargets: context.recommendation.diagnostic_targets,
            interventionId,
          });
        } catch (planError) {
          console.error('Targeted practice was created but the support-plan record failed:', planError);
          brainsAlert('Practice was created safely, but Brains Heist could not finish the support-plan link. The practice will not count as independent mastery evidence; reopen Interventions to finish the plan.', 'error');
          onComplete();
          return;
        }
      }

      brainsAlert(
        publishStatus === 'draft'
          ? `Targeted practice saved as a draft for ${context.student.name}.`
          : publishStatus === 'scheduled'
            ? `Targeted practice scheduled for ${context.student.name}.`
            : `Targeted practice published to ${context.student.name}.`,
        'success',
      );
      onComplete();
    } catch (error) {
      console.error('Failed to create intervention practice:', error);
      brainsAlert(error instanceof Error ? error.message : 'Targeted practice could not be created.', 'error');
    } finally {
      setAssignmentSubmitting(false);
    }
  };

  if (loading) return <div className="intervention-targeted-workspace-state">Preparing focused questions for {context.student.name}…</div>;
  if (loadError) return <div className="intervention-targeted-workspace-state is-error"><strong>Targeted practice could not be prepared.</strong><span>{loadError}</span><button type="button" onClick={onBack}>Back to Interventions</button></div>;

  return <section className="intervention-targeted-workspace">
    <header className="intervention-targeted-banner">
      <div><span>Brains Heist · Targeted Practice</span><h2>{context.recommendation.skill}</h2><p>For <strong>{context.student.name}</strong> only. Automatic suggestions use current, grade-eligible Brains Heist Verified questions. Teacher questions remain available for deliberate classroom-only practice.</p></div>
      <div><span>Confirmed focus</span><strong>{context.recommendation.diagnostic_targets.join(' · ') || context.recommendation.skill}</strong><small>Practice is rehearsal. Independent assessed work remains the progress check.</small></div>
    </header>
    <AssignmentWizard
      initialStep={3}
      lockedSubject={subject}
      assignmentMode={assignmentMode}
      setAssignmentMode={(mode) => { if (mode !== 'custom') return; setAssignmentMode('custom'); }}
      assignmentBatches={assignmentBatches}
      setAssignmentBatches={setAssignmentBatches}
      assignmentSubject={subject}
      setAssignmentSubject={() => undefined}
      assignmentTitle={assignmentTitle}
      setAssignmentTitle={setAssignmentTitle}
      assignmentDescription={assignmentDescription}
      setAssignmentDescription={setAssignmentDescription}
      assignmentInstructions={assignmentInstructions}
      setAssignmentInstructions={setAssignmentInstructions}
      assignmentQuestionIds={assignmentQuestionIds}
      setAssignmentQuestionIds={setAssignmentQuestionIds}
      assignmentDueAt={assignmentDueAt}
      setAssignmentDueAt={setAssignmentDueAt}
      assignmentAssignedAt={assignmentAssignedAt}
      setAssignmentAssignedAt={setAssignmentAssignedAt}
      assignmentPublishStatus={assignmentPublishStatus}
      setAssignmentPublishStatus={setAssignmentPublishStatus}
      assignmentCloseAfterDue={assignmentCloseAfterDue}
      setAssignmentCloseAfterDue={setAssignmentCloseAfterDue}
      assignmentNotifyByEmail={assignmentNotifyByEmail}
      setAssignmentNotifyByEmail={setAssignmentNotifyByEmail}
      editingAssignment={false}
      assignmentDifficulty={assignmentDifficulty}
      setAssignmentDifficulty={setAssignmentDifficulty}
      assignmentTopicMode={assignmentTopicMode}
      setAssignmentTopicMode={setAssignmentTopicMode}
      assignmentTopicName={assignmentTopicName}
      setAssignmentTopicName={setAssignmentTopicName}
      assignmentSubmitting={assignmentSubmitting}
      availableStudents={[targetStudent]}
      selectedStudentIds={selectedStudentIds}
      setSelectedStudentIds={(value) => {
        const next = typeof value === 'function' ? value([context.student.id]) : value;
        setSelectedStudentIds(next.includes(context.student.id) ? [context.student.id] : [context.student.id]);
      }}
      allocatedClasses={[]}
      teacherAssignedSubjects={[subject]}
      teacherId={teacherId}
      questions={questions}
      onSubmit={(event) => save(assignmentPublishStatus === 'scheduled' ? 'scheduled' : 'published', event)}
      onSaveDraft={() => save('draft')}
      onCancel={onBack}
    />
  </section>;
};

export default InterventionTargetedPracticeWorkspace;
