// Local-only synthetic evidence. This fixture never reads or mutates production student data.
import React from 'react';
import {createRoot} from 'react-dom/client';
import '../src/index.css';
import '../src/styles/teacher-theme.css';
import '../components/student-progress/AcademicProfileWorkspace.css';
const names=['Question formation','Negation','Quantifiers','Countability and noun number','Past-time verb forms','Pronoun reference','Articles and determiners','Addition and sequence','Regular and irregular verb forms','Prepositions','Possession','Adjective and adverb form','Ability and permission','Cause and effect','Contrast and concession','Simple versus progressive aspect'];
const counts=[4,3,2,2,2,2,2,2,2,2,1,1,1,1,1,0];
const rows=names.map((name,i)=>[name,counts[i],i===15?2:0] as const);
const timestamp='2026-09-29T09:57:50Z';
const timeline=rows.flatMap(([subskill,correct,incorrect],idx)=>Array.from({length:correct+incorrect},(_,q)=>({id:`${String(idx).padStart(2,'0')}-${q}`,subject:'English',skill:'Language use',subskill,source_type:'assignment_result',source_id:'assessment-a',observed_at:timestamp,evidence_percentage:q<correct?100:0,evidence_count:1,observation_type:q<correct?'strength':'focus',evidence:{correct:q<correct?1:0,incorrect:q<correct?0:1,assignment_title:'Quick Diagnostic',evidence_focus_code:`focus-${idx}`,evidence_focus_name:`${subskill} — example ${q+1}`,evidence_statement:'Apply this skill in a contextual question.'}})));
const profile:any={student:{id:'fixture-student',school_id:'fixture-school',name:'Ildar Kanybekov',grade:7,class_name:'7A'},scope:{viewer:'teacher',allowed_subjects:['English'],subject_aliases:{esl:'English'},academic_year_name:'2026/2027'},summary:{subjects_tracked:1,completed_assignments:1,assignment_average:93.33,persistent_focus_count:0,recurring_focus_count:0,improving_count:0,resolved_count:0,strength_count:0},subjects:[{subject:'English',completed_assignments:1,assignment_average:93.33,persistent_focus_count:0,improving_count:0,resolved_count:0,strength_count:0,latest_evidence_at:timestamp}],assignments:[{assignment_id:'assessment-a',title:'Quick Diagnostic',subject:'English',completed_at:timestamp,correct:28,incorrect:2,accuracy:93.33}],focus_areas:rows.map(([subskill,correct,incorrect],idx)=>({skill_key:`skill-${idx}`,subject:'English',skill:'Language use',subskill,status:'insufficient_evidence',trend:'stable',priority:'low',evidence_items:1,evidence_occurrences:correct+incorrect,latest_evidence_percentage:100*correct/(correct+incorrect),first_observed_at:timestamp,last_observed_at:timestamp})),timeline};
const mode=new URLSearchParams(location.search).get('mode')||'baseline';
if(mode==='empty'){profile.summary.completed_assignments=0;profile.summary.assignment_average=null;profile.timeline=[];profile.assignments=[];profile.focus_areas=[];}
if(mode==='archived')profile.scope.archived=true;
if(mode==='long') {profile.student.name='Ildar Kanybekov Ahmed Mahmoud Abdulkareem';profile.assignments[0].title='Extended quick diagnostic assessment covering several language objectives and evidence contexts';profile.timeline.forEach((r:any)=>r.evidence.assignment_title=profile.assignments[0].title);}
if(['mixed','repeated','multi'].includes(mode)){
 const old=JSON.parse(JSON.stringify(timeline));old.forEach((r:any)=>{r.id=`old-${r.id}`;r.source_id='assessment-b';r.observed_at='2026-09-20T09:00:00Z';});profile.timeline.push(...old);profile.assignments.push({...profile.assignments[0],assignment_id:'assessment-b',completed_at:'2026-09-20T09:00:00Z'});profile.summary.completed_assignments=2;
 profile.focus_areas[15].status='recurring';profile.focus_areas[15].evidence_items=2;
 if(mode==='mixed'){profile.scope.writing_pending_reviews=1;profile.timeline.push({id:'writing-1',subject:'English',skill:'Organisation',subskill:'Paragraphing',source_type:'writing_assessment_review',source_id:'writing-a',observed_at:'2026-10-01T10:00:00Z',evidence_count:1,evidence_percentage:70,observation_type:'developing',evidence:{genre:'letter',evidence_statement:'Use paragraphs to organise the letter.',corrections:[{original:'One long paragraph',better_version:'Separate the introduction and main ideas'}]}});}
 if(mode==='multi'){profile.scope.allowed_subjects.push('Economics');profile.subjects.push({...profile.subjects[0],subject:'Economics'});profile.assignments.push({...profile.assignments[0],assignment_id:'economics',subject:'Economics',title:'Macroeconomics diagnostic'});profile.timeline.push({...profile.timeline[0],id:'economics-skill',subject:'Economics',source_id:'economics',skill:'Macroeconomics',subskill:'Inflation',evidence:{correct:1,incorrect:0,assignment_title:'Macroeconomics diagnostic'}});profile.summary.completed_assignments=3;}
}
const context={viewer:{id:'fixture-teacher',name:'Sobhy Ahmed',role:'teacher'},school:{id:'fixture-school',name:'Silk Road International School',logo_url:'https://fixture.invalid/school-logo.jpg'}};
const originalFetch=window.fetch.bind(window);(window as any).__requests=[];(window as any).__consoleErrors=[];
window.fetch=async(input,options)=>{const url=String(input);if(url.includes('/rest/v1/')||url.includes('/auth/v1/')){let data:any=[];const body=options?.body?JSON.parse(String(options.body)):{};(window as any).__requests.push({url,body});
 if(url.includes('rpc_student_academic_profile')){data=JSON.parse(JSON.stringify(profile));if(body.p_subject){data.assignments=data.assignments.filter((r:any)=>r.subject.toLowerCase()===body.p_subject.toLowerCase());data.timeline=data.timeline.filter((r:any)=>r.subject.toLowerCase()===body.p_subject.toLowerCase());data.focus_areas=data.focus_areas.filter((r:any)=>r.subject.toLowerCase()===body.p_subject.toLowerCase());data.subjects=data.subjects.filter((r:any)=>r.subject.toLowerCase()===body.p_subject.toLowerCase());}if(body.p_date_from){data.assignments=data.assignments.filter((r:any)=>r.completed_at>=body.p_date_from);data.timeline=data.timeline.filter((r:any)=>r.observed_at>=body.p_date_from);data.focus_areas=data.timeline.length?data.focus_areas:[];}data.summary.completed_assignments=data.assignments.length;data.summary.assignment_average=data.assignments.length?93.33:null;}
 else if(url.includes('rpc_academic_progress_experience_context'))data=context;
 else if(url.includes('rpc_student_academic_confidence'))data={confidenceStates:[]};
 else if(url.includes('rpc_student_academic_subjects'))data={subjects:profile.scope.allowed_subjects.map((name:string)=>({name}))};
 else if(url.includes('rpc_academic_reporting_context'))data={years:[{id:'fixture-year',name:'2026/2027',status:'current',starts_on:'2026-09-15',ends_on:'2027-06-30'}],terms:[]};
 else if(url.includes('rpc_teacher_academic_profile_students'))data=[{student_id:'fixture-student',student_name:'Ildar Kanybekov',grade:7,class_name:'7A',subjects:['English']}];
 else if(url.includes('get_my_effective_entitlements'))data={success:true,plan:'school',modules:{core:true,writing:true,cambridge:true},entitlements:Object.fromEntries(['reports','assignments','writing_hub','cambridge_tests','question_bank','custom_questions','clans'].map(k=>[k,{enabled:true}]))};
 else if(url.includes('get_school_plan_details'))data={success:true,plan:'pro',is_active:true,trial_expired:false,seats:{cambridge:60,ielts:60,game:60},current_members:1};
 else if(url.includes('/teachers?'))data={id:'fixture-teacher',user_id:'fixture-teacher',school_id:'fixture-school',school_name:context.school.name};
 else if(url.includes('/schools?'))data={id:'fixture-school',name:context.school.name,logo_url:context.school.logo_url};
 else if(url.includes('/auth/v1/user'))data={id:'fixture-teacher',email:'fixture@example.invalid'};
 return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});}
 return originalFetch(input,options);};
const prior=console.error;console.error=(...args)=>{(window as any).__consoleErrors.push(args.map(String).join(' '));prior(...args);};
const {supabase}=await import('../services/supabaseClient.ts');
(supabase.auth as any).getUser=async()=>({data:{user:{id:'fixture-teacher'}},error:null});
(supabase.auth as any).getSession=async()=>({data:{session:{user:{id:'fixture-teacher'}}},error:null});

 const {default:Shell}=await import('../components/TeacherPortalShell.tsx');
 createRoot(document.getElementById('root')!).render(<Shell profile={{id:'fixture-teacher',username:'Sobhy Ahmed',role:'teacher',school_id:'fixture-school',school_name:context.school.name,school_logo_url:context.school.logo_url,level:1,xp:0,coins:0} as any} onComplete={()=>{}}/>);
