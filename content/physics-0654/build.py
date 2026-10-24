"""Build a deterministic review bundle. This script never publishes questions."""
import collections
import csv
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE_URL = 'https://www.cambridgeinternational.org/Images/664572-2025-2027-syllabus.pdf'
rows = list(csv.DictReader((HERE / 'source.csv').open(encoding='utf-8-sig', newline='')))
mapping = list(csv.DictReader((HERE / 'mapping.tsv').open(), delimiter='\t'))
assert [r['id'] for r in rows] == [str(i) for i in range(1, 91)]
assert [r['id'] for r in mapping] == [r['id'] for r in rows]
original = {r['id']: dict(r) for r in rows}
by_id = {int(r['id']): r for r in rows}

def edit(n, **fields):
    by_id[n].update(fields)

edit(4, question='Approximately what is the value of absolute zero in degrees Celsius?',
     explanation='Absolute zero is 0 K, equal to -273.15 °C, usually rounded to -273 °C at this level.')
edit(11, question='For typical materials at constant pressure, equal initial volumes of a solid, a liquid and a gas have the same temperature rise. What is the usual order of increasing expansion?',
     explanation='Typically, solids expand least, liquids more and gases most. Particular substances and conditions can show exceptions.')
edit(17, question='An object is heated and its temperature rises without a change of state. What happens to the average kinetic energy of its particles?')
edit(18, D='The energy supplied increases particle potential energy by overcoming attractive forces, rather than increasing average kinetic energy.')
edit(19, explanation='More energetic particles are more likely to escape. Their loss reduces the average kinetic energy of the particles remaining in the liquid, causing cooling.')
edit(20, question='At constant pressure, which statement correctly compares evaporation and boiling?',
     explanation='Evaporation occurs at the surface over a range of temperatures. A pure liquid boils throughout its volume at its boiling point for the given pressure.')
edit(22, explanation='Energy is passed between neighbouring atoms through vibrations. Glass has no mobile conduction electrons comparable to those in metals; it is generally a poor thermal conductor.')
edit(25, B='Thermal radiation', explanation='Thermal radiation transfers energy electromagnetically and requires no material medium. It is mainly infrared at ordinary temperatures.')
edit(26, question='Four identical cans contain equal masses of water at the same initial temperature in the same cooler surroundings. Their surfaces differ. Which is expected to lose energy fastest by thermal radiation?')
edit(28, question='With other conditions unchanged, which change increases the total power emitted by an object as infrared radiation?')
edit(29, question='If the average temperature of the Earth is constant over a long period, which energy balance must hold?',
     explanation='A constant average temperature requires the average absorbed and emitted radiation powers to balance. A sustained imbalance changes the stored energy and temperature.')
edit(31, question='Which pair of particle types can be found in atomic nuclei?',
     explanation='Nuclei contain protons and usually neutrons; hydrogen-1 is the common exception with a single proton and no neutron. Electrons occupy the region outside the nucleus.')
edit(41, question='What is a beta-minus particle?')
edit(45, explanation='Of alpha, beta and gamma radiation, gamma is the most penetrating. Thick lead or concrete attenuates gamma radiation; it is not stopped at a single definite range.')
edit(47, question='Alpha particles and beta-minus particles enter the same uniform electric field. What can be concluded about the directions of their deflection?',
     A='They deflect in opposite directions because their charges have opposite signs.',
     B='They deflect in the same direction because both have mass.',
     C='Neither deflects because neither is charged.',
     D='Only alpha particles deflect because beta-minus particles have no charge.',
     explanation='Alpha particles carry positive charge and beta-minus particles carry negative charge, so their electric forces point in opposite directions. Comparing deflection sizes also requires information about their motion.')
edit(49, question='Carbon-14 (¹⁴₆C) decays by beta-minus emission. Which nuclide is produced?')
edit(50, question='What happens inside the nucleus during beta-minus decay?',
     explanation='A neutron changes into a proton and an electron; the electron is emitted. An electron antineutrino is also emitted, although it is outside the required 0654 description.')
edit(51, explanation='Gamma emission releases nuclear energy as a photon. The numbers of protons and neutrons remain unchanged.')
edit(53, explanation='Half-life is the time for half the initially undecayed nuclei to decay. The source count rate also halves over this interval when background is negligible or properly corrected.')
edit(58, C='Alpha radiation strongly ionises the air; smoke reduces the ionisation current.',
     explanation='The sealed alpha source ionises air so a small current flows. Smoke reduces this current and triggers the alarm. Its short range limits external exposure in an intact detector; radioactive sources still require controlled handling.')
edit(59, explanation='Beta absorption changes usefully with paper thickness. Alpha is too readily absorbed, while gamma is generally too penetrating for this application.')
edit(64, explanation='The Moon completes an orbit relative to distant stars in about 27.3 days. The cycle of phases takes about 29.5 days; both are approximately one month.')
edit(68, question='Why are the inner planets rocky while the outer planets are much larger and rich in gases or ices?',
     C='Near the hot young Sun, rock and metal could condense; farther out, cooler conditions allowed ice-rich cores to form and some planets retained thick gas envelopes.',
     explanation='In the hot inner disc, rock and metal could condense. Farther out, cooler conditions allowed ices to accumulate and large cores to retain gas. Jupiter and Saturn are gas giants; Uranus and Neptune are ice giants.')
edit(70, question='How does the orbital speed of planets generally change with increasing distance from the Sun?',
     A='Orbital speed decreases.', B='Orbital speed stays the same.', C='Orbital speed doubles for each doubling of distance.', D='Orbital speed increases.',
     explanation='More distant planets generally have lower orbital speeds, consistent with the weakening gravitational field of the Sun.')
edit(83, question='Which stellar remnant is left after a Sun-like star sheds its outer layers?')
edit(88, D='A nearly uniform background of microwave radiation observed in all directions, with a thermal spectrum.',
     explanation='The cosmic microwave background is relic radiation from the early Universe. Expansion has stretched its thermal spectrum into the microwave region; it is not a single-frequency signal.')

def write_json(name, value):
    (HERE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

new_nodes = [
    {'code': 'science.physics.nuclear.atomic-structure', 'parent': 'science.physics.nuclear', 'type': 'subskill', 'name': 'Nuclear composition and isotopes'},
    {'code': 'science.physics.nuclear.nuclear-reactions', 'parent': 'science.physics.nuclear', 'type': 'subskill', 'name': 'Nuclear fission and fusion'},
    {'code': 'science.physics.space', 'parent': 'science.physics', 'type': 'skill', 'name': 'Space physics'},
    {'code': 'science.physics.space.solar-system', 'parent': 'science.physics.space', 'type': 'subskill', 'name': 'Solar System relationships and astronomical scales'},
    {'code': 'science.physics.space.stars', 'parent': 'science.physics.space', 'type': 'subskill', 'name': 'Stellar composition and evolution'},
    {'code': 'science.physics.space.cosmology', 'parent': 'science.physics.space', 'type': 'subskill', 'name': 'Galaxies and the expanding Universe'},
]
known_skills = {'thermal': 'Thermal physics', 'nuclear': 'Atomic and nuclear physics', 'space': 'Space physics', 'fields': 'Fields and electromagnetism'}
known_leaves = {
    'thermal.temperature-particle': 'Temperature and particle energy', 'thermal.gases': 'Gas behaviour',
    'thermal.heat-transfer': 'Thermal energy transfer', 'nuclear.radioactivity': 'Radioactivity',
    'fields.gravity': 'Gravity and gravitational fields',
    **{n['code'].removeprefix('science.physics.'): n['name'] for n in new_nodes if n['type'] == 'subskill'},
}
candidate, held, audit, focuses, fixes = [], [], [], {}, []
for row, m in zip(rows, mapping):
    n = int(row['id']); leaf = 'science.physics.' + m['leaf']; skill = leaf.rsplit('.', 1)[0]
    focus = leaf + '.focus.' + m['focus']
    label = m['label']
    # Reuse exact governed focuses where their meaning matches the question.
    if n in (10, 17):
        focus = leaf + '.focus.relate-temperature-to-kinetic-energy-3488ba5482'
    elif n == 21:
        focus = leaf + '.focus.explain-metal-thermal-conduction-using-mobile-electrons-ce99ed61ef'
    else:
        focuses.setdefault(focus, {'code': focus, 'subskillCode': leaf, 'name': label,
            'description': 'Evidence that the learner can ' + label[0].lower() + label[1:] + '.',
            'applicablePhases': ['upper_secondary'], 'reviewStatus': 'pending_human_review'})
    process = m['process']; ao = 'AO2' if process in ('apply', 'analyze') else 'AO1'
    bh_ao = {'apply': 'BH-AO2', 'analyze': 'BH-AO3'}.get(process, 'BH-AO1')
    component = ('problem-solving' if n in (5, 8, 15, 16, 32, 39, 48, 49, 54, 55, 56, 57, 71, 72, 79, 89, 90)
                 else 'predictions' if process == 'apply' else 'patterns-conclusions') if ao == 'AO2' else (
                 'terminology' if n in (4, 14, 40, 41, 42, 53, 78) else 'apparatus-safety' if n == 60 else 'applications' if n == 58 else 'concepts')
    evidence = f'A correct response supports the ability to {label[0].lower() + label[1:]}. It does not identify every reasoning step or establish mastery alone.'
    q = {'externalId': f'bh-physics-0654-2025-2027-{n:03d}', 'topic': row['topic'],
        'questionText': row['question'], 'questionType': 'multiple_choice',
        'options': [row[k] for k in 'ABCD'], 'correctAnswer': row[row['answer']],
        'explanation': row['explanation'], 'difficulty': 'medium' if process in ('apply', 'analyze') else 'easy',
        'points': 1, 'timeLimit': 90 if process == 'apply' else 60, 'language': 'en',
        'eligibleGrades': [9, 10, 11], 'curriculumPhase': 'upper_secondary', 'tags': ['Physics', 'Co-ordinated Sciences', '0654', m['tier']],
        'taxonomies': [{'primarySkillCode': skill, 'atomicSubskillCode': leaf, 'evidenceFocusCode': focus,
            'assessmentProcessCode': bh_ao, 'cognitiveProcess': process, 'evidenceStatement': evidence}]}
    aligned = m['tier'] in ('core', 'supplement')
    if aligned:
        q['assessmentProfile'] = {'providerName': 'Cambridge International Education', 'programmeCode': '0654',
            'sourceVersion': '2025-2027', 'paperComponent': 'paper_1' if m['tier'] == 'core' else 'paper_2',
            'evidenceMode': 'mcq', 'primaryAssessmentObjective': ao, 'assessmentObjectives': [ao],
            'syllabusTier': m['tier'], 'syllabusReference': m['reference'],
            'objectiveComponents': [f'BH-CIE0654-{ao}-{component}'],
            'sourceReference': f'Uploaded source question {n}; proposed alignment {m["reference"]}; {SOURCE_URL}. Not a Cambridge exam item or endorsement.'}
        candidate.append(q)
    else:
        held.append({'sourceId': n, 'status': 'held_outside_explicit_0654_outcomes',
            'reason': 'Useful foundation or extension, but not directly supported by an explicit 0654 2025–2027 outcome at the required depth.', 'question': q})
    changes = {k: {'before': original[row['id']][k], 'after': v} for k, v in row.items() if original[row['id']][k] != v}
    if changes: fixes.append({'sourceId': n, 'changes': changes})
    audit.append({'source_id': n, 'question': row['question'], 'answer': row['answer'],
        'correct_answer_text': row[row['answer']], 'alignment': 'candidate' if aligned else 'held',
        'syllabus_reference': m['reference'], 'tier': m['tier'], 'skill': skill, 'subskill': leaf,
        'skill_name': known_skills[m['leaf'].split('.')[0]], 'subskill_name': known_leaves[m['leaf']],
        'evidence_focus': focus, 'focus_label': label, 'cambridge_ao': ao if aligned else '',
        'ao_component': f'BH-CIE0654-{ao}-{component}' if aligned else '', 'bh_process': bh_ao,
        'cognitive_process': process, 'evidence_statement': evidence,
        'review_status': 'pending_human_review', 'modified_fields': ', '.join(changes)})

package = {'schemaVersion': 1, 'packageId': 'bh-physics-0654-2025-2027-v1', 'packageVersion': '1.0.0',
    'contentVersion': 'physics-0654-2025-2027-v1', 'registryVersion': 'bh-science-core-v1', 'subjectCode': 'physics',
    'authority': 'PENDING HUMAN REVIEW - DO NOT PUBLISH',
    'releaseNotes': 'Uploaded bank, corrected and proposed for 0654 Physics alignment. Grades 9–11; explicit upper-secondary programme context, not automatic grade-to-stage equivalence. Confirm offering exam years before activation. Difficulty is editorial, not calibrated.',
    'questions': candidate}
write_json('candidate-package.json', package)
write_json('held-questions.json', held)
write_json('corrections.json', fixes)
write_json('registry-proposal.json', {'status': 'pending_human_review', 'registryVersion': 'bh-science-core-v1',
    'nodes': new_nodes, 'evidenceFocuses': list(focuses.values()),
    'programmeChange': {'alias': 'physics', 'addProgrammeCode': '0654'},
    'policy': 'Additive proposals only. No existing meaning, phase or historic taxonomy is rewritten. Extension-only focuses need not be activated for the aligned release.'})
for name, data in [('review.csv', audit), ('corrected-source.csv', rows)]:
    with (HERE / name).open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(data[0]), lineterminator='\n'); writer.writeheader(); writer.writerows(data)
coverage = collections.Counter(q['taxonomies'][0]['evidenceFocusCode'] for q in candidate)
write_json('coverage.json', {'sourceCount': len(rows), 'candidateCount': len(candidate), 'heldCount': len(held),
    'correctedQuestionCount': len(fixes), 'tierCounts': dict(collections.Counter(a['tier'] for a in audit if a['alignment'] == 'candidate')),
    'aoCounts': dict(collections.Counter(q['assessmentProfile']['primaryAssessmentObjective'] for q in candidate)),
    'focusCounts': dict(sorted(coverage.items())), 'singleItemFocuses': [k for k, v in coverage.items() if v == 1],
    'missingBankTopics': ['P1 Motion, forces and energy', 'P3 Waves', 'P4 Electricity and magnetism'],
    'limitations': ['Partial Physics bank, not full 0654 or full Physics coverage.', 'No AO3 practical performance evidence.',
        'Most focuses have too few items for independent reassessment.', 'No calibrated difficulty or mastery claims.',
        'Human content and taxonomy review, grade eligibility and named-user pilot required before publication.']})
hashes = {name: hashlib.sha256((HERE / name).read_bytes()).hexdigest() for name in (
    'source.csv', 'mapping.tsv', 'candidate-package.json', 'held-questions.json', 'registry-proposal.json', 'review.csv', 'corrections.json')}
write_json('review-manifest.json', {'status': 'pending_human_review', 'reviewer': None, 'reviewedAt': None,
    'sourceUrl': SOURCE_URL, 'syllabusVersion': '2025-2027, version 1', 'sha256': hashes})

# This is a separate, explicitly gated content release, not an automatic migration.
# A reviewer signs the exact manifest, then the service-role importer is rehearsed.
def sql_literal(value):
    return "'" + str(value).replace("'", "''") + "'"

manifest_hash = hashlib.sha256((HERE / 'review-manifest.json').read_bytes()).hexdigest()
candidate_focuses = {q['taxonomies'][0]['evidenceFocusCode'] for q in candidate}
registry_sql = [f"""-- Proposed content release. Requires human review of the exact manifest first.
-- Run in a transaction; rollback for rehearsal. This file never imports questions.
do $review$ begin
  if coalesce(current_setting('brains_heist.physics_review_authority',true),'')=''
     or current_setting('brains_heist.physics_review_manifest_sha256',true) is distinct from '{manifest_hash}' then
    raise exception 'physics_0654_human_taxonomy_review_required';
  end if;
end $review$;
"""]
for node in new_nodes:
    registry_sql.append(f"""do $identity$ begin
  if exists(select 1 from public.academic_skill_registry_nodes n
    join public.academic_skill_registry_versions v on v.id=n.registry_version_id and v.code='bh-science-core-v1'
    left join public.academic_skill_registry_nodes p on p.id=n.parent_id
    where n.code={sql_literal(node['code'])} and
      (n.name is distinct from {sql_literal(node['name'])} or n.node_type is distinct from {sql_literal(node['type'])}
       or p.code is distinct from {sql_literal(node['parent'])} or n.status<>'active')) then
    raise exception 'physics_registry_identity_conflict';
  end if;
end $identity$;
""")
for node in new_nodes:
    registry_sql.append(f"""insert into public.academic_skill_registry_nodes(registry_version_id,parent_id,node_type,code,name,description,applicable_phases,status)
select v.id,p.id,{sql_literal(node['type'])},{sql_literal(node['code'])},{sql_literal(node['name'])},
{sql_literal('Transferable Physics capability: ' + node['name'] + '.')},array['upper_secondary'],'active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes p on p.registry_version_id=v.id and p.code={sql_literal(node['parent'])}
where v.code='bh-science-core-v1' and v.status='published' and p.status='active'
on conflict(code) do nothing;
""")
for focus in focuses.values():
    if focus['code'] not in candidate_focuses:
        continue
    registry_sql.append(f"""insert into public.academic_skill_evidence_focuses(registry_version_id,atomic_subskill_node_id,code,name,description,applicable_phases,source_method,source_fingerprint,status)
select v.id,n.id,{sql_literal(focus['code'])},{sql_literal(focus['name'])},{sql_literal(focus['description'])},
array['upper_secondary'],'human_governed',{sql_literal(hashlib.sha256(focus['code'].encode()).hexdigest())},'active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code={sql_literal(focus['subskillCode'])}
where v.code='bh-science-core-v1' and v.status='published' and n.node_type='subskill' and n.status='active'
on conflict(code) do nothing;
""")
registry_sql.append("""update public.academic_skill_registry_subject_aliases
set allowed_programme_codes=array(select distinct x from unnest(allowed_programme_codes||array['0654']) x order by x)
where alias_normalized='physics' and status='active'
  and registry_version_id=(select id from public.academic_skill_registry_versions where code='bh-science-core-v1');
""")
for leaf, ref in sorted({(q['taxonomies'][0]['atomicSubskillCode'], q['assessmentProfile']['syllabusReference']) for q in candidate}):
    registry_sql.append(f"""insert into public.academic_skill_framework_crosswalks(registry_version_id,node_id,provider_name,programme_code,programme_name,phase,external_strand,external_reference_code,alignment_level,alignment_note,source_url,source_version,status)
select v.id,n.id,'Cambridge International','0654','Cambridge IGCSE Co-ordinated Sciences (Double Award) - Physics','upper_secondary','Physics',
{sql_literal('CIE0654-2025-2027-' + ref)},'subject_content','Reviewed public syllabus reference; no endorsement or full curriculum wording claimed.',
{sql_literal(SOURCE_URL)},'2025-2027','active'
from public.academic_skill_registry_versions v join public.academic_skill_registry_nodes n on n.registry_version_id=v.id and n.code={sql_literal(leaf)}
where v.code='bh-science-core-v1' and v.status='published'
on conflict(node_id,programme_code,(coalesce(external_reference_code,'')),alignment_level) do nothing;
""")
(HERE / 'reviewed-registry-release.sql').write_text('\n'.join(registry_sql))
(HERE / 'reviewed-offering-release.sql').write_text(f"""-- Explicit offering activation after confirming programme AND exam years.
-- Set the authority, manifest checksum and exact offering ID in this transaction.
do $offering$
declare v_offering uuid:=nullif(current_setting('brains_heist.physics_offering_id',true),'')::uuid;
begin
  if v_offering is null or coalesce(current_setting('brains_heist.physics_review_authority',true),'')=''
     or current_setting('brains_heist.physics_review_manifest_sha256',true) is distinct from '{manifest_hash}' then
    raise exception 'physics_offering_exact_version_review_required';
  end if;
  if not exists(select 1 from public.school_subject_offerings o
    join public.school_subjects ss on ss.id=o.school_subject_id and ss.school_id=o.school_id and ss.is_active
    join public.academic_subjects a on a.id=ss.academic_subject_id and a.code='physics'
    where o.id=v_offering and o.status='active') then raise exception 'active_physics_offering_required'; end if;
  if exists(select 1 from public.physics_programme_offering_mappings where offering_id=v_offering
    and (programme_code<>'0654' or source_version<>'2025-2027' or registry_phase<>'upper_secondary' or status<>'active')) then
    raise exception 'physics_offering_programme_conflict';
  end if;
  insert into public.physics_programme_offering_mappings(offering_id,programme_code,source_version,registry_phase,reviewed_by_authority)
  values(v_offering,'0654','2025-2027','upper_secondary',current_setting('brains_heist.physics_review_authority'))
  on conflict(offering_id) do nothing;
end;
$offering$;
""")
print(json.dumps({'candidate': len(candidate), 'held': len(held), 'corrected': len(fixes), 'focuses': len(coverage)}))
