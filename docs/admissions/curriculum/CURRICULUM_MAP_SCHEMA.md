# Curriculum Map Schema

The machine schema lives at `supabase/seed/admission-official-bank/curriculum-maps/schema.json`.

Each production map requires `map_id`, `map_version`, `locked: true`, explicit `grade_stage_mapping`, and objective records. Each objective requires: `school_grade`, `programme`, `cambridge_stage`, `typical_age_min`, `typical_age_max`, `subject`, `subject_code`, `source_version`, `source_status`, `objective_id`, `strand`, `subskill`, `learner_can`, `prerequisites`, `prohibited_extensions`, `allowed_question_types`, `allowed_difficulties`, `allowed_cognitive_levels`, `source_reference`, and `review_status`.

Grade 10 maps additionally require exact `igcse_syllabus_code`, `igcse_subject_name`, `igcse_pathway`, `syllabus_year`, and `examination_year` metadata.
