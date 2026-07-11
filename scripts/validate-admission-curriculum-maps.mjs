#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.resolve(__dirname, '..', 'supabase', 'seed', 'admission-official-bank', 'curriculum-maps');
const BROAD = new Set(['number and operations','biology','living things','biology / living things','biology living things','chemistry','materials','chemistry / materials','chemistry materials','earth and space','grammar','reading']);
const SUBJECT_CODES = { english: new Set(['ENG','CAM_PRIMARY_ENGLISH','CAM_LOWER_SECONDARY_ENGLISH','IGCSE_ENGLISH']), maths: new Set(['MAT','MATHS','CAM_PRIMARY_MATHS','CAM_LOWER_SECONDARY_MATHS','IGCSE_MATHS']), science: new Set(['SCI','CAM_PRIMARY_SCIENCE','CAM_LOWER_SECONDARY_SCIENCE','IGCSE_SCIENCE']) };
const APPROVED_SOURCE = new Set(['approved']);
const PUBLIC_FRAMEWORKS = new Set(['CEFR','England National Curriculum','Common Core','NGSS','other reviewed public national or international standards']);

function normalize(v){return String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function isBlank(v){return String(v??'').trim().length===0;}
function files(dir){let out=[]; for(const n of readdirSync(dir)){const p=path.join(dir,n); const s=statSync(p); if(s.isDirectory()) out=out.concat(files(p)); else if(n.endsWith('.json')&&n!=='schema.json'&&!n.endsWith('.template.json')) out.push(p);} return out;}
function programmeForGrade(g){if(g>=1&&g<=6)return 'Cambridge Primary'; if(g>=7&&g<=9)return 'Cambridge Lower Secondary'; if(g===10)return 'Cambridge IGCSE'; return null;}
function expectedStage(g){return g===10?null:g;}
function addCoverage(coverage,o){ if(o.subject) coverage.subjects.add(o.subject); if(o.school_grade!==undefined) coverage.grades.add(String(o.school_grade)); }
function modeFor(map, objective){
  const programme = String(objective?.programme ?? map?.programme ?? map?.grade_stage_mapping?.programme ?? '');
  if (programme === 'brain_heist_international' || map?.curriculum_authority === 'brain_heist') return 'brain_heist_international';
  return 'cambridge_linked';
}
function approvedObjective(o, mode){
  if(mode === 'brain_heist_international') return o.source_review_status === 'approved' && o.academic_review_status === 'approved';
  return o.source_status === 'approved' && o.review_status === 'approved';
}
function requireArray(errors, loc, value, field){ if(!Array.isArray(value)||value.length===0) errors.push(`${loc}: missing ${field}`); }

export function validateAdmissionCurriculumMaps(root=DEFAULT_DIR, options={}){
  const errors=[]; const allFiles=files(root); const coverage={subjects:new Set(),grades:new Set()}; let objectivesChecked=0;
  if(allFiles.length===0 && !options.allowEmpty) errors.push(`${root}: no production curriculum-map files discovered; use --allow-empty only for schema-only or empty-fixture checks`);
  for(const file of allFiles){
    let map; try{map=JSON.parse(readFileSync(file,'utf8'));}catch(e){errors.push(`${file}: invalid JSON: ${e.message}`); continue;}
    const mapMode = modeFor(map, null);
    if(isBlank(map.map_id)) errors.push(`${file}: missing map_id`);
    if(isBlank(map.map_version)) errors.push(`${file}: missing map_version`);
    if(map.locked!==true) errors.push(`${file}: map must be locked before generation`);
    const mapping=map.grade_stage_mapping;
    if(!mapping || mapping.explicit!==true) errors.push(`${file}: grade/stage mismatch guard requires grade_stage_mapping.explicit=true`);
    if(mapMode === 'brain_heist_international'){
      if(map.curriculum_authority !== 'brain_heist') errors.push(`${file}: brain_heist_international map requires curriculum_authority brain_heist`);
      if(map.programme !== 'brain_heist_international' && mapping?.programme !== 'brain_heist_international') errors.push(`${file}: brain_heist_international map requires programme brain_heist_international`);
      if(map.assessment_style !== 'international_school_admission') errors.push(`${file}: brain_heist_international map requires assessment_style international_school_admission`);
      if(map.official_affiliation !== 'none') errors.push(`${file}: brain_heist_international map requires official_affiliation none`);
      requireArray(errors, file, map.reference_frameworks, 'reference_frameworks');
      for(const fw of Array.isArray(map.reference_frameworks)?map.reference_frameworks:[]) if(!PUBLIC_FRAMEWORKS.has(fw)) errors.push(`${file}: unreviewed reference_framework ${fw}`);
      requireArray(errors, file, map.source_references, 'source_references');
      requireArray(errors, file, map.source_licences, 'source_licences');
      if(map.copyright_policy !== 'original_questions_only') errors.push(`${file}: brain_heist_international map requires copyright_policy original_questions_only`);
      if(map.source_review_status !== 'approved') errors.push(`${file}: unapproved source_review_status ${map.source_review_status}`);
      if(map.academic_review_status !== 'approved') errors.push(`${file}: unapproved academic_review_status ${map.academic_review_status}`);
    }
    const objectives=Array.isArray(map.objectives)?map.objectives:[];
    objectivesChecked+=objectives.length;
    if(!Array.isArray(map.objectives)) errors.push(`${file}: objectives must be an array`);
    const ids=new Map(); const learner=new Map();
    objectives.forEach((o,i)=>{
      addCoverage(coverage,o);
      const loc=`${file}: objectives[${i}]`; const mode = modeFor(map, o);
      const common=['school_grade','programme','typical_age_min','typical_age_max','subject','objective_id','strand','subskill','learner_can','prerequisites','prohibited_extensions','allowed_question_types','allowed_difficulties','allowed_cognitive_levels'];
      const req = mode === 'brain_heist_international'
        ? [...common,'level_definition','prerequisite_definition','source_references','source_review_status','academic_review_status']
        : [...common,'cambridge_stage','subject_code','source_version','source_status','source_reference','review_status'];
      for(const k of req) if(!(k in o)) errors.push(`${loc}: missing ${k}`);
      if(isBlank(o.objective_id)) errors.push(`${loc}: missing objective_id`); else if(ids.has(o.objective_id)) errors.push(`${loc}: duplicate objective_id ${o.objective_id}`); else ids.set(o.objective_id,i);
      if(!Number.isFinite(o.typical_age_min)||!Number.isFinite(o.typical_age_max)) errors.push(`${loc}: missing age range`);
      if(mode === 'brain_heist_international'){
        if(o.programme !== 'brain_heist_international') errors.push(`${loc}: invalid programme for Brain Heist International map`);
        requireArray(errors, loc, o.source_references, 'source_references');
        if(o.source_review_status !== 'approved') errors.push(`${loc}: unapproved source_review_status ${o.source_review_status}`);
        if(o.academic_review_status !== 'approved') errors.push(`${loc}: unapproved academic_review_status ${o.academic_review_status}`);
        if(isBlank(o.level_definition)) errors.push(`${loc}: missing level_definition`);
        if(isBlank(o.prerequisite_definition)) errors.push(`${loc}: missing prerequisite_definition`);
      } else {
        if(isBlank(o.source_reference)) errors.push(`${loc}: missing source_reference`);
        if(!APPROVED_SOURCE.has(o.source_status)) errors.push(`${loc}: unapproved source_status ${o.source_status}`);
        if(o.review_status !== 'approved') errors.push(`${loc}: unapproved review_status ${o.review_status}`);
        const expectedProgramme=programmeForGrade(o.school_grade);
        if(expectedProgramme && o.programme!==expectedProgramme && o.programme !== 'cambridge_igcse') errors.push(`${loc}: invalid programme for grade ${o.school_grade}`);
        if(o.school_grade!==10 && expectedStage(o.school_grade)!==o.cambridge_stage) errors.push(`${loc}: grade/stage mismatch without explicit normal mapping`);
        if(o.school_grade===10 && (o.programme === 'Cambridge IGCSE' || o.programme === 'cambridge_igcse')){
          if(o.cambridge_stage===10 || String(o.cambridge_stage).toLowerCase()==='stage 10') errors.push(`${loc}: Grade 10 must not use generic Stage 10`);
          for(const k of ['igcse_syllabus_code','igcse_subject_name','igcse_pathway','syllabus_year','examination_year']) if(isBlank(o[k])) errors.push(`${loc}: Grade 10 missing exact IGCSE ${k}`);
          if(!String(o.subject_code ?? '').startsWith('IGCSE_')) errors.push(`${loc}: invalid programme/subject code combination`);
        }
        if(!SUBJECT_CODES[o.subject]?.has(o.subject_code)) errors.push(`${loc}: invalid programme/subject code combination`);
      }
      if(isBlank(o.subskill)||BROAD.has(normalize(o.subskill))) errors.push(`${loc}: blank or broad-only subskill`);
      if(isBlank(o.learner_can)) errors.push(`${loc}: objectives require learner_can statement`);
      const nl=normalize(o.learner_can); if(nl){ if(learner.has(nl)) errors.push(`${loc}: duplicate normalized learner_can statement`); else learner.set(nl,i); }
      for(const k of ['allowed_question_types','allowed_difficulties','allowed_cognitive_levels']) if(!Array.isArray(o[k])||o[k].length===0) errors.push(`${loc}: missing ${k}`);
      if(!Array.isArray(o.prohibited_extensions)) errors.push(`${loc}: missing prohibited_extensions field`);
      if(!Array.isArray(o.prerequisites)) errors.push(`${loc}: prerequisites must be an array`);
      if(!approvedObjective(o, mode)) errors.push(`${loc}: objective is not approved for ${mode} use`);
    });
    objectives.forEach((o,i)=>{ for(const pre of (Array.isArray(o.prerequisites)?o.prerequisites:[])){ if(ids.has(pre)&&ids.get(pre)>i) errors.push(`${file}: objective progression places prerequisite ${pre} after dependent objective ${o.objective_id}`); }});
  }
  return { ok: errors.length===0, errors, filesChecked: allFiles.length, objectivesChecked, subjects:[...coverage.subjects].sort(), grades:[...coverage.grades].sort((a,b)=>Number(a)-Number(b)) };
}

export function formatAdmissionCurriculumMapResult(result){
  const lines=[`Admission curriculum map validation checked ${result.filesChecked} map file${result.filesChecked===1?'':'s'} and ${result.objectivesChecked} objective${result.objectivesChecked===1?'':'s'}.`, `Subjects covered: ${result.subjects.length?result.subjects.join(', '):'none'}.`, `Grades covered: ${result.grades.length?result.grades.join(', '):'none'}.`];
  if(!result.ok) lines.push(`Validation errors (${result.errors.length}):`, ...result.errors.map((e)=>`- ${e}`));
  return lines.join('\n');
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2); const allowEmpty=args.includes('--allow-empty'); const positional=args.filter((a)=>!a.startsWith('--'));
  const result=validateAdmissionCurriculumMaps(positional[0]?path.resolve(positional[0]):DEFAULT_DIR,{allowEmpty});
  console[result.ok?'log':'error'](formatAdmissionCurriculumMapResult(result));
  if(!result.ok) process.exit(1);
}
