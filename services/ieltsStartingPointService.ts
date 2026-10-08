import { supabase } from './supabaseClient';
import {
  parseIeltsScreenerCatalog,
  type IeltsScreenerEntry,
} from './ieltsScreenerLaunchService';
import type { IeltsStudentJourney } from './ieltsJourneyService';
export const startingPointSkills = [
  'listening',
  'reading',
  'writing',
  'speaking',
] as const;
export type StartingPointSkill = (typeof startingPointSkills)[number];
export interface StartingPointReview {
  id: string;
  reviewer_name: string;
  reviewed_at: string;
  next_step: string;
  conditions_note: string;
  observations: Record<
    string,
    {
      status: 'observed' | 'developing' | 'insufficient_evidence';
      comment: string;
    }
  >;
}
export interface StartingPointEvidence {
  attempt_id: string;
  occurred_at: string;
  conditions_need_review: boolean;
  raw_score?: number;
  total?: number;
  word_count?: number;
  evidence_kind?:
    | 'first_sitting'
    | 'same_prompt_practice'
    | 'same_form_practice';
  status?: 'in_progress' | 'submitted';
  review?: StartingPointReview | null;
}
export interface IeltsStartingPoint {
  student_name: string | null;
  school_managed: boolean;
  catalog: IeltsScreenerEntry[];
  results: Partial<Record<StartingPointSkill, StartingPointEvidence | null>>;
  speaking_available: boolean;
  confidence: 'low';
  readiness_available: false;
  band_estimate: null;
}
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const validDate = (v: unknown) =>
  typeof v === 'string' && Number.isFinite(Date.parse(v));
export function parseStartingPoint(value: unknown): IeltsStartingPoint {
  const v = value as IeltsStartingPoint;
  const fail = () => {
    throw new Error(
      'We could not confirm your saved checks. Please try again.',
    );
  };
  if (
    !v ||
    v.confidence !== 'low' ||
    v.readiness_available !== false ||
    v.band_estimate !== null ||
    typeof v.school_managed !== 'boolean' ||
    typeof v.speaking_available !== 'boolean' ||
    !(v.student_name === null || typeof v.student_name === 'string') ||
    !v.results ||
    typeof v.results !== 'object' ||
    Array.isArray(v.results)
  )
    fail();
  const catalog = parseIeltsScreenerCatalog(v.catalog);
  for (const skill of startingPointSkills) {
    const e = v.results[skill];
    if (!e) continue;
    if (
      !uuid.test(e.attempt_id) ||
      !validDate(e.occurred_at) ||
      typeof e.conditions_need_review !== 'boolean'
    )
      fail();
    if (skill === 'listening' || skill === 'reading') {
      if (
        !Number.isInteger(e.raw_score) ||
        !Number.isInteger(e.total) ||
        e.total! < 1 ||
        e.raw_score! < 0 ||
        e.raw_score! > e.total!
      )
        fail();
    } else {
      if (
        skill === 'writing' &&
        (!Number.isInteger(e.word_count) || e.word_count! < 0)
      )
        fail();
      if (
        skill === 'speaking' &&
        !['in_progress', 'submitted'].includes(e.status ?? '')
      )
        fail();
      const r = e.review;
      if (
        r &&
        (!uuid.test(r.id) ||
          !validDate(r.reviewed_at) ||
          typeof r.reviewer_name !== 'string' ||
          typeof r.next_step !== 'string' ||
          typeof r.conditions_note !== 'string' ||
          !r.observations ||
          Array.isArray(r.observations) ||
          Object.values(r.observations).some(
            (o) =>
              !o ||
              !['observed', 'developing', 'insufficient_evidence'].includes(
                o.status,
              ) ||
              typeof o.comment !== 'string',
          ))
      )
        fail();
      if (skill === 'speaking' && e.status !== 'submitted' && r) fail();
    }
  }
  return { ...v, catalog };
}
export async function fetchIeltsStartingPoint(): Promise<IeltsStartingPoint> {
  const { data, error } = await supabase.rpc(
    'rpc_ielts_starting_point_summary',
  );
  if (error)
    throw new Error(
      'We could not open your learning record. Your saved work is safe. Check your connection and try again.',
    );
  return parseStartingPoint(data);
}
export function startingPointEntry(
  data: IeltsStartingPoint,
  skill: StartingPointSkill,
) {
  return data.catalog.find((e) => e.code === `bh-${skill}-screener-a`);
}
export function startingPointRoute(
  skill: StartingPointSkill,
  evidence?: StartingPointEvidence | null,
) {
  if (!evidence)
    return skill === 'speaking'
      ? '/ielts/speaking-pilot'
      : `/ielts/${skill}-screener`;
  const id = encodeURIComponent(evidence.attempt_id);
  return skill === 'speaking'
    ? `/ielts/speaking-pilot/${id}`
    : skill === 'writing'
      ? `/ielts/writing-screener/reviews/${id}`
      : `/ielts/screener-result/${id}`;
}
export function startingPointCompleted(
  data: IeltsStartingPoint,
  skill: StartingPointSkill,
) {
  return skill === 'speaking'
    ? data.results.speaking?.status === 'submitted'
    : startingPointEntry(data, skill)?.status === 'completed';
}
export function journeyNextStep(
  data: IeltsStartingPoint,
  journey: IeltsStudentJourney,
) {
  const active = startingPointSkills.find((skill) =>
    skill === 'speaking'
      ? data.results.speaking?.status === 'in_progress'
      : ['in_progress', 'expired'].includes(
          startingPointEntry(data, skill)?.status ?? '',
        ),
  );
  if (active) {
    const e = startingPointEntry(data, active);
    return {
      title: 'Continue your saved work',
      description:
        active === 'speaking'
          ? 'Your interview is in progress. Continue with your teacher.'
          : `Your ${active} attempt is saved. Open it to continue or finish saving.`,
      label:
        active === 'speaking' ? 'Open saved interview' : 'Open saved attempt',
      route:
        active === 'speaking'
          ? startingPointRoute(active, data.results[active])
          : `/ielts/exam/${e!.exam_event_id}`,
    };
  }
  const assignment = journey.assigned_practice.find(
    (a) => !['completed', 'void', 'cancelled'].includes(a.status),
  );
  if (assignment)
    return {
      title: 'Your next practice task',
      description: `Your teacher has assigned “${assignment.title}”. Use your feedback as you work.`,
      label: 'Open assigned practice',
      route: '/ielts/practice/assigned',
    };
  const missing = startingPointSkills.find(
    (s) => !startingPointCompleted(data, s),
  );
  if (missing) {
    const e = startingPointEntry(data, missing);
    const available =
      missing === 'speaking' ? data.speaking_available : e?.status === 'ready';
    return {
      title: `Your ${missing[0].toUpperCase() + missing.slice(1)} starting point`,
      description:
        missing === 'speaking'
          ? 'Arrange a recorded interview with your teacher. Your feedback will appear after review.'
          : available
            ? 'Complete this short check to add another part of your starting point.'
            : 'This check is not ready to start. Open it to check availability.',
      label: missing === 'speaking' ? 'Open Speaking interview' : 'Open check',
      route: startingPointRoute(missing),
    };
  }
  const pending = (['writing', 'speaking'] as const).find(
    (s) => !data.results[s]?.review,
  );
  if (pending)
    return {
      title: 'Your teacher review is next',
      description: `Your ${pending === 'writing' ? 'essay' : 'interview'} is saved. Teacher feedback will help you choose what to practise.`,
      label: 'View saved work',
      route: startingPointRoute(pending, data.results[pending]),
    };
  return {
    title: 'Turn your feedback into practice',
    description: data.school_managed
      ? 'Read your teacher’s next steps below. Agree on one focus with your teacher; your assigned tasks will appear here.'
      : 'Read your next steps below. Choose one focus to practise, then arrange a fresh check with a teacher.',
    label: 'Read teacher feedback',
    route: '#teacher-feedback',
  };
}
