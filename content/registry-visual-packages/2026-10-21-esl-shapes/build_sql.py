#!/usr/bin/env python3
"""Turn manifest.json into the registry package (package.json) and the
one-transaction apply.sql that inserts the picture questions.

The SQL mirrors public.rpc_import_registry_verified_mcq_package exactly, adding
image_url and image_alt_text, because the importer has no image field and
image_url is part of the immutable content hash.
"""
import hashlib, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
m = json.load(open(os.path.join(HERE, "manifest.json")))

PREC = ("eng.writing.vocabulary-control", "eng.writing.vocabulary-control.precision",
        "eng.writing.vocabulary-control.precision.focus.core-demonstration")
SEM = ("eng.use-of-english.lexical-patterns", "eng.use-of-english.lexical-patterns.semantic-relations",
       "eng.use-of-english.lexical-patterns.semantic-relations.focus.core-demonstration")
def T(codes, ao, cog, stmt):
    return {"primarySkillCode": codes[0], "atomicSubskillCode": codes[1], "evidenceFocusCode": codes[2],
            "assessmentProcessCode": ao, "cognitiveProcess": cog, "evidenceStatement": stmt}
TAX = {
 "shape-und": T(PREC, "BH-AO1", "understand", "Understands the defining features of a named shape well enough to identify it from a drawing or real-world object."),
 "shape-rem": T(PREC, "BH-AO1", "remember", "Recalls the names of the parts of a solid (face, edge, vertex) from a marked diagram."),
 "shape-net": T(PREC, "BH-AO2", "apply", "Applies shape vocabulary to name the solid that a flat net folds into."),
 "shape-class": T(SEM, "BH-AO3", "analyze", "Distinguishes flat 2D shape words from solid 3D shape words and links each flat shape to its solid."),
}
TIME = {"easy": 60, "medium": 60, "hard": 75}

qs = []
for n, e in enumerate(m, 1):
    q = e["question"]
    role = "recheck" if n % 3 == 0 else "practice"
    tags = ["ESL", "grade-7", "grade-8", "geometry vocabulary", "2D and 3D shapes"] + q["tags"] + [role, q["difficulty"]]
    seen = set(); tags = [t for t in tags if not (t in seen or seen.add(t))]
    qs.append({
        "externalId": f"esl-g7-shapes-visual-20261021-{n:02d}",
        "topic": "3D Shapes and Geometry Vocabulary",
        "questionText": q["text"], "questionType": "multiple_choice",
        "options": q["options"], "correctAnswer": q["answer"], "explanation": q["explanation"],
        "difficulty": q["difficulty"], "points": 1, "timeLimit": TIME[q["difficulty"]], "language": "en",
        "eligibleGrades": [7, 8], "tags": tags,
        "hints": ["Count the faces and check whether they are flat or curved."],
        "taxonomies": [TAX[k] for k in q["taxonomy"]],
        "imageUrl": e["asset"]["url"], "imageAltText": q["alt"], "imageSha256": e["asset"]["sha256"],
    })

pkg = {"schemaVersion": 1, "packageId": "esl-g7-shapes-visual-20261021", "packageVersion": "1.0.0",
       "contentVersion": "esl-g7-shapes-visual-v1", "registryVersion": "bh-english-core-v1", "subjectCode": "english",
       "authority": "Brains Heist Academic Governance",
       "releaseNotes": f"{len(qs)} original picture-based MCQs for Grades 7-8 ESL (3D Shapes and Geometry Vocabulary): name the solid, labelled lineups, everyday objects, face/edge/vertex, nets, 2D vs 3D. 27 checksum-addressed SVGs under /question-assets/2026-10-21/. MCQ evidence only.",
       "questions": qs}
text = json.dumps(pkg, ensure_ascii=True, separators=(",", ":"))
assert "$pkg$" not in text
open(os.path.join(HERE, "package.json"), "w").write(json.dumps(pkg, ensure_ascii=False, indent=1))

SQL = r"""-- One-transaction insert of the ESL shapes picture questions. Rehearse with rollback first.
begin;
create temporary table shapes_visual_pkg(t text, p jsonb) on commit drop;
insert into shapes_visual_pkg(t) values ($pkg$__PKG__$pkg$);
do $do$ begin
  if (select md5(t) from shapes_visual_pkg) <> '__MD5__' then raise exception 'shapes_visual_package_text_altered'; end if;
end $do$;
update shapes_visual_pkg set p = t::jsonb;

-- 1. Validate everything with the governed importer (images stripped), dry run only.
do $do$
declare v_pkg jsonb; v_res jsonb;
begin
  select p into v_pkg from shapes_visual_pkg;
  v_res := public.rpc_import_registry_verified_mcq_package(
    jsonb_set(v_pkg,'{questions}',(select jsonb_agg(q - 'imageUrl' - 'imageAltText' - 'imageSha256' order by o)
      from jsonb_array_elements(v_pkg->'questions') with ordinality x(q,o))), true);
  if not coalesce((v_res->>'success')::boolean,false) or (v_res->>'alreadyImported')::boolean then
    raise exception 'shapes_visual_dry_run_failed:%', v_res;
  end if;
end $do$;

-- 2. Insert exactly as the importer would, with the image in the content hash.
do $do$
declare
  v_pkg jsonb; v_q jsonb; v_tx jsonb; v_reg public.academic_skill_registry_versions%rowtype;
  v_subj public.academic_subjects%rowtype; v_skill public.academic_skill_registry_nodes%rowtype;
  v_sub public.academic_skill_registry_nodes%rowtype; v_focus public.academic_skill_evidence_focuses%rowtype;
  v_strand public.academic_skill_registry_nodes%rowtype; v_p0 jsonb; v_id uuid; v_hash text; v_ext text;
  v_grades smallint[]; v_cv text; v_auth text; v_qn int := 0; v_tn int := 0; v_md5 text;
begin
  select p into v_pkg from shapes_visual_pkg;
  if exists(select 1 from public.registry_verified_question_import_releases where package_id=v_pkg->>'packageId') then
    raise exception 'shapes_visual_already_released'; end if;
  v_cv := v_pkg->>'contentVersion'; v_auth := v_pkg->>'authority';
  select * into strict v_reg from public.academic_skill_registry_versions where code=v_pkg->>'registryVersion' and status='published';
  select * into strict v_subj from public.academic_subjects where code=v_pkg->>'subjectCode' and is_active;
  for v_q in select value from jsonb_array_elements(v_pkg->'questions') loop
    v_ext := v_q->>'externalId';
    if (v_q->>'imageUrl') !~ '^https://www\.brainsheist\.com/question-assets/2026-10-21/[a-z0-9-]+\.[0-9a-f]{12}\.svg$'
       or position(substr(v_q->>'imageSha256',1,12) in v_q->>'imageUrl')=0
       or length(trim(v_q->>'imageAltText')) not between 20 and 240 then
      raise exception 'shapes_visual_invalid_image:%', v_ext; end if;
    select array_agg(distinct g::smallint order by g::smallint) into v_grades from jsonb_array_elements_text(v_q->'eligibleGrades') g;
    v_p0 := v_q->'taxonomies'->0;
    select * into strict v_skill from public.academic_skill_registry_nodes where registry_version_id=v_reg.id and code=v_p0->>'primarySkillCode' and node_type='skill' and status='active';
    select * into strict v_sub from public.academic_skill_registry_nodes where registry_version_id=v_reg.id and code=v_p0->>'atomicSubskillCode' and parent_id=v_skill.id and node_type='subskill' and status='active';
    select * into strict v_strand from public.academic_skill_registry_nodes where id=v_skill.parent_id and registry_version_id=v_reg.id and node_type='strand' and status='active';
    v_md5 := md5('registry-verified-question:'||v_ext);
    v_id := (substr(v_md5,1,8)||'-'||substr(v_md5,9,4)||'-'||substr(v_md5,13,4)||'-'||substr(v_md5,17,4)||'-'||substr(v_md5,21,12))::uuid;
    v_hash := private.question_content_hash(v_id, v_q->>'questionText', v_q->'options', v_q->>'correctAnswer', v_q->>'explanation', v_q->>'imageUrl', 'multiple_choice');
    insert into public.questions(
      id,teacher_id,subject,subject_id,topic,topic_name,difficulty,question_text,question_type,options,correct_answer,explanation,hints,
      time_limit,points,tags,grade_level,grade,lang,is_public,is_active,academic_subject_id,curriculum_strand,curriculum_skill,curriculum_subskill,
      curriculum_objective,eligible_grade_levels,curriculum_review_status,content_origin,pool_scope,owner_school_id,verification_status,
      analytics_eligible,verified_at,verified_by,verified_by_authority,verified_content_hash,content_version,content_revision,verified_external_id,
      image_url,image_alt_text
    ) values (
      v_id,null,v_subj.name,v_subj.code,v_q->>'topic',v_q->>'topic',v_q->>'difficulty',v_q->>'questionText','multiple_choice',v_q->'options',
      v_q->>'correctAnswer',v_q->>'explanation',array(select jsonb_array_elements_text(v_q->'hints')),(v_q->>'timeLimit')::int,1,
      array(select jsonb_array_elements_text(v_q->'tags')),'Grade '||v_grades[1]::text,v_grades[1],'en',true,true,v_subj.id,
      v_strand.name,v_skill.name,v_sub.name,v_p0->>'evidenceStatement',v_grades,'approved','brain_heist','global',null,'verified',
      true,now(),null,v_auth,v_hash,v_cv,1,v_ext,v_q->>'imageUrl',v_q->>'imageAltText');
    v_qn := v_qn + 1;
    for v_tx in select value from jsonb_array_elements(v_q->'taxonomies') loop
      select * into strict v_skill from public.academic_skill_registry_nodes where registry_version_id=v_reg.id and code=v_tx->>'primarySkillCode' and node_type='skill' and status='active';
      select * into strict v_sub from public.academic_skill_registry_nodes where registry_version_id=v_reg.id and code=v_tx->>'atomicSubskillCode' and parent_id=v_skill.id and node_type='subskill' and status='active';
      select * into strict v_focus from public.academic_skill_evidence_focuses where registry_version_id=v_reg.id and atomic_subskill_node_id=v_sub.id and code=v_tx->>'evidenceFocusCode' and status='active';
      insert into public.verified_question_registry_taxonomy(question_id,question_content_hash,registry_version_id,primary_skill_node_id,
        atomic_subskill_node_id,evidence_focus_id,taxonomy_version,assessment_process_code,cognitive_process,evidence_statement,confidence_score,
        review_status,human_review_required,source_method,reviewed_by_authority,taxonomy_hash)
      values (v_id,v_hash,v_reg.id,v_skill.id,v_sub.id,v_focus.id,v_cv||':'||v_ext,v_tx->>'assessmentProcessCode',v_tx->>'cognitiveProcess',
        v_tx->>'evidenceStatement',1,'approved',false,'verified_package_import',v_auth,'pending');
      v_tn := v_tn + 1;
    end loop;
  end loop;
  insert into public.registry_verified_question_import_releases(package_id,package_version,schema_version,content_version,registry_version_id,
    academic_subject_id,package_hash,question_count,taxonomy_count,assessment_profile_count,release_notes,imported_by_authority)
  values (v_pkg->>'packageId',v_pkg->>'packageVersion',1,v_cv,v_reg.id,v_subj.id,encode(extensions.digest(v_pkg::text,'sha256'),'hex'),
    v_qn,v_tn,0,v_pkg->>'releaseNotes',v_auth);
  raise notice 'inserted % questions, % taxonomy rows', v_qn, v_tn;
end $do$;
set constraints all immediate;
__END__;
"""
for end, name in (("rollback", "rehearse.sql"), ("commit", "apply.sql")):
    open(os.path.join(HERE, name), "w").write(SQL.replace("__PKG__", text).replace("__MD5__", hashlib.md5(text.encode()).hexdigest()).replace("__END__", end))
print(len(qs), "questions;", sum(len(q["taxonomies"]) for q in qs), "taxonomy rows; sql bytes", len(SQL) + len(text))
