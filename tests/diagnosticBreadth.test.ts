import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const actor = uid(1), school = uid(2), group = uid(3), subject = uid(4);
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema private;
  create table questions (
    id uuid primary key, academic_subject_id uuid, difficulty text,
    question_type text default 'multiple_choice', options jsonb default '["right","wrong1","wrong2","wrong3"]',
    correct_answer text default 'right', explanation text default '',
    is_active boolean default true, pool_scope text default 'global',
    content_origin text default 'brain_heist', verification_status text default 'verified',
    analytics_eligible boolean default true, is_public boolean default true,
    owner_school_id uuid, current_content_hash text default 'current',
    verified_content_hash text default 'current', eligible_grade_levels smallint[] default '{8}',
    is_mapped boolean default true
  );
  create table assignments(id uuid primary key, subject_group_id uuid, publish_status text, created_at timestamptz);
  create table assignment_questions(assignment_id uuid, question_id uuid, order_index integer, question_snapshot jsonb);
  create table verified_question_diagnostic_taxonomy(
    id uuid primary key, question_id uuid, question_content_hash text default 'current',
    atomic_subskill_code text, review_status text default 'approved',
    human_review_required boolean default false, created_at timestamptz default now()
  );
  create view private.active_verified_question_diagnostic_taxonomy as
    select * from verified_question_diagnostic_taxonomy
    where review_status='approved' and not human_review_required;
  create table academic_skill_registry_versions(id uuid, status text, subject_key text, effective_from date);
  create table academic_skill_registry_nodes(id uuid, registry_version_id uuid, parent_id uuid, node_type text, status text, code text);
  create table academic_skill_evidence_focuses(id uuid, registry_version_id uuid, atomic_subskill_node_id uuid, status text);
  create table verified_question_registry_taxonomy(
    id uuid, question_id uuid, question_content_hash text, registry_version_id uuid,
    primary_skill_node_id uuid, atomic_subskill_node_id uuid, evidence_focus_id uuid,
    review_status text, human_review_required boolean, created_at timestamptz
  );
  create function private.teacher_current_teaching_groups(uuid,uuid)
  returns table(group_id uuid,can_create boolean,academic_subject_id uuid,academic_subject_code text,grade_level text,academic_year_id uuid)
  language sql as $$ select '${group}'::uuid,true,'${subject}'::uuid,'english','8','${uid(5)}'::uuid
    where $1='${actor}' and $2='${school}' $$;
  create function private.verified_question_has_curriculum_mapping(uuid,uuid,uuid,text,uuid)
  returns boolean language sql as $$ select is_mapped from public.questions where id=$1 $$;

  -- A large agreement bank must not outweigh twelve smaller governed skills.
  insert into questions(id,academic_subject_id,difficulty)
    select md5(i::text)::uuid,'${subject}',case i%3 when 0 then 'easy' when 1 then 'medium' else 'hard' end
    from generate_series(1,600) i;
  insert into verified_question_diagnostic_taxonomy(id,question_id,atomic_subskill_code)
    select id,id,'english.subject-verb-agreement' from questions;
  insert into questions(id,academic_subject_id,difficulty)
    select md5(i::text)::uuid,'${subject}',case i%3 when 0 then 'easy' when 1 then 'medium' else 'hard' end
    from generate_series(601,720) i;
  insert into verified_question_diagnostic_taxonomy(id,question_id,atomic_subskill_code)
    select id,id,'english.skill.'||((i-601)/10)::text from generate_series(601,720) i
    join questions q on q.id=md5(i::text)::uuid;
`);
await db.exec(readFileSync('supabase/migrations/20261005083909_diagnostic_micro_skill_breadth.sql', 'utf8'));
const balanceMigration = readFileSync('supabase/migrations/20261004214000_english_dynamic_diagnostics_and_option_balance.sql', 'utf8');
await db.exec(balanceMigration.slice(
  balanceMigration.indexOf('create or replace function private.balance_assignment_question_options()'),
  balanceMigration.indexOf('-- 2. Shared governed diagnostic pool'),
));
const pool = () => db.query<{ question_id: string; skill_key: string; recently_used: boolean }>(
  'select * from private.teacher_diagnostic_candidate_pool($1,$2,$3)', [actor, school, group],
);
const select = async (count: number, seed = 'fixture') => (await db.query<{ ids: string[] }>(
  'select private.select_teacher_diagnostic_questions($1,$2,$3,$4,$5) ids',
  [actor, school, group, count, seed],
)).rows[0].ids;

test('diagnostics spread over governed atomic skills despite a much larger agreement pool', async () => {
  const candidates = (await pool()).rows;
  assert.equal(candidates.length, 720);
  assert.equal(new Set(candidates.map(q => q.skill_key)).size, 13);
  const byId = new Map(candidates.map(q => [q.question_id, q]));
  for (const count of [10, 20, 30, 40]) {
    for (const seed of ['one', 'two', 'three']) {
      const ids = await select(count, seed);
      assert.equal(ids.length, count);
      assert.equal(new Set(ids).size, count);
      const frequencies = new Map<string, number>();
      for (const id of ids) {
        const skill = byId.get(id)!.skill_key;
        frequencies.set(skill, (frequencies.get(skill) || 0) + 1);
      }
      assert.equal(frequencies.size, Math.min(13, count));
      assert.ok(Math.max(...frequencies.values()) <= Math.ceil(count / 13));
      assert.deepEqual(await select(count, seed), ids);
    }
  }
  await assert.rejects(select(28), /unsupported_diagnostic_question_count/);
});

test('breadth beats repeated fresh agreement items, freshness still wins within each skill', async () => {
  await db.exec(`
    insert into assignments values('${uid(50)}','${group}','published',now());
    insert into assignment_questions(assignment_id,question_id)
      select '${uid(50)}',md5(i::text)::uuid from generate_series(601,610) i;
    insert into assignments values('${uid(51)}','${group}','draft',now());
    insert into assignment_questions(assignment_id,question_id) values('${uid(51)}',md5('611')::uuid);
  `);
  const candidates = (await pool()).rows;
  const ids = await select(20);
  const selected = candidates.filter(q => ids.includes(q.question_id));
  assert.ok(selected.some(q => q.skill_key === 'english.skill.0' && q.recently_used));
  assert.ok(selected.filter(q => q.skill_key === 'english.subject-verb-agreement').length <= 2);
  assert.equal(candidates.find(q => q.question_id === (md5Ids.get(611)))?.recently_used, false);
  await db.exec(`delete from assignment_questions; delete from assignments;`);
});

const md5Ids = new Map((await db.query<{ i: number; id: string }>(
  'select i,md5(i::text)::uuid id from generate_series(601,620) i',
)).rows.map(q => [q.i, q.id]));

test('stale, unreviewed, unmapped and malformed items stay out; mappings never duplicate candidates', async () => {
  await db.exec(`
    update verified_question_diagnostic_taxonomy set question_content_hash='stale' where question_id=md5('1')::uuid;
    update verified_question_diagnostic_taxonomy set human_review_required=true where question_id=md5('2')::uuid;
    update questions set options='null'::jsonb where id=md5('3')::uuid;
    update questions set is_mapped=false where id=md5('4')::uuid;
    update questions set current_content_hash='changed' where id=md5('5')::uuid;
    update questions set eligible_grade_levels='{7}' where id=md5('6')::uuid;
    update questions set options='["right","right","wrong1","wrong2"]' where id=md5('7')::uuid;
    update verified_question_diagnostic_taxonomy set review_status='retired' where question_id=md5('8')::uuid;
    insert into verified_question_diagnostic_taxonomy(id,question_id,atomic_subskill_code)
      values('${uid(99)}',md5('9')::uuid,'english.subject-verb-agreement');
  `);
  const candidates = (await pool()).rows;
  assert.equal(candidates.length, 712);
  assert.equal(new Set(candidates.map(q => q.question_id)).size, 712);
  for (const args of [[uid(999), school, group], [actor, uid(999), group], [actor, school, uid(999)]]) {
    assert.equal((await db.query('select * from private.teacher_diagnostic_candidate_pool($1,$2,$3)', args)).rows.length, 0);
  }
});

test('published registry nodes are used only with current approved evidence focus and subject', async () => {
  await db.exec(`
    insert into academic_skill_registry_versions values('${uid(100)}','published','english',current_date);
    insert into academic_skill_registry_nodes values
      ('${uid(101)}','${uid(100)}',null,'skill','active','english.grammar'),
      ('${uid(102)}','${uid(100)}','${uid(101)}','subskill','active','english.registry-agreement');
    insert into academic_skill_evidence_focuses values('${uid(103)}','${uid(100)}','${uid(102)}','active');
    insert into verified_question_registry_taxonomy values
      ('${uid(104)}',md5('10')::uuid,'current','${uid(100)}','${uid(101)}','${uid(102)}','${uid(103)}','approved',false,now());
  `);
  const code = async () => (await db.query<{ skill_key: string }>(
    "select skill_key from private.teacher_diagnostic_candidate_pool($1,$2,$3) where question_id=md5('10')::uuid", [actor, school, group],
  )).rows[0].skill_key;
  assert.equal(await code(), 'english.registry-agreement');
  await db.exec(`update academic_skill_evidence_focuses set status='retired';`);
  assert.equal(await code(), 'english.subject-verb-agreement');
  await db.exec(`update academic_skill_evidence_focuses set status='active'; update academic_skill_registry_versions set subject_key='economics';`);
  assert.equal(await code(), 'english.subject-verb-agreement');
});

test('saved snapshots balance A–D and preserve the correct answer, source order and source hash', async () => {
  for (const count of [10, 20, 28, 30, 40]) {
    const assignmentId = uid(200 + count);
    await db.query(`insert into assignment_questions(assignment_id,question_id,order_index,question_snapshot)
      select $1,q.id,row_number() over(order by q.id)::integer,to_jsonb(q)
      from (select * from questions where jsonb_typeof(options)='array'
        and current_content_hash=verified_content_hash and is_mapped
        and options='["right","wrong1","wrong2","wrong3"]'::jsonb order by id limit $2) q`, [assignmentId, count]);
    const saved = (await db.query<{ options: string[]; answer: string; hash: string; source: string[]; source_answer: string }>(`
      select aq.question_snapshot->'options' options,aq.question_snapshot->>'correct_answer' answer,
        aq.question_snapshot->>'current_content_hash' hash,q.options source,q.correct_answer source_answer
      from assignment_questions aq join questions q on q.id=aq.question_id
      where aq.assignment_id=$1 order by aq.order_index`, [assignmentId])).rows;
    assert.equal(saved.length, count);
    const positions = [0, 0, 0, 0];
    for (const item of saved) {
      assert.equal(item.answer, item.source_answer);
      assert.equal(item.hash, 'current');
      assert.deepEqual(item.source, ['right', 'wrong1', 'wrong2', 'wrong3']);
      assert.deepEqual([...item.options].sort(), [...item.source].sort());
      positions[item.options.indexOf(item.answer)] += 1;
    }
    assert.ok(Math.max(...positions) - Math.min(...positions) <= 1);
    if (count === 28) assert.deepEqual(positions, [7, 7, 7, 7]);
  }
  await db.close();
});
