import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const normalize=s=>String(s).normalize('NFKC').trim().toLocaleLowerCase();
export function validateReadingRepairCandidates(pkg,sources){
 const errors=[],old=new Map(sources.map(q=>[q.id,q]));
 if(pkg.editorialReview?.status!=='draft'||!pkg.packageVersion.endsWith('-draft'))errors.push('candidate_must_remain_explicitly_unapproved');
 const ids=new Set(),sourcesUsed=new Set(),positions=[0,0,0,0];
 for(const q of pkg.questions||[]){
  const prefix=q.externalId+':';const source=old.get(q.sourceQuestionId);
  if(!source||source.current_content_hash!==q.sourceQuestionHash)errors.push(prefix+'stale_source_hash');
  if(ids.has(q.externalId)||q.externalId===q.sourceQuestionId)errors.push(prefix+'new_unique_external_id_required');ids.add(q.externalId);
  if(sourcesUsed.has(q.sourceQuestionId))errors.push(prefix+'source_replaced_twice');sourcesUsed.add(q.sourceQuestionId);
  if(!source||q.eligibleGrades.some(g=>![7,8].includes(g)||!source.eligible_grade_levels.includes(g)))errors.push(prefix+'grade_expansion');
  if(q.options?.length!==4||new Set(q.options.map(normalize)).size!==4||q.options.filter(o=>o===q.correctAnswer).length!==1)errors.push(prefix+'unique_options_and_key_required');
  const index=q.options.indexOf(q.correctAnswer);if(index>=0&&index<4)positions[index]++;
  const ctx=q.readingContext;
  if(!ctx?.passageText||!q.questionText.includes(ctx.passageText)||!q.questionText.endsWith(ctx.stem))errors.push(prefix+'self_contained_passage_required');
  if(!ctx?.evidenceQuote||!normalize(ctx.passageText).includes(normalize(ctx.evidenceQuote)))errors.push(prefix+'evidence_quote_not_in_passage');
  if((q.taxonomies||[]).length!==1||!q.taxonomies[0].primarySkillCode.startsWith('eng.reading.')||q.taxonomies[0].evidenceFocusCode.includes('core-demonstration'))errors.push(prefix+'precise_reading_taxonomy_required');
 }
 if(pkg.questions?.length!==12||positions.some(n=>n!==3))errors.push('twelve_items_and_balanced_review_keys_required');
 return errors;
}
export function validateHeldRepairDecisions(report,sources){
 const errors=[],old=new Map(sources.map(q=>[q.id,q])),seen=new Set(),keys=new Set(report.focusProposals.map(f=>f.key));
 for(const p of report.focusProposals)if(p.status!=='proposal_not_canonical'||p.canonicalId!==null||p.canonicalCode!==null)errors.push('unreviewed_proposal_masquerades_as_canonical:'+p.key);
 for(const d of report.decisions){const q=old.get(d.sourceQuestionId);if(!q||q.current_content_hash!==d.sourceContentHash)errors.push('stale_decision_source');
  if(seen.has(d.sourceQuestionId))errors.push('duplicate_decision');seen.add(d.sourceQuestionId);
  if(q&&JSON.stringify([...q.taxonomy.map(t=>t.taxonomyId)].sort())!==JSON.stringify([...d.sourceTaxonomyIds].sort()))errors.push('taxonomy_snapshot_mismatch');
  if(d.targetProposalKey&&!keys.has(d.targetProposalKey))errors.push('unknown_proposal_target');
  if(d.status!=='proposal_requires_governed_review'||!d.historicalPolicy.includes('Retain source'))errors.push('historical_preservation_required');
 }
 if(seen.size!==129||sources.length!==129)errors.push('all_129_held_questions_require_one_decision');
 return errors;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const dir='content/english-curriculum-repair/held-repairs/';
 const source=JSON.parse(readFileSync(dir+'source-questions.json','utf8'));
 const errors=[...validateReadingRepairCandidates(JSON.parse(readFileSync(dir+'reading-replacements.json','utf8')),source),...validateHeldRepairDecisions(JSON.parse(readFileSync(dir+'decisions.json','utf8')),source)];
 if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Validated 129 decisions and 12 self-contained reading candidates. No publication performed.');
}
