#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subjectDefinitions from './grade-7-question-data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = path.join(root, 'content', 'verified-question-packages', '2026-8-0');
const assetDir = path.join(root, 'public', 'question-assets', '2026-8-0');
mkdirSync(packageDir, { recursive: true });
mkdirSync(assetDir, { recursive: true });

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const text = (x, y, value, size = 20, fill = '#e2e8f0', weight = 600, anchor = 'start') =>
  `<text x="${x}" y="${y}" fill="${fill}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(value)}</text>`;
const frame = (title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img">
  <title>${esc(title)}</title>
  <rect width="640" height="360" rx="24" fill="#0f172a"/>
  <rect x="1" y="1" width="638" height="358" rx="23" fill="none" stroke="#334155" stroke-width="2"/>
  ${text(32, 42, title.toUpperCase(), 17, '#67e8f9', 800)}
  <path d="M32 58H608" stroke="#334155" stroke-width="2"/>
  ${body}
</svg>\n`;
const arrow = (x1, y1, x2, y2, colour = '#fbbf24') => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${colour}" stroke-width="5" stroke-linecap="round"/><path d="M${x2 - 14} ${y2 - 10}L${x2} ${y2}L${x2 - 14} ${y2 + 10}" fill="none" stroke="${colour}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;

const assets = [
  {
    assetId: 'g7-math-ratio-line',
    altText: 'Two aligned number lines show that 3 notebooks cost 12 som and that 5 notebooks align with an unknown cost.',
    svg: frame('Proportional number lines', `${text(56,112,'Notebooks',17,'#cbd5e1',700)}${text(56,236,'Cost (som)',17,'#cbd5e1',700)}<path d="M180 105H570M180 230H570" stroke="#94a3b8" stroke-width="5"/>${[0,1,2,3,4,5].map((v,i)=>`<path d="M${190+i*72} 88v34M${190+i*72} 213v34" stroke="#e2e8f0" stroke-width="3"/>${text(190+i*72,78,v,17,'#67e8f9',800,'middle')}`).join('')}${text(406,278,'12',23,'#fbbf24',800,'middle')}${text(550,278,'?',28,'#fbbf24',900,'middle')}<path d="M406 122V213M550 122V213" stroke="#475569" stroke-width="2" stroke-dasharray="7 7"/>`),
  },
  {
    assetId: 'g7-math-percent-grid',
    altText: 'A ten-by-ten grid has four complete columns marked with diagonal lines and six columns unmarked.',
    svg: frame('Hundred-square model', `${Array.from({length:100},(_,i)=>{const x=102+(i%10)*43,y=76+Math.floor(i/10)*25;return `<rect x="${x}" y="${y}" width="39" height="21" rx="2" fill="${i%10<4?'#155e75':'#1e293b'}" stroke="#64748b"/>${i%10<4?`<path d="M${x+4} ${y+17}L${x+34} ${y+4}" stroke="#67e8f9" stroke-width="2"/>`:''}`;}).join('')}${text(320,342,'100 equal cells',16,'#94a3b8',700,'middle')}`),
  },
  {
    assetId: 'g7-math-sequence-table',
    altText: 'A value table pairs n values 1, 2, 3 and 4 with output values 5, 8, 11 and 14.',
    svg: frame('Sequence value table', `${['n','1','2','3','4'].map((v,i)=>`<rect x="${80+i*96}" y="105" width="92" height="64" rx="8" fill="${i===0?'#164e63':'#1e293b'}" stroke="#475569" stroke-width="2"/>${text(126+i*96,146,v,25,i===0?'#67e8f9':'#f8fafc',800,'middle')}`).join('')}${['output','5','8','11','14'].map((v,i)=>`<rect x="${80+i*96}" y="177" width="92" height="64" rx="8" fill="${i===0?'#3b285c':'#1e293b'}" stroke="#475569" stroke-width="2"/>${text(126+i*96,218,v,i===0?16:25,i===0?'#c4b5fd':'#f8fafc',800,'middle')}`).join('')}${text(320,292,'The output increases by 3 each step.',17,'#fbbf24',700,'middle')}`),
  },
  {
    assetId: 'g7-math-transversal',
    altText: 'Two parallel horizontal lines are crossed by a diagonal transversal. A 68-degree angle and angle x occupy corresponding positions.',
    svg: frame('Parallel lines and a transversal', `<path d="M75 125H565M75 270H565" stroke="#e2e8f0" stroke-width="6"/><path d="M195 315L430 78" stroke="#a78bfa" stroke-width="6"/><path d="M334 125A54 54 0 0 0 373 163" fill="none" stroke="#22d3ee" stroke-width="5"/>${text(391,160,'68°',25,'#67e8f9',800,'middle')}<path d="M190 270A56 56 0 0 0 230 309" fill="none" stroke="#fbbf24" stroke-width="5"/>${text(252,310,'x',29,'#fbbf24',900,'middle')}${text(540,112,'∥',24,'#94a3b8',800,'middle')}${text(540,257,'∥',24,'#94a3b8',800,'middle')}`),
  },
  {
    assetId: 'g7-math-circle-radius',
    altText: 'A circle has a line from its centre to its edge labelled radius 7 centimetres.',
    svg: frame('Circle measurement', `<circle cx="320" cy="205" r="112" fill="#164e63" stroke="#67e8f9" stroke-width="6"/><circle cx="320" cy="205" r="7" fill="#fbbf24"/><path d="M320 205H432" stroke="#fbbf24" stroke-width="5" stroke-dasharray="9 6"/>${text(376,190,'7 cm',23,'#fbbf24',800,'middle')}${text(320,337,'Use π = 22/7',17,'#cbd5e1',700,'middle')}`),
  },
  {
    assetId: 'g7-math-spinner',
    altText: 'A spinner is divided into eight equal numbered sectors. Three sectors contain a star symbol and five contain a circle symbol.',
    svg: frame('Eight-sector spinner', `${Array.from({length:8},(_,i)=>{const a1=(-90+i*45)*Math.PI/180,a2=(-90+(i+1)*45)*Math.PI/180;const x1=320+118*Math.cos(a1),y1=205+118*Math.sin(a1),x2=320+118*Math.cos(a2),y2=205+118*Math.sin(a2),am=(a1+a2)/2;return `<path d="M320 205L${x1} ${y1}A118 118 0 0 1 ${x2} ${y2}Z" fill="${i<3?'#155e75':'#312e81'}" stroke="#e2e8f0" stroke-width="2"/>${text(320+82*Math.cos(am),211+82*Math.sin(am),i<3?'★':'●',22,i<3?'#fbbf24':'#c4b5fd',800,'middle')}`;}).join('')}<circle cx="320" cy="205" r="9" fill="#f8fafc"/>${text(320,342,'3 stars • 5 circles',17,'#cbd5e1',700,'middle')}`),
  },
  {
    assetId: 'g7-eng-story-clues',
    altText: 'Three panels show an open window, papers scattered across a classroom floor and a student pointing toward the moving curtains.',
    svg: frame('Inference from visual clues', `<rect x="38" y="85" width="172" height="222" rx="16" fill="#1e293b" stroke="#475569" stroke-width="2"/><rect x="234" y="85" width="172" height="222" rx="16" fill="#1e293b" stroke="#475569" stroke-width="2"/><rect x="430" y="85" width="172" height="222" rx="16" fill="#1e293b" stroke="#475569" stroke-width="2"/><rect x="72" y="118" width="105" height="104" fill="#164e63" stroke="#67e8f9" stroke-width="4"/><path d="M124 118v104M72 170h105" stroke="#67e8f9" stroke-width="3"/><path d="M160 118q30 52 0 104" fill="#8b5cf6" opacity=".8"/>${[[270,160],[328,122],[360,225],[276,255]].map(([x,y],i)=>`<rect x="${x}" y="${y}" width="48" height="34" transform="rotate(${i%2?12:-10} ${x} ${y})" fill="#f8fafc" stroke="#94a3b8"/>`).join('')}<circle cx="492" cy="151" r="24" fill="#fbbf24"/><path d="M492 175v72m0-43-32 18m32-18 48-52" stroke="#e2e8f0" stroke-width="8" stroke-linecap="round"/>${text(516,102,'?',28,'#fbbf24',900,'middle')}`),
  },
  {
    assetId: 'g7-eng-language-effect',
    altText: 'A lighthouse beam crosses dark waves while a caption reads, The lighthouse stitched a path through the storm.',
    svg: frame('Language and effect', `<path d="M30 275q55-35 110 0t110 0t110 0t110 0t110 0" fill="none" stroke="#22d3ee" stroke-width="12"/><path d="M120 260L150 128H210L240 260Z" fill="#e2e8f0" stroke="#64748b" stroke-width="4"/><rect x="143" y="102" width="74" height="37" rx="8" fill="#fbbf24"/><path d="M217 120L590 72L590 185Z" fill="#fde68a" opacity=".25"/><path d="M217 120L590 72M217 120L590 185" stroke="#fbbf24" stroke-width="3" stroke-dasharray="12 8"/>${text(350,325,'“The lighthouse stitched a path through the storm.”',17,'#f8fafc',700,'middle')}`),
  },
  {
    assetId: 'g7-eng-article-layout',
    altText: 'An article plan has a headline, a short introduction, two evidence boxes, an explanation box and a conclusion box connected by arrows.',
    svg: frame('Explanatory article plan', `<rect x="52" y="78" width="536" height="46" rx="10" fill="#164e63" stroke="#22d3ee" stroke-width="2"/>${text(320,108,'HEADLINE',18,'#67e8f9',800,'middle')}<rect x="52" y="138" width="536" height="42" rx="8" fill="#1e293b" stroke="#64748b"/>${text(320,165,'INTRODUCTION',15,'#cbd5e1',800,'middle')}<rect x="52" y="196" width="156" height="72" rx="10" fill="#312e81" stroke="#a78bfa"/>${text(130,238,'EVIDENCE 1',15,'#ddd6fe',800,'middle')}<rect x="242" y="196" width="156" height="72" rx="10" fill="#312e81" stroke="#a78bfa"/>${text(320,238,'EVIDENCE 2',15,'#ddd6fe',800,'middle')}<rect x="432" y="196" width="156" height="72" rx="10" fill="#3f2a0a" stroke="#fbbf24"/>${text(510,238,'EXPLANATION',15,'#fde68a',800,'middle')}<path d="M210 232H235M400 232H425" stroke="#67e8f9" stroke-width="4"/><rect x="164" y="286" width="312" height="42" rx="10" fill="#1e293b" stroke="#64748b"/>${text(320,313,'CONCLUSION',15,'#cbd5e1',800,'middle')}`),
  },
  {
    assetId: 'g7-eng-campaign-poster',
    altText: 'A school campaign poster has a reusable bottle symbol, the slogan Refill today, protect tomorrow and a QR-style action box.',
    svg: frame('Campaign poster', `<rect x="82" y="76" width="476" height="250" rx="18" fill="#164e63" stroke="#22d3ee" stroke-width="4"/>${text(320,119,'REFILL TODAY',30,'#f8fafc',900,'middle')}${text(320,151,'PROTECT TOMORROW',23,'#67e8f9',800,'middle')}<path d="M190 181h72l10 108h-92Z" fill="#0891b2" stroke="#a5f3fc" stroke-width="4"/><rect x="206" y="160" width="40" height="24" rx="7" fill="#a5f3fc"/>${text(226,244,'↻',35,'#f8fafc',900,'middle')}<rect x="360" y="190" width="108" height="86" fill="#f8fafc"/>${Array.from({length:20},(_,i)=>`<rect x="${368+(i%5)*19}" y="${198+Math.floor(i/5)*19}" width="11" height="11" fill="${[0,2,5,6,9,11,14,15,17,19].includes(i)?'#0f172a':'#f8fafc'}"/>`).join('')}${text(414,301,'SCAN TO JOIN',14,'#fde68a',800,'middle')}`),
  },
  {
    assetId: 'g7-sci-specialised-cell',
    altText: 'A long nerve cell has a central cell body, many branched endings and one very long fibre leading to terminal branches.',
    svg: frame('Specialised animal cell', `<circle cx="176" cy="190" r="48" fill="#312e81" stroke="#c4b5fd" stroke-width="5"/><circle cx="176" cy="190" r="18" fill="#a78bfa"/>${[[-55,-55],[-65,-5],[-58,48],[-15,-78],[5,74]].map(([dx,dy])=>`<path d="M${170+dx/2} ${190+dy/2}q${dx/2} ${dy/2} ${dx} ${dy}" fill="none" stroke="#a78bfa" stroke-width="6" stroke-linecap="round"/>`).join('')}<path d="M224 190C340 155 430 220 555 176" fill="none" stroke="#67e8f9" stroke-width="10" stroke-linecap="round"/>${[[555,176,590,135],[555,176,598,177],[555,176,587,221]].map(([x1,y1,x2,y2])=>`<path d="M${x1} ${y1}L${x2} ${y2}" stroke="#67e8f9" stroke-width="7" stroke-linecap="round"/>`).join('')}${text(365,270,'long fibre',18,'#fbbf24',700,'middle')}`),
  },
  {
    assetId: 'g7-sci-diffusion',
    altText: 'Two particle boxes are separated by a dotted membrane. At first most particles are on the left; later they are spread evenly on both sides.',
    svg: frame('Diffusion over time', `<rect x="38" y="100" width="250" height="190" rx="14" fill="#1e293b" stroke="#64748b" stroke-width="3"/><path d="M163 105V285" stroke="#fbbf24" stroke-width="4" stroke-dasharray="8 7"/>${[[70,130],[105,155],[78,210],[128,245],[98,270],[135,115],[210,225]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="10" fill="#22d3ee"/>`).join('')}${text(163,322,'START',16,'#cbd5e1',800,'middle')}${arrow(300,195,340,195,'#fbbf24')}<rect x="352" y="100" width="250" height="190" rx="14" fill="#1e293b" stroke="#64748b" stroke-width="3"/><path d="M477 105V285" stroke="#fbbf24" stroke-width="4" stroke-dasharray="8 7"/>${[[385,135],[430,235],[455,168],[510,255],[540,135],[570,210],[488,110]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="10" fill="#22d3ee"/>`).join('')}${text(477,322,'LATER',16,'#cbd5e1',800,'middle')}`),
  },
  {
    assetId: 'g7-sci-reaction-model',
    altText: 'A particle model shows two AB molecules reacting with one B2 molecule to form two AB2 molecules, with all atoms visible on both sides.',
    svg: frame('Particle reaction model', `${[[80,130],[80,230]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="23" fill="#22d3ee"/>${text(x,y+7,'A',17,'#042f2e',900,'middle')}<circle cx="${x+45}" cy="${y}" r="23" fill="#a78bfa"/>${text(x+45,y+7,'B',17,'#2e1065',900,'middle')}`).join('')}${text(172,187,'+',25,'#f8fafc',800,'middle')}<circle cx="220" cy="175" r="23" fill="#a78bfa"/><circle cx="265" cy="175" r="23" fill="#a78bfa"/>${text(220,182,'B',17,'#2e1065',900,'middle')}${text(265,182,'B',17,'#2e1065',900,'middle')}${arrow(306,180,370,180,'#fbbf24')}${[[430,130],[430,230]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="23" fill="#22d3ee"/>${text(x,y+7,'A',17,'#042f2e',900,'middle')}<circle cx="${x+45}" cy="${y-20}" r="23" fill="#a78bfa"/><circle cx="${x+45}" cy="${y+20}" r="23" fill="#a78bfa"/>${text(x+45,y-13,'B',17,'#2e1065',900,'middle')}${text(x+45,y+27,'B',17,'#2e1065',900,'middle')}`).join('')}`),
  },
  {
    assetId: 'g7-sci-distance-time',
    altText: 'A distance-time graph rises steadily from 0 to 4 minutes, stays horizontal from 4 to 6 minutes, then rises more steeply to 8 minutes.',
    svg: frame('Journey distance–time graph', `<path d="M90 295V82M90 295H575" stroke="#cbd5e1" stroke-width="4"/>${[0,2,4,6,8].map((v,i)=>`${text(100+i*110,325,v,14,'#94a3b8',700,'middle')}<path d="M${100+i*110} 290v10" stroke="#94a3b8" stroke-width="2"/>`).join('')}<path d="M100 290L320 180L430 180L540 95" fill="none" stroke="#22d3ee" stroke-width="7" stroke-linejoin="round"/>${[[100,290],[320,180],[430,180],[540,95]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="8" fill="#fbbf24"/>`).join('')}${text(340,349,'Time (minutes)',15,'#cbd5e1',700,'middle')}${text(42,195,'Distance',15,'#cbd5e1',700,'middle')}`),
  },
  {
    assetId: 'g7-sci-pressure-blocks',
    altText: 'The same rectangular block rests on a wide face at A and on a narrow face at B; both positions are on the same surface.',
    svg: frame('Pressure and contact area', `<path d="M40 286H600" stroke="#64748b" stroke-width="6"/>${text(180,105,'A',24,'#67e8f9',900,'middle')}<rect x="80" y="175" width="200" height="108" rx="8" fill="#164e63" stroke="#22d3ee" stroke-width="5"/>${text(460,105,'B',24,'#fbbf24',900,'middle')}<rect x="405" y="85" width="110" height="198" rx="8" fill="#3f2a0a" stroke="#fbbf24" stroke-width="5"/>${text(180,236,'same block',17,'#cbd5e1',700,'middle')}${text(460,190,'same block',17,'#fde68a',700,'middle')}`),
  },
  {
    assetId: 'g7-sci-parallel-circuit',
    altText: 'A closed circuit has a battery and two separate branches, with one lamp on each branch.',
    svg: frame('Parallel circuit', `<path d="M100 105H540V285H100Z" fill="none" stroke="#cbd5e1" stroke-width="5"/><path d="M215 265v40M238 255v60" stroke="#fbbf24" stroke-width="6"/>${text(226,337,'BATTERY',13,'#fbbf24',800,'middle')}<path d="M100 195H540" stroke="#cbd5e1" stroke-width="5"/>${[[370,105],[370,195]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="31" fill="#1e293b" stroke="#22d3ee" stroke-width="5"/><path d="M${x-16} ${y-16}l32 32m0-32-32 32" stroke="#67e8f9" stroke-width="4"/>`).join('')}${text(487,180,'2 paths',18,'#cbd5e1',800,'middle')}`),
  },
  {
    assetId: 'g7-sci-sankey',
    altText: 'An energy-flow diagram shows 100 joules entering a lamp, 20 joules leaving as light and the remaining arrow leaving as thermal energy.',
    svg: frame('Energy transfer in a lamp', `<path d="M45 170H245V250H45Z" fill="#0891b2"/>${text(145,216,'100 J electrical',18,'#ecfeff',800,'middle')}<rect x="245" y="154" width="90" height="112" rx="12" fill="#334155" stroke="#e2e8f0" stroke-width="3"/>${text(290,216,'LAMP',17,'#f8fafc',800,'middle')}<path d="M335 170H585V202H335Z" fill="#fbbf24"/>${text(458,193,'20 J light',16,'#422006',800,'middle')}<path d="M335 202H535V282H455V250H335Z" fill="#f43f5e"/>${text(435,241,'? J thermal',16,'#fff1f2',800,'middle')}`),
  },
  {
    assetId: 'g7-sci-fair-test',
    altText: 'Three identical beakers each contain 100 millilitres of water at different labelled temperatures, with equal sugar cubes beside them.',
    svg: frame('Dissolving investigation', `${[[70,'20°C'],[250,'40°C'],[430,'60°C']].map(([x,label])=>`<path d="M${x} 110v150q0 28 28 28h94q28 0 28-28V110" fill="#164e63" stroke="#67e8f9" stroke-width="4"/><path d="M${x+8} 180h134v78q0 20-20 20h-94q-20 0-20-20Z" fill="#0891b2" opacity=".8"/>${text(x+75,145,label,20,'#fbbf24',800,'middle')}<rect x="${x+58}" y="222" width="34" height="34" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>${text(x+75,318,'100 mL',15,'#cbd5e1',700,'middle')}`).join('')}`),
  },
  {
    assetId: 'g7-geo-contours',
    altText: 'A contour map has nested closed lines labelled 100, 150, 200 and 250 metres. Point P lies between the 200 and 250 metre contours.',
    svg: frame('Contour map', `<path d="M80 260C42 170 140 80 260 110C355 38 552 87 570 196C590 300 438 333 330 285C220 336 115 319 80 260Z" fill="#164e63" stroke="#67e8f9" stroke-width="3"/><path d="M135 247C95 172 178 105 275 137C364 78 512 117 515 198C520 270 409 292 329 257C250 302 164 290 135 247Z" fill="none" stroke="#67e8f9" stroke-width="3"/><path d="M205 235C164 180 235 137 302 163C368 119 456 149 458 202C461 248 391 263 331 234C280 267 225 263 205 235Z" fill="none" stroke="#67e8f9" stroke-width="3"/><path d="M278 217C255 181 306 160 342 179C380 156 418 177 411 209C401 240 354 238 332 222C309 239 288 236 278 217Z" fill="none" stroke="#fbbf24" stroke-width="4"/>${text(99,265,'100',14,'#cbd5e1',700)}${text(154,246,'150',14,'#cbd5e1',700)}${text(219,232,'200',14,'#cbd5e1',700)}${text(367,192,'250',14,'#fde68a',800)}<circle cx="301" cy="174" r="9" fill="#f43f5e"/>${text(284,160,'P',20,'#fecdd3',900,'middle')}`),
  },
  {
    assetId: 'g7-geo-scale-route',
    altText: 'A route map shows a straight path from the station to the museum measuring 6 centimetres, with scale 1 centimetre to 2.5 kilometres.',
    svg: frame('Route and map scale', `<rect x="70" y="92" width="500" height="190" rx="16" fill="#164e63" stroke="#475569" stroke-width="3"/><rect x="112" y="166" width="54" height="48" fill="#8b5cf6"/>${text(139,232,'STATION',13,'#ddd6fe',800,'middle')}<path d="M166 190H474" stroke="#fbbf24" stroke-width="8" stroke-dasharray="14 10"/><path d="M474 145l62 35v65h-124v-65Z" fill="#0891b2" stroke="#67e8f9" stroke-width="3"/>${text(474,202,'M',26,'#f8fafc',900,'middle')}${text(320,164,'6 cm',20,'#fde68a',800,'middle')}${text(320,321,'Scale: 1 cm represents 2.5 km',17,'#cbd5e1',700,'middle')}`),
  },
  {
    assetId: 'g7-geo-climate-graph',
    altText: 'A climate graph shows monthly rainfall bars highest in June to August and a temperature line lowest in December and January.',
    svg: frame('Annual climate pattern', `<path d="M68 292V86M68 292H592" stroke="#cbd5e1" stroke-width="3"/>${[42,72,88,108,145,210,235,220,170,112,68,48].map((v,i)=>`<rect x="${78+i*42}" y="${292-v*.75}" width="24" height="${v*.75}" rx="4" fill="#0891b2"/>`).join('')}<path d="${[4,6,10,15,20,24,26,25,20,14,8,5].map((v,i)=>`${i?'L':'M'}${90+i*42} ${270-v*6}`).join(' ')}" fill="none" stroke="#fbbf24" stroke-width="5"/>${[4,6,10,15,20,24,26,25,20,14,8,5].map((v,i)=>`<circle cx="${90+i*42}" cy="${270-v*6}" r="5" fill="#fbbf24"/>`).join('')}${['J','F','M','A','M','J','J','A','S','O','N','D'].map((v,i)=>text(90+i*42,318,v,12,'#cbd5e1',700,'middle')).join('')}${text(200,344,'Rainfall bars',13,'#67e8f9',700,'middle')}${text(430,344,'Temperature line',13,'#fbbf24',700,'middle')}`),
  },
  {
    assetId: 'g7-geo-river-profile',
    altText: 'A river long profile descends steeply near its source, becomes gentler downstream and reaches sea level at its mouth.',
    svg: frame('River long profile', `<path d="M75 298V82M75 298H580" stroke="#cbd5e1" stroke-width="4"/><path d="M85 104C150 205 230 244 330 264C430 282 510 289 565 292" fill="none" stroke="#22d3ee" stroke-width="8"/><circle cx="85" cy="104" r="9" fill="#fbbf24"/><circle cx="565" cy="292" r="9" fill="#fbbf24"/>${text(100,88,'SOURCE',15,'#fde68a',800)}${text(552,326,'MOUTH',15,'#fde68a',800,'middle')}${text(320,340,'Distance downstream',15,'#cbd5e1',700,'middle')}`),
  },
  {
    assetId: 'g7-geo-migration-flows',
    altText: 'A regional map shows thicker arrows moving from three rural settlements toward one large city, and a smaller arrow leaving the city.',
    svg: frame('Migration flows', `<path d="M55 95L245 76L320 146L420 88L585 132L565 292L360 315L250 273L90 302Z" fill="#164e63" stroke="#67e8f9" stroke-width="3"/>${[[142,142],[150,255],[465,238]].map(([x,y])=>`<rect x="${x-18}" y="${y-14}" width="36" height="28" fill="#8b5cf6"/>`).join('')}<circle cx="330" cy="195" r="45" fill="#fbbf24"/>${text(330,201,'CITY',17,'#422006',900,'middle')}${arrow(160,145,276,181,'#f8fafc')}${arrow(168,250,286,218,'#f8fafc')}${arrow(447,232,377,211,'#f8fafc')}${arrow(364,172,455,115,'#f43f5e')}${text(104,330,'Arrow width shows number of people',13,'#cbd5e1',700)}`),
  },
  {
    assetId: 'g7-geo-wind-site',
    altText: 'A decision map shows four possible wind-farm sites, homes in the east, a bird nesting zone in the north and strong prevailing winds from the west.',
    svg: frame('Wind-farm site decision', `<rect x="40" y="76" width="560" height="244" rx="16" fill="#164e63" stroke="#475569" stroke-width="3"/>${arrow(60,195,175,195,'#67e8f9')}${text(108,165,'strong wind',14,'#67e8f9',800,'middle')}<ellipse cx="320" cy="118" rx="98" ry="34" fill="#14532d" stroke="#86efac" stroke-width="3"/>${text(320,124,'BIRD NESTING ZONE',13,'#dcfce7',800,'middle')}${[[500,170],[540,170],[500,215],[540,215]].map(([x,y])=>`<rect x="${x}" y="${y}" width="28" height="25" fill="#a78bfa"/><path d="M${x-3} ${y}l17-15 17 15" fill="#c4b5fd"/>`).join('')}${text(520,265,'HOMES',14,'#ddd6fe',800,'middle')}${[['A',170,112],['B',230,240],['C',380,225],['D',440,140]].map(([n,x,y])=>`<circle cx="${x}" cy="${y}" r="19" fill="#fbbf24"/>${text(x,y+6,n,17,'#422006',900,'middle')}`).join('')}`),
  },
];

const assetManifest = assets.map((asset) => {
  const hash = sha256(asset.svg);
  const filename = `${asset.assetId}.${hash.slice(0, 12)}.svg`;
  const sourceFile = `public/question-assets/2026-8-0/${filename}`;
  writeFileSync(path.join(assetDir, filename), asset.svg, 'utf8');
  return {
    assetId: asset.assetId,
    sourceFile,
    publicPath: `/question-assets/2026-8-0/${filename}`,
    mimeType: 'image/svg+xml',
    sha256: hash,
    width: 640,
    height: 360,
    altText: asset.altText,
    license: 'Brains Heist original educational artwork',
    source: 'Brains Heist Visual System',
  };
});

const difficultyByObjectiveIndex = ['easy', 'medium', 'medium', 'hard'];
const pointsByDifficulty = { easy: 10, medium: 15, hard: 20 };
const timeByDifficulty = { easy: 45, medium: 60, hard: 75 };
const usedAssets = new Set();

for (const subject of subjectDefinitions) {
  let globalIndex = 0;
  const questions = [];
  for (const objective of subject.objectives) {
    objective.questions.forEach(([questionText, correctAnswer, distractors, explanation, visualAssetId], objectiveIndex) => {
      const answerIndex = globalIndex % 4;
      const options = [...distractors];
      options.splice(answerIndex, 0, correctAnswer);
      const difficulty = difficultyByObjectiveIndex[objectiveIndex];
      if (visualAssetId) usedAssets.add(visualAssetId);
      questions.push({
        externalId: `bh-g7-${subject.short}-2026.8-${String(globalIndex + 1).padStart(3, '0')}`,
        topic: objective.topic,
        difficulty,
        questionText,
        questionType: 'multiple_choice',
        options,
        correctAnswer,
        explanation,
        points: pointsByDifficulty[difficulty],
        timeLimit: timeByDifficulty[difficulty],
        tags: [objective.code, objective.topic.toLowerCase()],
        ...(visualAssetId ? { visualAssetId } : {}),
        curriculum: {
          strand: objective.topic,
          skill: `Apply ${objective.topic.toLowerCase()}`,
          subskill: objective.topic.toLowerCase(),
          objective: objective.statement,
        },
        mappings: [{ scopeCode: `${subject.subjectCode}-grade-7`, objectiveCode: objective.code }],
      });
      globalIndex += 1;
    });
  }
  writeFileSync(path.join(packageDir, subject.file), `${JSON.stringify({
    subject: subject.subject,
    subjectCode: subject.subjectCode,
    grade: 7,
    language: 'en',
    questions,
  }, null, 2)}\n`, 'utf8');
}

if (usedAssets.size !== 24 || usedAssets.size !== assetManifest.length) {
  throw new Error(`Expected exactly 24 referenced assets, found ${usedAssets.size} references and ${assetManifest.length} assets.`);
}

const manifest = {
  schemaVersion: 2,
  packageId: 'brain-heist-grade-7-core-2026-8',
  packageVersion: '2026.8.0',
  contentVersion: 'brain-heist-2026-8',
  authority: 'Brains Heist Academic Governance',
  releaseNotes: 'Seventh production package: 80 original Grade 7 questions across Mathematics, English, Integrated Science and Geography, supported by 24 checksum-verified Brains Heist SVG learning assets.',
  curriculum: { frameworkCode: 'brain-heist-international', versionCode: '2026-8' },
  assetBaseUrl: 'https://www.brainsheist.com',
  assets: assetManifest,
  files: subjectDefinitions.map((subject) => subject.file),
};
writeFileSync(path.join(packageDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Built ${manifest.packageId}@${manifest.packageVersion}: 80 questions and ${assetManifest.length} SVG assets.`);
