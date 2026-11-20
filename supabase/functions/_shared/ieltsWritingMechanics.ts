/**
 * Deterministic Writing checks (Diagnostic Bible 2.6.0 section 10.9).
 *
 * Language models read text in chunks, so they reliably miss small mechanical slips such as "world,education",
 * "society.Somebody", double spaces or "hand,Learning", and a single AI pass stops after its most important points.
 * These checks run on the server after the AI passes, on every essay, and cannot be skipped by the model:
 * - a missing space after , ; : . ! ? (numbers, e.g./i.e. and web addresses are left alone);
 * - a missing space after a plural apostrophe ("students'independence");
 * - a space before , ; : . ! ?;
 * - two or more spaces between words;
 * - a small letter at the start of a sentence or paragraph, and a lone "i";
 * - a capital letter straight after a comma when the same word is written in small letters elsewhere in the essay;
 * - the same word twice in a row ("the the");
 * - common misspellings from a fixed list.
 * Each finding becomes a "fix" highlight with the corrected words, so it is shown exactly like an AI correction.
 */
import type { WritingHighlight, WritingHighlightCriterion } from './ieltsWritingHighlights.ts';

type Edit = { at: number; end: number; insert: string; note: string; criterion: WritingHighlightCriterion };

/** Frequent learner misspellings. Only whole words are matched; the list is deliberately conservative. */
export const COMMON_MISSPELLINGS: Record<string, string> = {
  neccessary: 'necessary', neccesary: 'necessary', necesary: 'necessary', necessery: 'necessary', recieve: 'receive', recieved: 'received',
  beleive: 'believe', belive: 'believe', untill: 'until', alot: 'a lot', wich: 'which', thier: 'their', enviroment: 'environment',
  goverment: 'government', govenment: 'government', oppinion: 'opinion', opinon: 'opinion', becouse: 'because', beacuse: 'because',
  becuase: 'because', tommorow: 'tomorrow', tomorow: 'tomorrow', sucess: 'success', succes: 'success', succesful: 'successful',
  successfull: 'successful', definately: 'definitely', definitly: 'definitely', seperate: 'separate', adress: 'address', comming: 'coming',
  begining: 'beginning', knowlege: 'knowledge', knowledgable: 'knowledgeable', occured: 'occurred', occurence: 'occurrence',
  accomodation: 'accommodation', acommodation: 'accommodation', advertisment: 'advertisement', arguement: 'argument', basicly: 'basically',
  benifit: 'benefit', benifits: 'benefits', carrer: 'career', carreer: 'career', commom: 'common', comunity: 'community', commitee: 'committee',
  concious: 'conscious', convinient: 'convenient', developement: 'development', diffrent: 'different', dissapear: 'disappear',
  embarass: 'embarrass', enviromental: 'environmental', especialy: 'especially', exagerate: 'exaggerate', existance: 'existence',
  experiance: 'experience', familar: 'familiar', finaly: 'finally', foriegn: 'foreign', freind: 'friend', freinds: 'friends',
  furture: 'future', futher: 'further', garantee: 'guarantee', goverments: 'governments', grammer: 'grammar', happend: 'happened',
  harrass: 'harass', immediatly: 'immediately', independant: 'independent', intrest: 'interest', intresting: 'interesting',
  interupt: 'interrupt', knowlegde: 'knowledge', langauge: 'language', libary: 'library', lisence: 'licence', maintainance: 'maintenance',
  mispell: 'misspell', neighbour: 'neighbour', noticable: 'noticeable', ocasion: 'occasion', oportunity: 'opportunity',
  oppurtunity: 'opportunity', opportunites: 'opportunities', peopel: 'people', posession: 'possession', posibility: 'possibility',
  prefered: 'preferred', priviledge: 'privilege', probaly: 'probably', proffesional: 'professional', profesional: 'professional',
  publically: 'publicly', realy: 'really', recomend: 'recommend', reccomend: 'recommend', refered: 'referred', relevent: 'relevant',
  responsability: 'responsibility', resposibility: 'responsibility', rythm: 'rhythm', shoud: 'should', similiar: 'similar',
  sincerly: 'sincerely', studing: 'studying', suprise: 'surprise', technolgy: 'technology', tecnology: 'technology',
  techonology: 'technology', thats: "that is", truely: 'truly', unfortunatly: 'unfortunately', usefull: 'useful', wether: 'whether',
  writting: 'writing', yeild: 'yield', intrgrate: 'integrate', ledding: 'leading', childrens: "children's", informations: 'information',
  advices: 'advice', knowledges: 'knowledge', equipments: 'equipment', homeworks: 'homework',
};
const NOT_SENTENCE_END = /(?:^|\s)(?:e\.g|i\.e|etc|vs|Mr|Mrs|Ms|Dr|St|No)\.$/i;
const WEB = /^(?:com|org|net|edu|gov|uk|kg|ru|io|ai|co|html?|php)\b/i;
const LETTER = /\p{L}/u;
const upperFirst = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

function collectEdits(text: string): Edit[] {
  const edits: Edit[] = [];
  const lowerWords = new Set((text.match(/\p{L}+/gu) ?? []).filter(w => w === w.toLowerCase()));
  // Capital after a comma: only when the essay itself spells that word in small letters (so names stay untouched).
  const wrongCapital = (word: string) => word !== 'I' && /^\p{Lu}\p{Ll}+$/u.test(word) && lowerWords.has(word.toLowerCase());

  // 1. Punctuation followed directly by a letter: "world,education", "society.Somebody", "students'independence".
  for (const m of text.matchAll(/(\S*?)([,;:.!?])(?=(\p{L}[\p{L}'’-]*))/gu)) {
    const before = m[1]; const mark = m[2]; const after = m[3];
    const at = (m.index ?? 0) + before.length + 1; // position after the mark
    if (!LETTER.test(before.slice(-1)) && !/[)"”’]/.test(before.slice(-1))) continue; // 3.5, (1,2) and similar
    if (/[@/]|www/i.test(before) || WEB.test(after)) continue; // e-mail and web addresses
    if (mark === '.' && (/^\p{L}$/u.test(after) || /(?:^|\.)\p{L}$/u.test(before))) continue; // e.g, i.e, U.S.A
    const name = mark === ',' ? 'comma' : mark === ';' ? 'semicolon' : mark === ':' ? 'colon' : mark === '.' ? 'full stop' : mark === '?' ? 'question mark' : 'exclamation mark';
    edits.push({ at, end: at, insert: ' ', criterion: 'grammar_range_accuracy', note: `Put a space after the ${name}.` });
    if ('.!?'.includes(mark) && /^\p{Ll}/u.test(after)) {
      edits.push({ at, end: at + 1, insert: after.charAt(0).toUpperCase(), criterion: 'grammar_range_accuracy', note: 'Start a new sentence with a capital letter.' });
    } else if (mark === ',' && wrongCapital(after)) {
      edits.push({ at, end: at + 1, insert: after.charAt(0).toLowerCase(), criterion: 'grammar_range_accuracy', note: 'Use a small letter after a comma because the sentence has not ended.' });
    }
  }
  for (const m of text.matchAll(/\p{L}s(['’])(\p{L})/gu)) {
    const at = (m.index ?? 0) + m[0].length - 1;
    edits.push({ at, end: at, insert: ' ', criterion: 'grammar_range_accuracy', note: 'Put a space after the apostrophe.' });
  }
  // 2. Space before punctuation: "students ,".
  for (const m of text.matchAll(/(\p{L})( +)([,;:.!?])/gu)) {
    const at = (m.index ?? 0) + 1;
    edits.push({ at, end: at + m[2].length, insert: '', criterion: 'grammar_range_accuracy', note: `Do not put a space before "${m[3]}".` });
  }
  // 3. Two or more spaces between words on one line.
  for (const m of text.matchAll(/(\S)( {2,}|\t+ *)(?=\S)/gu)) {
    const at = (m.index ?? 0) + 1;
    edits.push({ at, end: at + m[2].length, insert: ' ', criterion: 'grammar_range_accuracy', note: 'Use one space between words.' });
  }
  // 4. Small letter at the start of a sentence (after ". " etc.) or a paragraph, and a lone "i".
  for (const m of text.matchAll(/([.!?])(\s+)(\p{Ll})/gu)) {
    const markAt = m.index ?? 0;
    if (NOT_SENTENCE_END.test(text.slice(Math.max(0, markAt - 6), markAt + 1))) continue;
    const at = markAt + 1 + m[2].length;
    edits.push({ at, end: at + 1, insert: m[3].toUpperCase(), criterion: 'grammar_range_accuracy', note: 'Start a new sentence with a capital letter.' });
  }
  for (const m of text.matchAll(/(^|\n)([ \t]*)(\p{Ll})/gu)) {
    const at = (m.index ?? 0) + m[1].length + m[2].length;
    edits.push({ at, end: at + 1, insert: m[3].toUpperCase(), criterion: 'grammar_range_accuracy', note: 'Start a new paragraph with a capital letter.' });
  }
  for (const m of text.matchAll(/(?<![\p{L}'’])i(?![\p{L}'’.])/gu)) {
    const at = m.index ?? 0;
    edits.push({ at, end: at + 1, insert: 'I', criterion: 'grammar_range_accuracy', note: 'Always write "I" as a capital letter.' });
  }
  // 5. Capital letter after a comma that is followed by a space: "hand, Learning".
  for (const m of text.matchAll(/, +(\p{Lu}\p{Ll}+)/gu)) {
    if (!wrongCapital(m[1])) continue;
    const at = (m.index ?? 0) + m[0].length - m[1].length;
    edits.push({ at, end: at + 1, insert: m[1].charAt(0).toLowerCase(), criterion: 'grammar_range_accuracy',
      note: 'Use a small letter after a comma because the sentence has not ended.' });
  }
  // 6. The same word twice: "the the".
  for (const m of text.matchAll(/(?<!\p{L})(\p{L}+)( +)(\p{L}+)(?!\p{L})/gu)) {
    if (m[1].toLowerCase() !== m[3].toLowerCase() || /^(?:had|that)$/i.test(m[1])) continue;
    const at = (m.index ?? 0) + m[1].length;
    edits.push({ at, end: at + m[2].length + m[3].length, insert: '', criterion: 'grammar_range_accuracy', note: `"${m[1]}" is written twice.` });
  }
  // 7. Common misspellings.
  for (const m of text.matchAll(/\p{L}+/gu)) {
    const right = COMMON_MISSPELLINGS[m[0].toLowerCase()];
    if (!right || right === m[0].toLowerCase()) continue;
    const fixed = /^\p{Lu}/u.test(m[0]) ? upperFirst(right) : right;
    edits.push({ at: m.index ?? 0, end: (m.index ?? 0) + m[0].length, insert: fixed, criterion: 'lexical_resource', note: `Spelling: "${fixed}".` });
  }
  // Edits never overlap: sort by position (insertions first) and keep the first edit that claims each stretch of text.
  edits.sort((a, b) => a.at - b.at || (a.end - a.at) - (b.end - b.at));
  const kept: Edit[] = [];
  for (const edit of edits) {
    const last = kept[kept.length - 1];
    if (last && (edit.at < last.end || (edit.at === last.at && edit.end === last.end))) continue;
    kept.push(edit);
  }
  return kept;
}

/** The run of non-space characters around a position, so each finding is shown with its neighbouring words. */
function wordWindow(text: string, at: number, end: number): [number, number] {
  const onSpace = end > at ? /^\s+$/.test(text.slice(at, end)) : false;
  let s = at; while (s > 0 && !/\s/.test(text[s - 1])) s--;
  // An edit on whitespace (double space, space before a comma) is shown with the word on each side.
  if (onSpace && s === at && at > 0) { s = at - 1; while (s > 0 && !/\s/.test(text[s - 1])) s--; }
  let e = Math.max(at, end); while (e < text.length && !/\s/.test(text[e])) e++;
  if (onSpace && e === end && e < text.length) { while (e < text.length && !/\s/.test(text[e])) e++; }
  while (e > s + 1 && e - 1 > Math.max(at, end) && /[.,;:!?)"”]/.test(text[e - 1])) e--;
  return [s, Math.max(e, s + 1)];
}

const codePoints = (s: string) => Array.from(s).length;

/** Every deterministic finding as a fix highlight (essay text, corrected words, code-point offsets). */
export function mechanicalWritingHighlights(essay: string): WritingHighlight[] {
  const edits = collectEdits(essay);
  const groups: { s: number; e: number; edits: Edit[] }[] = [];
  for (const edit of edits) {
    const [s, e] = wordWindow(essay, edit.at, edit.end);
    const last = groups[groups.length - 1];
    if (last && s < last.e) { last.e = Math.max(last.e, e); last.s = Math.min(last.s, s); last.edits.push(edit); } else groups.push({ s, e, edits: [edit] });
  }
  return groups.map(g => {
    let correction = ''; let at = g.s;
    for (const edit of g.edits) { correction += essay.slice(at, edit.at) + edit.insert; at = edit.end; }
    correction += essay.slice(at, g.e);
    const notes = [...new Set(g.edits.map(e => e.note))];
    const quote = essay.slice(g.s, g.e);
    const start_char = codePoints(essay.slice(0, g.s));
    return { criterion: g.edits.some(e => e.criterion === 'lexical_resource') && g.edits.every(e => e.criterion === 'lexical_resource') ? 'lexical_resource' : 'grammar_range_accuracy',
      kind: 'fix' as const, quote, note: notes.join(' '), correction, start_char, end_char: start_char + codePoints(quote) };
  }).filter(h => h.quote.trim() && h.correction !== h.quote);
}

/** Applies the deterministic fixes to a piece of text (used to clean an AI correction before it is shown). */
export function applyMechanicalFixes(text: string): string {
  let out = ''; let at = 0;
  for (const edit of collectEdits(text)) { out += text.slice(at, edit.at) + edit.insert; at = edit.end; }
  return out + text.slice(at);
}
