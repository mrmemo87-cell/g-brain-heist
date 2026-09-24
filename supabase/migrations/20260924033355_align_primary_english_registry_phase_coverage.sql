update public.academic_skill_registry_nodes
set applicable_phases=array['primary','lower_secondary','upper_secondary']::text[],updated_at=now()
where code in (
  'eng.writing.purpose-register.register-tone',
  'eng.reading.vocabulary-context.nuance',
  'eng.writing.sentence-control.subordination',
  'eng.use-of-english.voice-causative',
  'eng.use-of-english.voice-causative.passive'
);
