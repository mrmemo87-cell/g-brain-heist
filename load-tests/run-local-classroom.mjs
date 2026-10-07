// Execute on a disposable Docker-capable host. Never accepts a hosted URL.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import os from 'node:os';
const info=JSON.parse(readFileSync(process.argv[2],'utf8'));
const base=(info.API_URL||'').replace(/\/$/,'');
if(!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(base))throw Error('Only the disposable loopback Supabase stack is accepted');
if(!info.ANON_KEY||!info.SERVICE_ROLE_KEY)throw Error('Local Auth keys missing');
const output=process.argv[3];mkdirSync(output,{recursive:true,mode:0o700});
const k6=process.argv[4];
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
function sql(query){
 const p=spawnSync('docker',['exec','-i','supabase_db_brains-classroom-local','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input:query,encoding:'utf8',maxBuffer:4*1024*1024});
 if(p.status!==0)throw Error('Local SQL failed: '+p.stderr);
 return p.stdout.trim();
}
async function auth(path,body,admin=false){
 const r=await fetch(base+'/auth/v1/'+path,{method:'POST',headers:{apikey:info.ANON_KEY,Authorization:'Bearer '+(admin?info.SERVICE_ROLE_KEY:info.ANON_KEY),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const data=await r.json();if(!r.ok)throw Error(`Fixture Auth ${path} failed (${r.status}): ${data.msg||data.message||data.error_description||data.error}`);return data;
}
const password=randomBytes(24).toString('hex');
const nonce=randomBytes(6).toString('hex');
async function account(i){
 const email=`load-${nonce}-${i}@example.invalid`;
 const u=await auth('admin/users',{email,password,email_confirm:true},true);
 const session=await auth('token?grant_type=password',{email,password});
 if(session.user?.id!==u.id||!session.access_token)throw Error('Real Auth identity mismatch during setup');
 return {id:u.id,email,token:session.access_token};
}
const teacher=await account('teacher');
const students=[];
for(let start=0;start<500;start+=5){
 students.push(...await Promise.all(Array.from({length:Math.min(5,500-start)},(_,n)=>account(start+n))));
 if(start%100===0)console.log(`Prepared ${Math.min(start+5,500)}/500 synthetic Auth users`);
}
const school=randomUUID(),year=randomUUID(),klass=randomUUID(),teacherId=randomUUID();
let seed=`insert into schools values(${quote(school)},'Synthetic load school',null);
insert into school_academic_years(id,school_id,name,status) values(${quote(year)},${quote(school)},'Synthetic current year','current');
insert into classes(id,school_id,class_code,is_active) values(${quote(klass)},${quote(school)},'LOAD',true);
insert into teachers(id,user_id,verified) values(${quote(teacherId)},${quote(teacher.id)},true);
insert into class_teacher_assignments(id,school_id,class_id,teacher_user_id,subject,active) values(gen_random_uuid(),${quote(school)},${quote(klass)},${quote(teacher.id)},'ESL',true);\n`;
for(const [i,u] of [teacher,...students].entries()){
 seed+=`insert into users(id,email,username,role,school_id,needs_setup,tutorial_completed,is_banned) values(${quote(u.id)},${quote(u.email)},'Synthetic-${i}',${quote(i===0?'teacher':'student')},${quote(school)},false,true,false);\n`;
 seed+=`insert into school_members values(gen_random_uuid(),${quote(u.id)},${quote(school)},'active',${quote(i===0?'teacher':'student')},false,${i===0},now());\n`;
 if(i>0)seed+=`insert into class_students values(${quote(klass)},${quote(u.id)},now());\n`;
}
sql(seed);
const rpcFiles=['20260928055401_classroom_reliability.sql','20260928163701_auth_bootstrap_v1.sql','20261007153922_classroom_scoped_reads.sql'];
const report={scope:'Local Supabase classroom RPC benchmark; focused schema, no production capacity certification',versions:{node:process.version,source:process.env.CLASSROOM_SOURCE_SHA||spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),rpcSha256:Object.fromEntries(rpcFiles.map(f=>[f,createHash('sha256').update(readFileSync('supabase/migrations/'+f)).digest('hex')]))},host:{platform:os.platform(),cpuModel:os.cpus()[0].model,cpuCount:os.cpus().length,memoryBytes:os.totalmem()},limitations:['Focused classroom schema; unrelated tables, production analytics/reward triggers and billing pre-request hook omitted','Synthetic data: 500 students, one teacher, 16 questions per fresh assignment','Real Supabase Auth users and password-issued sessions; signup/login provisioning is outside the measured load','Loopback HTTP; no WAN/CDN/TLS latency, browser rendering or hosted connection limits','Load generator and database share the test host; results do not certify hosted production capacity'],stages:[]};
let cumulative=0;
for(const count of [30,100,500]){
 const assignment=randomUUID();const questions=[];let expectedCorrect=0;
 let setup=`insert into assignments(id,teacher_id,school_id,academic_year_id,class_id,subject_name,title,assignment_mode,publish_status,assigned_at,close_submissions_after_due) values(${quote(assignment)},${quote(teacherId)},${quote(school)},${quote(year)},${quote(klass)},'ESL','Synthetic load ${count}','batch','published',now(),false);\n`;
 for(let i=0;i<16;i++){
  const id=randomUUID(),key=i===15?'cat':'ABCD'[i%4],wrong=i!==15&&(i+1)%4===0;
  const answer=wrong?'ABCD'[(i+1)%4]:key;if(!wrong)expectedCorrect++;
  const snapshot={id,question_text:`Synthetic fixture question ${i+1}`,correct_answer:key,question_type:i===15?'short_answer':'multiple_choice',points:10,accepted_answers:i===15?['cat']:undefined};
  questions.push({id,answer});
  setup+=`insert into assignment_questions(assignment_id,question_id,order_index,question_snapshot) values(${quote(assignment)},${quote(id)},${i+1},${quote(JSON.stringify(snapshot))}::jsonb);\n`;
 }
 for(const s of students.slice(0,count))setup+=`insert into student_assignments(id,assignment_id,student_id,status,assigned_at) values(gen_random_uuid(),${quote(assignment)},${quote(s.id)},'pending',now());\n`;
 sql(setup);sql('analyze;');
 const fixture=`${output}/fixture-${count}.json`;
 writeFileSync(fixture,JSON.stringify({teacher:{token:teacher.token},students:students.slice(0,count).map(s=>({studentId:s.id,token:s.token,assignmentId:assignment,questions,expectedCorrect,expectedScore:expectedCorrect*10}))}),{mode:0o600});
 console.log(`Starting ${count} concurrent students + one teacher`);
 const started=new Date().toISOString();
 const run=spawnSync(k6,['run','--summary-export',`${output}/summary-${count}.json`,'load-tests/classroom.js'],{stdio:'inherit',env:{...process.env,SUPABASE_URL:base,SUPABASE_ANON_KEY:info.ANON_KEY,LOCAL_CLASSROOM_TEST:'1',CLASSROOM_FIXTURE:fixture,STUDENTS:String(count)},timeout:12*60*1000});
 const actual=JSON.parse(sql(`select json_build_object('answers',(select count(*) from student_assignment_answers where assignment_id=${quote(assignment)}),'results',(select count(*) from student_assignment_results where assignment_id=${quote(assignment)}),'completed',(select count(*) from student_assignments where assignment_id=${quote(assignment)} and status='completed'),'wrong_results',(select count(*) from student_assignment_results where assignment_id=${quote(assignment)} and (score<>${expectedCorrect*10} or correct<>${expectedCorrect} or incorrect<>${16-expectedCorrect} or pending_review_count<>0)),'duplicate_answers',(select count(*) from (select student_id,question_id from student_assignment_answers where assignment_id=${quote(assignment)} group by student_id,question_id having count(*)<>1) d));`));
 cumulative+=count;
 const teacherResult=await fetch(base+'/rest/v1/rpc/rpc_teacher_assignment_success_summary',{method:'POST',headers:{apikey:info.ANON_KEY,Authorization:'Bearer '+teacher.token,'Content-Type':'application/json'},body:'{}'});
 const summary=await teacherResult.json();
 const verified=actual.answers===count*16&&actual.results===count&&actual.completed===count&&actual.wrong_results===0&&actual.duplicate_answers===0&&teacherResult.status===200&&summary.submission_count===cumulative;
 const stage={students:count,started,finished:new Date().toISOString(),k6ExitCode:run.status,database:actual,teacherSubmissionCount:summary.submission_count,expectedTeacherSubmissions:cumulative,passed:run.status===0&&verified};
 report.stages.push(stage);writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify(stage));
 if(!stage.passed){console.error('Stage failed: escalation stopped.');process.exitCode=1;break;}
}
