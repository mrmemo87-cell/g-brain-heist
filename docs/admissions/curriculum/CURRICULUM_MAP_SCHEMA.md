# Curriculum Map Schema

The machine schema lives at `supabase/seed/admission-official-bank/curriculum-maps/schema.json`.

Each production map requires `map_id`, `map_version`, `locked: true`, explicit `grade_stage_mapping`, and objective records. Cambridge-linked objectives keep Cambridge programme/stage/source metadata. Brain Heist International maps use `curriculum_authority: "brain_heist"`, `programme: "brain_heist_international"`, `assessment_style: "international_school_admission"`, `official_affiliation: "none"`, approved public `reference_frameworks`, `source_references`, `source_licences`, `copyright_policy: "original_questions_only"`, `source_review_status`, and `academic_review_status`.

Grade 10 maps additionally require exact `igcse_syllabus_code`, `igcse_subject_name`, `igcse_pathway`, `syllabus_year`, and `examination_year` metadata.
