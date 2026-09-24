-- Extend bh-english-core-v1 for mainstream Cambridge English competencies
-- seen in the existing verified English bank. Cambridge references remain
-- programme-level crosswalk metadata; exact proprietary objectives are not copied.

with v as (
  select id from public.academic_skill_registry_versions
  where code='bh-english-core-v1' and status='published'
),
skills(code,parent_code,name,description,phases) as (
  values
  ('eng.reading.language-effect','eng.reading','Language and writer''s craft',
   'Interpret how writers use language and structural choices to create meaning and effect.',
   array['primary','lower_secondary','upper_secondary']::text[]),
  ('eng.reading.argument-evaluation','eng.reading','Argument and source evaluation',
   'Evaluate claims, evidence, reasoning and source quality in informational and persuasive texts.',
   array['primary','lower_secondary','upper_secondary']::text[]),
  ('eng.reading.multimodal','eng.reading','Multimodal meaning',
   'Build meaning by interpreting visual and verbal information together.',
   array['primary','lower_secondary','upper_secondary']::text[]),
  ('eng.writing.argumentation','eng.writing','Argument and persuasion',
   'Develop and organise claims, reasons and evidence for persuasive or evaluative writing.',
   array['primary','lower_secondary','upper_secondary']::text[]),
  ('eng.writing.source-use','eng.writing','Source use and synthesis',
   'Use information from sources accurately, responsibly and coherently in writing.',
   array['lower_secondary','upper_secondary']::text[])
)
insert into public.academic_skill_registry_nodes(
  registry_version_id,parent_id,node_type,code,name,description,applicable_phases,status
)
select v.id,p.id,'skill',s.code,s.name,s.description,s.phases,'active'
from v cross join skills s
join public.academic_skill_registry_nodes p on p.code=s.parent_code
on conflict (code) do update set
  parent_id=excluded.parent_id,name=excluded.name,description=excluded.description,
  applicable_phases=excluded.applicable_phases,status='active',updated_at=now();

with v as (
  select id from public.academic_skill_registry_versions
  where code='bh-english-core-v1' and status='published'
),
subskills(code,parent_code,name,description,phases) as (
  values
  ('eng.reading.language-effect.figurative','eng.reading.language-effect','Figurative language',
   'Recognise and interpret metaphor, simile, personification and related figurative language.',
   array['primary','lower_secondary','upper_secondary']::text[]),
  ('eng.reading.language-effect.diction-tone','eng.reading.language-effect','Word choice and tone',
   'Explain how diction and phrasing shape tone, attitude and effect.',
   array['primary','lower_secondary','upper_secondary']::text[]),
  ('eng.reading.language-effect.rhetorical','eng.reading.language-effect','Rhetorical and persuasive devices',
   'Recognise and interpret rhetorical choices used to influence an audience.',
   array['primary','lower_secondary','upper_secondary']::text[]),
  ('eng.reading.language-effect.symbolism-imagery','eng.reading.language-effect','Symbolism and imagery',
   'Interpret symbolic and image-based meaning supported by a text.',
   array['lower_secondary','upper_secondary']::text[]),
  ('eng.reading.language-effect.structural-effect','eng.reading.language-effect','Structural effects',
   'Interpret how ordering, repetition, contrast, sentence length and other structural choices create effect.',
   array['lower_secondary','upper_secondary']::text[]),
  ('eng.reading.argument-evaluation.claims-evidence','eng.reading.argument-evaluation','Claims and evidence',
   'Distinguish claims from evidence and judge whether evidence is relevant to a claim.',
   array['primary','lower_secondary','upper_secondary']::text[]),
  ('eng.reading.argument-evaluation.reasoning','eng.reading.argument-evaluation','Reasoning and logical flaws',
   'Evaluate reasoning, including generalisation, causation and common logical fallacies.',
   array['lower_secondary','upper_secondary']::text[]),
  ('eng.reading.argument-evaluation.source-reliability','eng.reading.argument-evaluation','Source reliability and methodology',
   'Judge reliability by considering evidence quality, methods, transparency and support.',
   array['primary','lower_secondary','upper_secondary']::text[]),
  ('eng.reading.argument-evaluation.compare-sources','eng.reading.argument-evaluation','Compare claims across sources',
   'Compare how sources agree, differ or qualify one another.',
   array['lower_secondary','upper_secondary']::text[]),
  ('eng.reading.argument-evaluation.source-provenance','eng.reading.argument-evaluation','Source type and provenance',
   'Recognise source type, origin and evidential role.',
   array['primary','lower_secondary','upper_secondary']::text[]),
  ('eng.reading.multimodal.visual-inference','eng.reading.multimodal','Infer from visual evidence',
   'Draw supported inferences from images, diagrams, sequences and other visual evidence.',
   array['primary','lower_secondary','upper_secondary']::text[]),
  ('eng.reading.multimodal.integrate-modes','eng.reading.multimodal','Integrate visual and written information',
   'Combine visual and written evidence to construct meaning.',
   array['primary','lower_secondary','upper_secondary']::text[]),
  ('eng.writing.argumentation.claim-position','eng.writing.argumentation','State and qualify a position',
   'Express a clear, appropriately qualified claim or position.',
   array['primary','lower_secondary','upper_secondary']::text[]),
  ('eng.writing.argumentation.evidence-reasoning','eng.writing.argumentation','Support claims with evidence and reasoning',
   'Select and connect relevant evidence and reasoning to support a claim.',
   array['primary','lower_secondary','upper_secondary']::text[]),
  ('eng.writing.argumentation.counterargument','eng.writing.argumentation','Address counterarguments',
   'Acknowledge and respond to alternative claims or counterarguments.',
   array['lower_secondary','upper_secondary']::text[]),
  ('eng.writing.argumentation.persuasion','eng.writing.argumentation','Use persuasive appeals',
   'Choose persuasive language and appeals appropriate to purpose and audience.',
   array['primary','lower_secondary','upper_secondary']::text[]),
  ('eng.writing.source-use.synthesis','eng.writing.source-use','Synthesize information from sources',
   'Combine compatible, contrasting or qualifying information from multiple sources.',
   array['lower_secondary','upper_secondary']::text[]),
  ('eng.writing.source-use.paraphrase-attribution','eng.writing.source-use','Paraphrase and attribute sources',
   'Paraphrase source ideas accurately and make attribution clear where required.',
   array['lower_secondary','upper_secondary']::text[]),
  ('eng.writing.source-use.integrate-evidence','eng.writing.source-use','Integrate source evidence',
   'Connect source evidence to the writer''s own claim or explanation.',
   array['lower_secondary','upper_secondary']::text[])
)
insert into public.academic_skill_registry_nodes(
  registry_version_id,parent_id,node_type,code,name,description,applicable_phases,status
)
select v.id,p.id,'subskill',s.code,s.name,s.description,s.phases,'active'
from v cross join subskills s
join public.academic_skill_registry_nodes p on p.code=s.parent_code
on conflict (code) do update set
  parent_id=excluded.parent_id,name=excluded.name,description=excluded.description,
  applicable_phases=excluded.applicable_phases,status='active',updated_at=now();

with v as (select id from public.academic_skill_registry_versions where code='bh-english-core-v1'),
programmes(programme_code,programme_name,phase,source_url,source_version) as (
  values
    ('0058','Cambridge Primary English','primary',
     'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-primary/curriculum/english/',
     'current public programme overview'),
    ('0861','Cambridge Lower Secondary English','lower_secondary',
     'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-lower-secondary/curriculum/english/',
     'current public programme overview'),
    ('0500','Cambridge IGCSE First Language English','upper_secondary',
     'https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-igcse-english-first-language-0500/',
     '2027-2029 public syllabus overview')
)
insert into public.academic_skill_framework_crosswalks(
  registry_version_id,node_id,provider_name,programme_code,programme_name,phase,
  external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status
)
select v.id,n.id,'Cambridge International Education',p.programme_code,p.programme_name,p.phase,
  case split_part(n.code,'.',2)
    when 'reading' then 'Reading'
    when 'writing' then 'Writing'
    when 'speaking' then 'Speaking and listening'
    when 'listening' then 'Speaking and listening'
    when 'use-of-english' then 'Integrated language control'
  end,
  null,'programme',
  'Brain Heist canonical competency crosswalk at programme level. Exact Cambridge learning-objective wording is not copied into the registry.',
  p.source_url,p.source_version,'active'
from v
join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.status='active'
join programmes p on p.phase=any(n.applicable_phases)
on conflict do nothing;
