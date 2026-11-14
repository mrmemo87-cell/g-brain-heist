// Builds a focused classroom fixture on a fresh local Supabase stack.
// This is NOT a complete production schema or a production capacity benchmark.
import {readFileSync,writeFileSync} from 'node:fs';
const base=readFileSync('tests/fixtures/classroomSchema.sql','utf8');
let sql='create extension if not exists pg_cron with schema pg_catalog;\ncreate schema if not exists private;\n'+base.slice(base.indexOf('create table public.assignment_questions'));
sql+=`
create table public.schools(id uuid primary key,name text,logo_url text);
create table public.superadmins(user_id uuid primary key);
create table public.student_guardian_relationships(guardian_user_id uuid,student_id uuid,school_id uuid,status text);
create table public.school_members(id uuid,user_id uuid,school_id uuid,status text,role_in_school text,is_owner boolean,can_teach boolean,joined_at timestamptz);
`;
// The contract fixture omits generated IDs and live indexes. Supply actual index
// definitions from the read-only production metadata snapshot, not invented tuning.
for(const table of [...sql.matchAll(/create table public\.(\w+) \(id uuid,/g)].map(x=>x[1]))
 sql+=`alter table public.${table} alter column id set default gen_random_uuid();\n`;
sql+=readFileSync('load-tests/local-classroom-metadata.sql','utf8');
sql+=readFileSync('tests/fixtures/authCapabilityFunctions.sql','utf8');
for(const file of ['20260928055401_classroom_reliability.sql','20260928163701_auth_bootstrap_v1.sql','20261007153922_classroom_scoped_reads.sql'])
 sql+=readFileSync('supabase/migrations/'+file,'utf8');
// Exercise the current durable enqueue/lease contract as well as answer/result RPCs.
// Receipts deliberately replace the heavyweight academic pipelines in this focused
// benchmark. The report must not certify production analytics throughput.
sql+=`create table private.load_evidence_receipts(assignment_id uuid,student_id uuid,lane text,primary key(assignment_id,student_id,lane));
create function private.ingest_verified_assignment_registry_evidence(uuid,uuid) returns void language sql as $$ insert into private.load_evidence_receipts values($1,$2,'registry') on conflict do nothing $$;
create function private.ingest_verified_assignment_diagnostic_evidence(uuid,uuid) returns void language sql as $$ insert into private.load_evidence_receipts values($1,$2,'diagnostic') on conflict do nothing $$;
create function private.run_school_head_refresh_batch(integer default 3) returns jsonb language plpgsql as $$ begin return '{}'::jsonb;exception when others then return '{}'::jsonb;end $$;`;
const evidence=readFileSync('supabase/migrations/20261015150000_classroom_async_evidence_and_incident_repairs.sql','utf8');
sql+=evidence.slice(evidence.indexOf('create table if not exists private.assignment_evidence_jobs'),evidence.indexOf('-- pg_cron is installed;'));
const leases=readFileSync('supabase/migrations/20261015223001_durable_worker_leases_and_bounded_drain.sql','utf8');
sql+=leases.slice(0,leases.indexOf('-- Single top-level CALL'));
sql+=`create constraint trigger load_result_evidence after insert or update on public.student_assignment_results deferrable initially deferred for each row execute function private.capture_verified_assignment_diagnostic_evidence();
create trigger load_completion_evidence after update of status on public.student_assignments for each row when (new.status='completed' and old.status is distinct from new.status) execute function private.capture_completed_assignment_evidence();
select cron.schedule('local-load-evidence','10 seconds','call private.run_assignment_evidence_worker()');`;
// Direct tables are closed; caller-bound definer RPCs are the only test API.
for(const table of [...sql.matchAll(/create table public\.(\w+)/g)].map(x=>x[1]))
 sql+=`alter table public.${table} enable row level security; revoke all on public.${table} from anon,authenticated;\n`;
sql+=`revoke all on function public.rpc_is_superadmin() from public,anon;
revoke all on function public.school_admin_get_my_allocation_capabilities(uuid) from public,anon;
revoke all on function public.school_admin_get_my_capabilities(uuid) from public,anon;
grant execute on function public.rpc_is_superadmin(),public.school_admin_get_my_allocation_capabilities(uuid),public.school_admin_get_my_capabilities(uuid) to authenticated;
notify pgrst,'reload schema';\n`;
writeFileSync(process.argv[2],sql,{mode:0o600});
