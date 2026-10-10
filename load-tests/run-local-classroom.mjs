// Execute on a disposable Docker-capable host. Never accepts a hosted URL.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {request} from 'node:http';
import os from 'node:os';
import {resolve} from 'node:path';
const info=JSON.parse(readFileSync(process.argv[2],'utf8'));
const base=(info.API_URL||'').replace(/\/$/,'');
if(!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(base))throw Error('Only the disposable loopback Supabase stack is accepted');
if(!info.ANON_KEY||!info.SERVICE_ROLE_KEY)throw Error('Local Auth keys missing');
const output=resolve(process.argv[3]);mkdirSync(output,{recursive:true,mode:0o700});
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
let teacher,students,school,year,klass,teacherId;
if(process.env.LOCAL_CLASSROOM_REUSE_FIXTURE){
 const saved=JSON.parse(readFileSync(process.env.LOCAL_CLASSROOM_REUSE_FIXTURE,'utf8'));
 teacher={token:saved.teacher.token};
 const identity=await fetch(base+'/auth/v1/user',{headers:{apikey:info.ANON_KEY,Authorization:'Bearer '+teacher.token},signal:AbortSignal.timeout(20000)});
 if(!identity.ok)throw Error('Reused teacher session invalid');teacher.id=(await identity.json()).id;
 students=saved.students.map(s=>({id:s.studentId,token:s.token}));
 if(students.length!==500||new Set(students.map(s=>s.id)).size!==500)throw Error('Reuse requires 500 distinct synthetic students');
 const context=JSON.parse(sql(`select json_build_object('teacherId',t.id,'school',a.school_id,'year',a.academic_year_id,'klass',a.class_id) from teachers t join assignments a on a.teacher_id=t.id where t.user_id=${quote(teacher.id)} order by a.assigned_at desc limit 1;`));
 ({teacherId,school,year,klass}=context);
 if(![teacherId,school,year,klass].every(v=>/^[0-9a-f-]{36}$/.test(v)))throw Error('Invalid local reuse context');
 console.log('Reusing 500 existing synthetic password-issued sessions; each stage gets a fresh assignment');
}else{
teacher=await account('teacher');
students=[];
for(let start=0;start<500;start+=5){
 students.push(...await Promise.all(Array.from({length:Math.min(5,500-start)},(_,n)=>account(start+n))));
 if(start%100===0)console.log(`Prepared ${Math.min(start+5,500)}/500 synthetic Auth users`);
}
school=randomUUID();year=randomUUID();klass=randomUUID();teacherId=randomUUID();
let seed=`insert into schools values(${quote(school)},'Synthetic load school',null);
insert into school_academic_years(id,school_id,name,status) values(${quote(year)},${quote(school)},'Synthetic current year','current');
insert into classes(id,school_id,class_code,is_active) values(${quote(klass)},${quote(school)},'LOAD',true);
insert into teachers(id,user_id,verified) values(${quote(teacherId)},${quote(teacher.id)},true);
insert into class_teacher_assignments(id,school_id,class_id,teacher_user_id,subject,active) values(gen_random_uuid(),${quote(school)},${quote(klass)},${quote(teacher.id)},'ESL',true);\n`;
for(const [i,u] of [teacher,...students].entries()){
 seed+=`insert into users(id,email,username,role,school_id,needs_setup,tutorial_completed,is_banned) values(${quote(u.id)},${quote(u.email)},'Synthetic-${nonce}-${i}',${quote(i===0?'teacher':'student')},${quote(school)},false,true,false);\n`;
 seed+=`insert into school_members values(gen_random_uuid(),${quote(u.id)},${quote(school)},'active',${quote(i===0?'teacher':'student')},false,${i===0},now());\n`;
 if(i>0)seed+=`insert into class_students values(${quote(klass)},${quote(u.id)},now());\n`;
}
sql(seed);
}
const rpcFiles=['20260928055401_classroom_reliability.sql','20260928163701_auth_bootstrap_v1.sql','20261007153922_classroom_scoped_reads.sql'];
const report={scope:'Local Supabase classroom RPC benchmark; focused schema, no production capacity certification',versions:{node:process.version,source:process.env.CLASSROOM_SOURCE_SHA||spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),rpcSha256:Object.fromEntries(rpcFiles.map(f=>[f,createHash('sha256').update(readFileSync('supabase/migrations/'+f)).digest('hex')]))},host:{platform:os.platform(),cpuModel:os.cpus()[0].model,cpuCount:os.cpus().length,memoryBytes:os.totalmem()},limitations:['Focused classroom schema; unrelated tables, production analytics/reward triggers and billing pre-request hook omitted','Synthetic data: 500 students, one teacher, 16 questions per fresh assignment','Real Supabase Auth users and password-issued sessions; signup/login provisioning is outside the measured load','Loopback HTTP; no WAN/CDN/TLS latency, browser rendering or hosted connection limits','Load generator and database share the test host; results do not certify hosted production capacity'],stages:[]};
report.initialDatabaseRows=JSON.parse(sql("select json_build_object('users',(select count(*) from users),'assignments',(select count(*) from assignments),'answers',(select count(*) from student_assignment_answers),'results',(select count(*) from student_assignment_results));"));
// A synchronous k6 child can leave a Node fetch keep-alive socket idle for two
// minutes while preventing its close event from being processed. Reconcile over
// a fresh HTTP connection, with a timeout, instead of reusing that socket.
function teacherSummary(){return new Promise((resolve,reject)=>{
 const req=request(base+'/rest/v1/rpc/rpc_teacher_assignment_success_summary',{method:'POST',agent:false,headers:{apikey:info.ANON_KEY,Authorization:'Bearer '+teacher.token,'Content-Type':'application/json'}},res=>{
  let text='';res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk;});res.on('error',reject);res.on('end',()=>{try{resolve({status:res.statusCode,data:JSON.parse(text)});}catch(error){reject(error);}});
 });
 req.on('error',reject);req.setTimeout(20000,()=>req.destroy(Error('Teacher reconciliation timeout')));req.end('{}');
});}
const baseline=await teacherSummary();
if(baseline.status!==200||!Number.isInteger(baseline.data.submission_count))throw Error('Teacher baseline unavailable');
let cumulative=baseline.data.submission_count;report.initialTeacherSubmissions=cumulative;report.reusedSyntheticSessions=!!process.env.LOCAL_CLASSROOM_REUSE_FIXTURE;
report.versions.harnessSha256=createHash('sha256').update(readFileSync('load-tests/classroom.js')).digest('hex');
report.versions.runnerSha256=createHash('sha256').update(readFileSync('load-tests/run-local-classroom.mjs')).digest('hex');
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
 const actual=JSON.parse(sql(`select json_build_object('answers',(select count(*) from student_assignment_answers where assignment_id=${quote(assignment)}),'results',(select count(*) from student_assignment_results where assignment_id=${quote(assignment)}),'completed',(select count(*) from student_assignments where assignment_id=${quote(assignment)} and status='completed'),'wrong_results',(select count(*) from student_assignment_results where assignment_id=${quote(assignment)} and (score IS DISTINCT FROM ${expectedCorrect*10} or correct IS DISTINCT FROM ${expectedCorrect} or incorrect IS DISTINCT FROM ${16-expectedCorrect} or pending_review_count IS DISTINCT FROM 0)),'duplicate_answers',(select count(*) from (select student_id,question_id from student_assignment_answers where assignment_id=${quote(assignment)} group by student_id,question_id having count(*)<>1) d));`));
 cumulative+=count;
 let teacherResult,reconciliationError;
 try{teacherResult=await teacherSummary();}catch(error){reconciliationError=error.message;}
 const summary=teacherResult?.data||{};
 const verified=actual.answers===count*16&&actual.results===count&&actual.completed===count&&actual.wrong_results===0&&actual.duplicate_answers===0&&teacherResult?.status===200&&summary.submission_count===cumulative;
 const stage={students:count,started,finished:new Date().toISOString(),k6ExitCode:run.status,database:actual,teacherSubmissionCount:summary.submission_count,expectedTeacherSubmissions:cumulative,reconciliationError,passed:run.status===0&&verified};
 report.stages.push(stage);writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify(stage));
 if(!stage.passed){console.error('Stage failed: escalation stopped.');process.exitCode=1;break;}
}
