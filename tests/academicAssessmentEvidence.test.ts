import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { aggregateAssessmentEvidence, assessmentResultLabel } from '../components/student-progress/academicAssessmentEvidence';
import type { StudentAcademicProfile } from '../services/studentAcademicProfileService';

type Item = StudentAcademicProfile['timeline'][number];
const item = (id: string, correct: number, incorrect: number, sourceId = 'assessment-a'): Item => ({
  id, subject: 'English', skill: 'Grammar', subskill: 'Question formation', source_type: 'assignment_result', source_id: sourceId,
  observed_at: '2026-09-29T09:00:00Z', evidence_count: correct + incorrect,
  observation_type: correct ? 'strength' : 'focus', evidence_percentage: 100 * correct / (correct + incorrect),
  evidence: { correct, incorrect, evidence_focus_code: id },
});

test('one assessment pools question totals and is independent of answer order', () => {
  const answers = [item('q1', 1, 0), item('q2', 0, 3)];
  const forward = aggregateAssessmentEvidence(answers);
  const backward = aggregateAssessmentEvidence([...answers].reverse());
  assert.equal(forward.length, 1);
  assert.equal(forward[0].evidence_percentage, 25);
  assert.equal(forward[0].observation_type, 'focus');
  assert.equal(assessmentResultLabel(forward[0]), '1/4 correct');
  assert.equal(backward[0].evidence_percentage, 25);
  assert.equal(backward[0].evidence?.['focus_signature'], forward[0].evidence?.['focus_signature']);
});

test('separate assessments, subjects, skills and Writing Hub never pool together', () => {
  const first = item('q1', 1, 0);
  assert.equal(aggregateAssessmentEvidence([first, item('q2', 0, 1, 'assessment-b'),
    { ...item('q3', 0, 1), subject: 'Economics' },
    { ...item('q4', 0, 1), subskill: 'Pronoun reference' },
    { ...item('q5', 0, 1), source_type: 'writing_assessment_review' },
  ]).length, 5);
});

test('unscored evidence is not assigned an invented numeric mark', () => {
  const result = aggregateAssessmentEvidence([{ ...item('q1', 1, 0), evidence_percentage: null, evidence: {} }]);
  assert.equal(result[0].evidence_percentage, null);
  assert.equal(assessmentResultLabel(result[0]), 'Result not scored');
});

test('database pools qualified assignment observations but preserves raw audit rows and exclusions', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema private; create role anon; create role authenticated; create role service_role;
      create table student_learning_observations(id uuid, student_id uuid,skill_key text,source_type text,source_id uuid,source_key text,academic_year_id uuid,observed_at timestamptz,created_at timestamptz,evidence_count integer,evidence_percentage numeric,observation_type text,contributes_to_focus_state boolean,evidence jsonb);
      create function student_learning_observation_is_qualified(text,boolean,jsonb) returns boolean language sql immutable as $$ select coalesce($2,false) $$;
      insert into student_learning_observations values
        ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','skill','assignment_result','00000000-0000-0000-0000-000000000100','a',null,'2026-09-29','2026-09-29',1,100,'strength',true,'{}'),
        ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000010','skill','assignment_result','00000000-0000-0000-0000-000000000100','b',null,'2026-09-29','2026-09-29',3,0,'focus',true,'{}'),
        ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000010','skill','assignment_result','00000000-0000-0000-0000-000000000100','c',null,'2026-09-29','2026-09-29',1,100,'strength',false,'{}'),
        ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000010','skill','assignment_result','00000000-0000-0000-0000-000000000101','d',null,'2026-10-01','2026-10-01',2,100,'strength',true,'{}');`);
    const migration = readFileSync('supabase/migrations/20261004115200_academic_profile_assessment_grouping.sql', 'utf8');
    await db.exec(migration.slice(0, migration.indexOf('CREATE OR REPLACE FUNCTION public.student_learning_rebuild_confidence_state')));
    const result = await db.query<{evidence_count: number; evidence_percentage: string; observation_type: string; contributes_to_focus_state: boolean}>(`select evidence_count,evidence_percentage,observation_type,contributes_to_focus_state from private.academic_assignment_assessment_observations('00000000-0000-0000-0000-000000000010','skill','2026-10-04') order by evidence_count desc`);
    assert.equal(result.rows.length, 3);
    assert.equal(result.rows[0].evidence_count, 4);
    assert.equal(Number(result.rows[0].evidence_percentage), 25);
    assert.equal(result.rows[0].observation_type, 'focus');
    assert.equal(result.rows.filter((row) => !row.contributes_to_focus_state).length, 1);
    const raw = await db.query<{n: number}>('select count(*)::int n from student_learning_observations');
    assert.equal(raw.rows[0].n, 4);
    assert.match(migration, /v_recent.assessment_dates > 1/);
    assert.match(migration, /a.source_type=b.source_type and a.focus_signature=b.focus_signature/);
  } finally { await db.close(); }
});
