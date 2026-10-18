-- Diagnostic Bible 2.0.0 section 18A: real outcome tracking. Official IELTS results are recorded with consent,
-- school-scoped and private; staff can mark a result verified after checking the Test Report Form.

create table if not exists private.ielts_official_results (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.users(id),
 school_id uuid,
 test_date date not null,
 test_type text not null check (test_type in ('academic','general_training')),
 delivery text not null check (delivery in ('computer','paper')),
 listening numeric not null, reading numeric not null, writing numeric not null, speaking numeric not null, overall numeric not null,
 centre_country text,
 trf_reference text,
 consent boolean not null check (consent),
 verified boolean not null default false,
 verified_by uuid references public.users(id),
 verified_at timestamptz,
 recorded_by uuid not null references public.users(id),
 created_at timestamptz not null default now(),
 check (verified = (verified_by is not null and verified_at is not null))
);
alter table private.ielts_official_results enable row level security;
create index if not exists ielts_official_results_student on private.ielts_official_results(student_id);

create or replace function private.ielts_official_band(p numeric) returns boolean
language sql immutable set search_path to '' as $$ select p between 0 and 9 and p * 2 = floor(p * 2) $$;

create or replace function private.ielts_official_result_staff(p_school uuid) returns boolean
language sql stable security definer set search_path to '' as $$
 select p_school is not null and private.ielts_batch_manager(p_school)
$$;

create or replace function public.rpc_ielts_official_result_record(p_student uuid, p_test_date date, p_test_type text, p_delivery text,
 p_listening numeric, p_reading numeric, p_writing numeric, p_speaking numeric, p_overall numeric, p_centre_country text, p_trf_reference text, p_consent boolean)
returns uuid language plpgsql security definer set search_path to '' as $$
declare st public.users; rid uuid;
begin
 select * into st from public.users where id = p_student;
 if st.id is null or auth.uid() is null or not (auth.uid() = p_student or private.ielts_official_result_staff(st.school_id)) then raise exception using errcode='42501', message='not_authorized'; end if;
 if coalesce(p_consent, false) is not true then raise exception 'consent_required'; end if;
 if p_test_date is null or p_test_date > (now() at time zone 'Asia/Bishkek')::date then raise exception 'invalid_date'; end if;
 if not (private.ielts_official_band(p_listening) and private.ielts_official_band(p_reading) and private.ielts_official_band(p_writing)
         and private.ielts_official_band(p_speaking) and private.ielts_official_band(p_overall)) then raise exception 'invalid_band'; end if;
 if p_overall <> private.ielts_round_half((p_listening + p_reading + p_writing + p_speaking) / 4) then raise exception 'overall_mismatch'; end if;
 insert into private.ielts_official_results(student_id, school_id, test_date, test_type, delivery, listening, reading, writing, speaking, overall,
   centre_country, trf_reference, consent, recorded_by)
 values (p_student, st.school_id, p_test_date, p_test_type, p_delivery, p_listening, p_reading, p_writing, p_speaking, p_overall,
   nullif(trim(coalesce(p_centre_country,'')),''), nullif(trim(coalesce(p_trf_reference,'')),''), true, auth.uid())
 returning id into rid;
 return rid;
end $$;

create or replace function public.rpc_ielts_official_result_verify(p_result uuid) returns void
language plpgsql security definer set search_path to '' as $$
declare r private.ielts_official_results;
begin
 select * into r from private.ielts_official_results where id = p_result for update;
 if r.id is null or not private.ielts_official_result_staff(r.school_id) then raise exception using errcode='42501', message='not_authorized'; end if;
 if r.recorded_by = auth.uid() and r.student_id = auth.uid() then raise exception 'not_authorized'; end if;
 update private.ielts_official_results set verified = true, verified_by = auth.uid(), verified_at = now() where id = p_result and not verified;
end $$;

-- Batch outcomes: each student's official results next to their first and latest eligible mock ranges.
create or replace function public.rpc_ielts_batch_outcomes(p_batch uuid) returns jsonb
language sql stable security definer set search_path to '' as $$
 with b as materialized (select * from private.ielts_batch_assert(p_batch)),
 members as (
  select u.id, coalesce(nullif(u.full_name,''),u.username) as name from private.ielts_course_batch_members m
  join public.users u on u.id = m.student_id join b on b.id = m.batch_id where m.left_at is null and u.school_id = b.school_id
 ), ranges as (
  select r.student_id, s.mock_code, s.sat_on, r.section,
         private.ielts_mock_result_json(r, private.ielts_mock_exposed(r.student_id, s.id))->'indicative' as indicative
  from private.ielts_mock_results r join private.ielts_mock_sittings s on s.id = r.sitting_id
  where r.student_id in (select id from members)
 )
 select jsonb_build_object('students', coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name,
   'official', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'test_date', o.test_date, 'test_type', o.test_type, 'delivery', o.delivery,
       'listening', o.listening, 'reading', o.reading, 'writing', o.writing, 'speaking', o.speaking, 'overall', o.overall, 'verified', o.verified)
       order by o.test_date desc) from private.ielts_official_results o where o.student_id = m.id), '[]'),
   'mock_ranges', coalesce((select jsonb_agg(jsonb_build_object('mock', x.mock_code, 'sat_on', x.sat_on, 'section', x.section, 'indicative', x.indicative)
       order by x.sat_on, x.section) from ranges x where x.student_id = m.id and x.indicative is not null and jsonb_typeof(x.indicative) = 'object'), '[]'))
  order by m.name), '[]'))
 from members m
$$;

revoke all on function private.ielts_official_band(numeric) from public, anon, authenticated;
revoke all on function private.ielts_official_result_staff(uuid) from public, anon, authenticated;
revoke all on function public.rpc_ielts_official_result_record(uuid,date,text,text,numeric,numeric,numeric,numeric,numeric,text,text,boolean) from public, anon;
revoke all on function public.rpc_ielts_official_result_verify(uuid) from public, anon;
revoke all on function public.rpc_ielts_batch_outcomes(uuid) from public, anon;
grant execute on function public.rpc_ielts_official_result_record(uuid,date,text,text,numeric,numeric,numeric,numeric,numeric,text,text,boolean) to authenticated;
grant execute on function public.rpc_ielts_official_result_verify(uuid) to authenticated;
grant execute on function public.rpc_ielts_batch_outcomes(uuid) to authenticated;
