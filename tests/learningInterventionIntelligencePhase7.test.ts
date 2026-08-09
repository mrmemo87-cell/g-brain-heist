import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration=readFileSync('supabase/migrations/20260809177000_learning_intervention_intelligence.sql','utf8');
const page=readFileSync('components/student-progress/TeacherInterventionIntelligencePage.tsx','utf8');
const vite=readFileSync('vite.config.ts','utf8');

test('intervention recommendations are driven by current longitudinal focus state',()=>{
 assert.match(migration,/student_learning_focus_states/i);
 assert.match(migration,/current_status in\('new_focus','recurring','persistent','improving'\)/i);
 assert.match(migration,/evidence_items/i);
 assert.match(migration,/days_since_evidence/i);
 assert.match(migration,/persistent focus area across %s qualifying evidence items/i);
});

test('stale focus areas are reassessed instead of assumed to remain weak',()=>{
 assert.match(migration,/days_since_evidence>=60 then 'reassessment'/i);
 assert.match(migration,/Reassess before assuming the difficulty is still current/i);
 assert.match(page,/Stale persistent areas are reassessed before support is prescribed/i);
});

test('recommendations use real available question content and writing-specific practice',()=>{
 assert.match(migration,/from public\.questions q/i);
 assert.match(migration,/q\.is_public/i);
 assert.match(migration,/available_questions>=5 then 'targeted_question_practice'/i);
 assert.match(migration,/then 'writing_practice'/i);
});

test('interventions snapshot baseline and preserve lifecycle history',()=>{
 assert.match(migration,/baseline_status text not null/i);
 assert.match(migration,/baseline_evidence_items integer/i);
 assert.match(migration,/student_learning_intervention_events/i);
 assert.match(migration,/event_type in \('created','started','note','completed','cancelled'\)/i);
 assert.match(migration,/unique index if not exists student_learning_interventions_open_skill_uidx/i);
});

test('teachers can create plans only inside active subject scope',()=>{
 assert.match(migration,/class_teacher_assignments/i);
 assert.match(migration,/cta\.active is true/i);
 assert.match(migration,/lower\(trim\(cta\.subject\)\)=lower\(trim\(p_subject\)\)/i);
 assert.match(migration,/student_learning_can_manage_intervention/i);
});

test('teacher intervention UI supports recommendation to tracked outcome',()=>{
 assert.match(page,/Evidence-led intervention queue/i);
 assert.match(page,/Create intervention/i);
 assert.match(page,/Start plan/i);
 assert.match(page,/Complete & record outcome/i);
 assert.match(page,/Baseline will be locked/i);
 assert.match(vite,/teacherInterventions:\s*path\.resolve\(__dirname, 'teacher-interventions\.html'\)/i);
});
