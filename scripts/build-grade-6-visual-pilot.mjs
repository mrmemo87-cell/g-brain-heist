#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = path.join(root, 'content', 'verified-question-packages', '2026-7-0');
const assetDir = path.join(root, 'public', 'question-assets', '2026-7-0');
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

const assets = [
  {
    assetId: 'g6-math-place-value',
    altText: 'A place-value chart showing the number 472,615, with the digit 7 in the ten-thousands column.',
    svg: frame('Place-value chart', `${['100,000s','10,000s','1,000s','100s','10s','1s'].map((label, i) => `${text(80 + i * 100, 104, label, 13, '#94a3b8', 700, 'middle')}<rect x="${32 + i * 100}" y="125" width="96" height="128" rx="12" fill="${i === 1 ? '#164e63' : '#1e293b'}" stroke="${i === 1 ? '#22d3ee' : '#475569'}" stroke-width="2"/>${text(80 + i * 100, 210, '472615'[i], 54, i === 1 ? '#67e8f9' : '#f8fafc', 800, 'middle')}`).join('')}${text(320, 305, '472,615', 34, '#fbbf24', 800, 'middle')}`),
  },
  {
    assetId: 'g6-math-fraction-bar',
    altText: 'A bar divided into eight equal sections. Six sections are shaded cyan and two are unshaded.',
    svg: frame('Fraction bar', `${Array.from({ length: 8 }, (_, i) => `<rect x="48" y="125" width="68" height="96" transform="translate(${i * 68} 0)" fill="${i < 6 ? '#0891b2' : '#1e293b'}" stroke="#e2e8f0" stroke-width="3"/>`).join('')}${text(320, 285, '8 equal sections', 22, '#cbd5e1', 700, 'middle')}`),
  },
  {
    assetId: 'g6-math-number-line',
    altText: 'A number line from 0 to 2 marked in halves. Point P is halfway between 1 and 2.',
    svg: frame('Number line', `<path d="M80 190H560" stroke="#e2e8f0" stroke-width="5" stroke-linecap="round"/>${[0,0.5,1,1.5,2].map((v,i)=>`<path d="M${80+i*120} 170V210" stroke="#e2e8f0" stroke-width="4"/>${text(80+i*120,246,String(v),20,'#cbd5e1',700,'middle')}`).join('')}<circle cx="440" cy="190" r="13" fill="#fbbf24" stroke="#0f172a" stroke-width="4"/>${text(440,140,'P',24,'#fbbf24',800,'middle')}`),
  },
  {
    assetId: 'g6-math-tile-pattern',
    altText: 'Three tile figures contain 4, 7 and 10 squares. Each new figure adds a vertical group of three squares.',
    svg: frame('Growing tile pattern', `${[0,1,2].map((fig)=>{const count=4+fig*3;const ox=58+fig*190;return `${text(ox+60,92,`Figure ${fig+1}`,16,'#cbd5e1',700,'middle')}${Array.from({length:count},(_,i)=>{const col=Math.floor(i/3),row=i%3;return `<rect x="${ox+col*30}" y="${130+row*30}" width="26" height="26" rx="4" fill="${col===0?'#8b5cf6':'#0891b2'}" stroke="#e2e8f0"/>`;}).join('')}${text(ox+60,270,`${count} tiles`,18,'#fbbf24',800,'middle')}`}).join('')}`),
  },
  {
    assetId: 'g6-math-straight-angle',
    altText: 'A straight horizontal line has an upward ray. The angle on the left is 118 degrees and the adjacent angle on the right is x.',
    svg: frame('Angles on a straight line', `<path d="M70 250H570M320 250L215 95" stroke="#e2e8f0" stroke-width="6" stroke-linecap="round"/><path d="M260 162A108 108 0 0 0 213 230" fill="none" stroke="#22d3ee" stroke-width="5"/><path d="M337 206A58 58 0 0 1 382 250" fill="none" stroke="#fbbf24" stroke-width="5"/>${text(180,185,'118°',28,'#67e8f9',800,'middle')}${text(382,215,'x',32,'#fbbf24',800,'middle')}`),
  },
  {
    assetId: 'g6-math-coordinate-translation',
    altText: 'A coordinate grid shows point A at negative 2, 1 and an arrow labelled translation plus 5, minus 3.',
    svg: frame('Coordinate translation', `${Array.from({length:11},(_,i)=>`<path d="M${70+i*50} 80V330M70 ${80+i*25}H570" stroke="#334155" stroke-width="1"/>`).join('')}<path d="M320 80V330M70 205H570" stroke="#94a3b8" stroke-width="3"/><circle cx="220" cy="180" r="11" fill="#22d3ee"/>${text(198,160,'A (−2, 1)',18,'#67e8f9',800,'middle')}<path d="M236 190L455 262" stroke="#fbbf24" stroke-width="5" stroke-dasharray="10 8" marker-end="url(#a)"/><defs><marker id="a" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0 0L9 3L0 6Z" fill="#fbbf24"/></marker></defs>${text(370,205,'(+5, −3)',20,'#fbbf24',800,'middle')}`),
  },
  {
    assetId: 'g6-math-books-bar-chart',
    altText: 'A bar chart shows books read by four groups: Orion 6, Nova 9, Pulse 4 and Zenith 7.',
    svg: frame('Books read by each group', `${[0,2,4,6,8,10].map((v,i)=>`<path d="M86 ${294-i*42}H590" stroke="#334155"/>${text(70,300-i*42,String(v),14,'#94a3b8',600,'end')}`).join('')}${[['Orion',6],['Nova',9],['Pulse',4],['Zenith',7]].map(([n,v],i)=>`<rect x="${112+i*118}" y="${294-v*21}" width="64" height="${v*21}" rx="8" fill="${i%2?'#8b5cf6':'#0891b2'}"/>${text(144+i*118,320,n,15,'#cbd5e1',700,'middle')}${text(144+i*118,280-v*21,String(v),18,'#f8fafc',800,'middle')}`).join('')}`),
  },
  {
    assetId: 'g6-english-story-sequence',
    altText: 'Three panels show rain clouds approaching, a student covering a cardboard box, and the student later opening the dry box of books.',
    svg: frame('Visual story sequence', `${[0,1,2].map(i=>`<rect x="${36+i*202}" y="82" width="178" height="224" rx="18" fill="#1e293b" stroke="#475569" stroke-width="2"/>${text(56+i*202,110,String(i+1),17,'#67e8f9',800)}`).join('')}<path d="M70 145c18-30 65-24 72 8 28-10 48 22 23 38H76c-30-8-26-39-6-46Z" fill="#64748b"/><path d="M93 204l-14 30m48-30-14 30m48-30-14 30" stroke="#22d3ee" stroke-width="5"/><rect x="250" y="205" width="90" height="54" fill="#a16207" stroke="#fbbf24" stroke-width="3"/><path d="M244 205L350 205L330 165H264Z" fill="#8b5cf6"/><circle cx="294" cy="140" r="23" fill="#fbbf24"/><path d="M294 163v50m0-30-34 24m34-24 38 20" stroke="#e2e8f0" stroke-width="8" stroke-linecap="round"/><rect x="454" y="195" width="100" height="62" fill="#a16207" stroke="#fbbf24" stroke-width="3"/><path d="M454 195L477 163H577L554 195" fill="#a16207" stroke="#fbbf24" stroke-width="3"/><rect x="470" y="175" width="18" height="54" fill="#22d3ee"/><rect x="492" y="168" width="18" height="61" fill="#8b5cf6"/><rect x="514" y="181" width="18" height="48" fill="#f43f5e"/>`),
  },
  {
    assetId: 'g6-english-direct-speech',
    altText: 'Maya says, I finished my project. A speech bubble shows the exact spoken words without punctuation.',
    svg: frame('Direct speech', `<circle cx="150" cy="202" r="48" fill="#fbbf24"/><path d="M150 250v50m0-25-44 24m44-24 44 24" stroke="#e2e8f0" stroke-width="9" stroke-linecap="round"/><path d="M245 105H560a24 24 0 0 1 24 24v98a24 24 0 0 1-24 24H340l-54 46 10-46h-51a24 24 0 0 1-24-24v-98a24 24 0 0 1 24-24Z" fill="#1e293b" stroke="#22d3ee" stroke-width="4"/>${text(402,170,'I finished my project',25,'#f8fafc',700,'middle')}${text(150,115,'Maya',18,'#fbbf24',800,'middle')}`),
  },
  {
    assetId: 'g6-english-paragraph-plan',
    altText: 'Four planning cards are labelled Claim, Evidence, Explanation and Link. Arrows show a blank position immediately after Claim.',
    svg: frame('Paragraph plan', `${['Claim','?','Explanation','Link'].map((v,i)=>`<rect x="${34+i*151}" y="130" width="125" height="100" rx="14" fill="${i===1?'#3f2a0a':'#1e293b'}" stroke="${i===1?'#fbbf24':'#475569'}" stroke-width="3"/>${text(96+i*151,188,v,20,i===1?'#fbbf24':'#e2e8f0',800,'middle')}${i<3?`<path d="M164 ${180}H177" stroke="#67e8f9" stroke-width="4"/><path d="M174 173l10 7-10 7" fill="#67e8f9"/>`:''}`).join('')}${text(320,285,'Which step belongs in the missing card?',18,'#94a3b8',700,'middle')}`),
  },
  {
    assetId: 'g6-science-plant-cell',
    altText: 'A simplified plant cell diagram. Label X points to the thick outer boundary surrounding the cell.',
    svg: frame('Plant cell', `<rect x="130" y="82" width="380" height="230" rx="36" fill="#14532d" stroke="#86efac" stroke-width="10"/><rect x="150" y="102" width="340" height="190" rx="28" fill="#164e63" stroke="#67e8f9" stroke-width="4"/><ellipse cx="320" cy="198" rx="112" ry="64" fill="#0e7490" stroke="#a5f3fc" stroke-width="3"/><circle cx="210" cy="155" r="34" fill="#8b5cf6"/><circle cx="210" cy="155" r="12" fill="#c4b5fd"/><path d="M90 118H132" stroke="#fbbf24" stroke-width="5"/><path d="M127 110l14 8-14 8" fill="#fbbf24"/>${text(72,124,'X',27,'#fbbf24',800,'middle')}`),
  },
  {
    assetId: 'g6-science-food-chain',
    altText: 'A food chain reads grass to grasshopper to frog to hawk, with arrows pointing toward the organism receiving energy.',
    svg: frame('Food chain', `${[['GRASS','#22c55e'],['GRASSHOPPER','#84cc16'],['FROG','#14b8a6'],['HAWK','#f59e0b']].map(([n,c],i)=>`<circle cx="${83+i*158}" cy="180" r="55" fill="${c}" opacity=".25" stroke="${c}" stroke-width="4"/>${text(83+i*158,187,n,i===1?13:16,'#f8fafc',800,'middle')}${i<3?`<path d="M142 180H175" stroke="#e2e8f0" stroke-width="5"/><path d="M169 169l18 11-18 11" fill="#e2e8f0"/>`:''}`).join('')}`),
  },
  {
    assetId: 'g6-science-particles',
    altText: 'Three boxes show particles: A tightly ordered, B close together but irregular, and C widely spaced throughout the container.',
    svg: frame('Particle models', `${['A','B','C'].map((lab,i)=>`<rect x="${40+i*205}" y="90" width="170" height="210" rx="16" fill="#1e293b" stroke="#475569" stroke-width="3"/>${text(125+i*205,326,lab,20,'#fbbf24',800,'middle')}`).join('')}${Array.from({length:20},(_,i)=>`<circle cx="${67+(i%5)*28}" cy="${126+Math.floor(i/5)*28}" r="9" fill="#22d3ee"/>`).join('')}${Array.from({length:18},(_,i)=>`<circle cx="${254+(i%4)*35+(Math.floor(i/4)%2)*8}" cy="${126+Math.floor(i/4)*37}" r="9" fill="#a78bfa"/>`).join('')}${[[480,120],[575,146],[502,189],[548,248],[465,270],[590,282],[525,104],[602,211]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="9" fill="#fbbf24"/>`).join('')}`),
  },
  {
    assetId: 'g6-science-force-arrows',
    altText: 'A box has a 6-newton force arrow pointing right and a 2-newton force arrow pointing left.',
    svg: frame('Forces on a box', `<rect x="245" y="135" width="150" height="110" rx="15" fill="#334155" stroke="#e2e8f0" stroke-width="4"/>${text(320,198,'BOX',24,'#f8fafc',800,'middle')}<path d="M395 190H555" stroke="#22d3ee" stroke-width="8"/><path d="M535 173l28 17-28 17" fill="#22d3ee"/>${text(485,155,'6 N',24,'#67e8f9',800,'middle')}<path d="M245 190H145" stroke="#fbbf24" stroke-width="8"/><path d="M165 173l-28 17 28 17" fill="#fbbf24"/>${text(190,155,'2 N',24,'#fbbf24',800,'middle')}`),
  },
  {
    assetId: 'g6-science-series-circuit',
    altText: 'A closed series circuit contains one battery and two lamps on a single loop with no branches.',
    svg: frame('Series circuit', `<path d="M110 120H530V270H110Z" fill="none" stroke="#cbd5e1" stroke-width="5"/><path d="M270 250V290M290 240V300" stroke="#fbbf24" stroke-width="6"/>${text(280,325,'BATTERY',14,'#fbbf24',800,'middle')}${[215,425].map(x=>`<circle cx="${x}" cy="120" r="32" fill="#1e293b" stroke="#22d3ee" stroke-width="5"/><path d="M${x-17} 103l34 34m0-34-34 34" stroke="#67e8f9" stroke-width="4"/>`).join('')}${text(320,190,'ONE LOOP',20,'#94a3b8',800,'middle')}`),
  },
  {
    assetId: 'g6-science-earth-rotation',
    altText: 'The Sun is on the left and Earth is on the right. Half of Earth faces the Sun, and a curved arrow shows Earth rotating on its axis.',
    svg: frame('Earth and Sun', `<circle cx="145" cy="190" r="67" fill="#f59e0b" stroke="#fde68a" stroke-width="7"/>${text(145,196,'SUN',20,'#422006',900,'middle')}<circle cx="455" cy="190" r="82" fill="#0e7490" stroke="#67e8f9" stroke-width="5"/><path d="M455 108A82 82 0 0 1 455 272Z" fill="#020617" opacity=".82"/><path d="M390 96A108 108 0 0 1 522 101" fill="none" stroke="#fbbf24" stroke-width="5"/><path d="M510 88l20 14-23 8" fill="#fbbf24"/><path d="M220 170H345M220 210H345" stroke="#fde68a" stroke-width="4" stroke-dasharray="10 8"/>`),
  },
  {
    assetId: 'g6-science-temperature-graph',
    altText: 'A line graph shows temperature at 0, 2, 4, 6 and 8 minutes as 20, 32, 38, 42 and 44 degrees Celsius.',
    svg: frame('Heating investigation', `<path d="M90 290V88M90 290H575" stroke="#cbd5e1" stroke-width="4"/>${[20,30,40,50].map((v,i)=>`${text(70,270-i*55,String(v),14,'#94a3b8',700,'end')}<path d="M90 ${265-i*55}H575" stroke="#334155"/>`).join('')}${[0,2,4,6,8].map((v,i)=>text(100+i*110,320,String(v),14,'#94a3b8',700,'middle')).join('')}<path d="M100 265L210 199L320 166L430 144L540 133" fill="none" stroke="#22d3ee" stroke-width="6"/>${[[100,265],[210,199],[320,166],[430,144],[540,133]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="8" fill="#fbbf24"/>`).join('')}${text(332,347,'Time (minutes)',15,'#cbd5e1',700,'middle')}`),
  },
  {
    assetId: 'g6-geo-compass',
    altText: 'A compass rose labels north, east, south and west, with northeast, southeast, southwest and northwest shown between them.',
    svg: frame('Compass rose', `<circle cx="320" cy="200" r="110" fill="#1e293b" stroke="#475569" stroke-width="3"/><path d="M320 76L345 200L320 324L295 200Z" fill="#22d3ee"/><path d="M196 200L320 175L444 200L320 225Z" fill="#8b5cf6" opacity=".9"/>${text(320,92,'N',25,'#f8fafc',900,'middle')}${text(320,332,'S',25,'#f8fafc',900,'middle')}${text(454,208,'E',25,'#f8fafc',900,'middle')}${text(185,208,'W',25,'#f8fafc',900,'middle')}${text(405,120,'NE',16,'#fbbf24',800,'middle')}${text(405,292,'SE',16,'#fbbf24',800,'middle')}${text(235,292,'SW',16,'#fbbf24',800,'middle')}${text(235,120,'NW',16,'#fbbf24',800,'middle')}`),
  },
  {
    assetId: 'g6-geo-grid-map',
    altText: 'A four-by-four grid has columns A to D and rows 1 to 4. The museum symbol is in column C, row 2.',
    svg: frame('Four-figure grid reference', `${['A','B','C','D'].map((v,i)=>text(170+i*100,90,v,18,'#fbbf24',800,'middle')).join('')}${['1','2','3','4'].map((v,i)=>text(105,135+i*55,v,18,'#fbbf24',800,'middle')).join('')}${Array.from({length:5},(_,i)=>`<path d="M120 ${105+i*55}H520M${120+i*100} 105V325" stroke="#64748b" stroke-width="2"/>`).join('')}<rect x="335" y="178" width="70" height="36" rx="5" fill="#8b5cf6"/><path d="M328 178l42-24 42 24" fill="#a78bfa"/>${text(370,202,'M',18,'#f8fafc',900,'middle')}`),
  },
  {
    assetId: 'g6-geo-rainfall-chart',
    altText: 'A monthly rainfall bar chart shows January 42, February 55, March 78, April 64, May 38 and June 30 millimetres.',
    svg: frame('Monthly rainfall (mm)', `${[0,20,40,60,80].map((v,i)=>`<path d="M78 ${300-i*52}H600" stroke="#334155"/>${text(64,305-i*52,String(v),13,'#94a3b8',600,'end')}`).join('')}${[['Jan',42],['Feb',55],['Mar',78],['Apr',64],['May',38],['Jun',30]].map(([n,v],i)=>`<rect x="${99+i*82}" y="${300-v*2.6}" width="48" height="${v*2.6}" rx="7" fill="${i===2?'#fbbf24':'#0891b2'}"/>${text(123+i*82,326,n,14,'#cbd5e1',700,'middle')}`).join('')}`),
  },
  {
    assetId: 'g6-geo-river-bend',
    altText: 'A river bends from upper left to lower right. X marks the outside of the bend and Y marks the inside of the bend.',
    svg: frame('River bend', `<path d="M80 90C500 80 190 270 560 292" fill="none" stroke="#0e7490" stroke-width="92" stroke-linecap="round"/><path d="M80 90C500 80 190 270 560 292" fill="none" stroke="#67e8f9" stroke-width="4" stroke-dasharray="14 12"/><circle cx="395" cy="129" r="20" fill="#f43f5e"/>${text(395,136,'X',20,'#fff',900,'middle')}<circle cx="290" cy="216" r="20" fill="#fbbf24"/>${text(290,223,'Y',20,'#422006',900,'middle')}`),
  },
  {
    assetId: 'g6-geo-population-pyramid',
    altText: 'A population pyramid has a very broad base for ages 0 to 14 and becomes steadily narrower in older age groups.',
    svg: frame('Population structure', `${[['65+',55],['45–64',95],['25–44',145],['15–24',185],['0–14',235]].map(([lab,w],i)=>{const y=90+i*48;return `<rect x="${320-w}" y="${y}" width="${w}" height="34" fill="#8b5cf6"/><rect x="320" y="${y}" width="${w}" height="34" fill="#0891b2"/>${text(320,y+23,lab,13,'#f8fafc',800,'middle')}`}).join('')}<path d="M320 80V330" stroke="#e2e8f0" stroke-width="3"/>${text(205,344,'Male',15,'#c4b5fd',800,'middle')}${text(435,344,'Female',15,'#67e8f9',800,'middle')}`),
  },
  {
    assetId: 'g6-geo-land-use-map',
    altText: 'A planning map shows a river and forest in the west, homes in the north, and four possible factory sites. Site D is beside the main road in the southeast, away from the river, forest and homes.',
    svg: frame('Land-use planning map', `<rect x="34" y="74" width="572" height="250" rx="14" fill="#164e63"/><path d="M85 74C145 145 85 210 150 324" fill="none" stroke="#22d3ee" stroke-width="28"/><path d="M36 292H604" stroke="#f8fafc" stroke-width="18"/><path d="M36 292H604" stroke="#475569" stroke-width="4" stroke-dasharray="16 14"/>${[[195,110],[235,120],[210,155],[260,165]].map(([x,y])=>`<path d="M${x} ${y}l-15 30h30Z" fill="#22c55e"/>`).join('')}${text(225,205,'FOREST',15,'#86efac',800,'middle')}${[[405,100],[455,100],[505,100]].map(([x,y])=>`<rect x="${x}" y="${y}" width="34" height="28" fill="#a78bfa"/><path d="M${x-4} ${y}l21-18 21 18" fill="#c4b5fd"/>`).join('')}${text(470,155,'HOMES',15,'#ddd6fe',800,'middle')}${[['A',170,250],['B',350,210],['C',520,190],['D',500,270]].map(([n,x,y])=>`<circle cx="${x}" cy="${y}" r="18" fill="#fbbf24"/>${text(x,y+6,n,17,'#422006',900,'middle')}`).join('')}`),
  },
  {
    assetId: 'g6-geo-catchment-trees',
    altText: 'Two hills receive the same rain. The wooded hill shows more infiltration arrows into soil, while the bare hill shows more surface runoff into a stream.',
    svg: frame('Trees and storm runoff', `<path d="M35 285L180 115L310 285Z" fill="#14532d" stroke="#86efac" stroke-width="3"/><path d="M330 285L465 115L610 285Z" fill="#713f12" stroke="#fbbf24" stroke-width="3"/>${[105,150,200,245].map(x=>`<path d="M${x} 235v-48m-20 15h40l-20-38Z" fill="#22c55e" stroke="#86efac" stroke-width="2"/>`).join('')}${[90,145,205,390,455,520].map(x=>`<path d="M${x} 82l-9 23m28-23-9 23" stroke="#22d3ee" stroke-width="4"/>`).join('')}<path d="M390 185C450 195 490 240 565 270" fill="none" stroke="#67e8f9" stroke-width="8" marker-end="url(#r)"/><defs><marker id="r" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0 0L9 3L0 6Z" fill="#67e8f9"/></marker></defs>${[125,185,235].map(x=>`<path d="M${x} 245v45" stroke="#a7f3d0" stroke-width="5"/>`).join('')}`),
  },
];

const assetManifest = assets.map((asset) => {
  const hash = sha256(asset.svg);
  const filename = `${asset.assetId}.${hash.slice(0, 12)}.svg`;
  const sourceFile = `public/question-assets/2026-7-0/${filename}`;
  writeFileSync(path.join(assetDir, filename), asset.svg, 'utf8');
  return {
    assetId: asset.assetId,
    sourceFile,
    publicPath: `/question-assets/2026-7-0/${filename}`,
    mimeType: 'image/svg+xml',
    sha256: hash,
    width: 640,
    height: 360,
    altText: asset.altText,
    license: 'Brains Heist original educational artwork',
    source: 'Brains Heist Visual System',
  };
});

const subjectDefinitions = [
  {
    subject: 'Mathematics', subjectCode: 'mathematics', short: 'math', file: 'mathematics-grade-6.json',
    objectives: [
      { code: 'math6-number-operations', topic: 'Number and operations', statement: 'Use place value, estimation and the order of operations to solve and check whole-number problems.', questions: [
        ['What is the value of the digit 7 in the number shown?', '70,000', ['7,000','700','700,000'], 'The digit 7 is in the ten-thousands column, so its value is 70,000.', 'g6-math-place-value'],
        ['Calculate 3,480 ÷ 12.', '290', ['29','280','2,900'], 'Since 12 × 290 = 3,480, the quotient is 290.'],
        ['Which is the best estimate for 598 × 41?', '24,000', ['2,400','240,000','6,000'], 'Rounding 598 to 600 and 41 to 40 gives 600 × 40 = 24,000.'],
        ['Evaluate 48 − 3 × (7 + 5).', '12', ['540','180','36'], 'Brackets give 12, multiplication gives 36, and 48 − 36 equals 12.'],
      ]},
      { code: 'math6-fractions-ratio', topic: 'Fractions, decimals and ratio', statement: 'Represent, compare and calculate with fractions, decimals, percentages and simple ratios.', questions: [
        ['What fraction of the bar is shaded, written in simplest form?', '3/4', ['6/7','2/8','4/3'], 'Six of eight equal parts are shaded, and 6/8 simplifies to 3/4.', 'g6-math-fraction-bar'],
        ['Which mixed number is represented by point P?', '1 1/2', ['1 1/4','1 3/4','2 1/2'], 'Point P is halfway between 1 and 2, which is 1 1/2.', 'g6-math-number-line'],
        ['Red and blue counters are in the ratio 3:5. There are 24 counters altogether. How many are red?', '9', ['8','15','18'], 'The ratio has 8 parts; 24 ÷ 8 = 3 per part, and 3 red parts give 9 counters.'],
        ['A recipe uses 2.5 cups of flour for 10 portions. How much flour is needed for 18 portions?', '4.5 cups', ['3.6 cups','5 cups','6.25 cups'], 'Each portion uses 0.25 cup, so 18 portions need 18 × 0.25 = 4.5 cups.'],
      ]},
      { code: 'math6-algebra-patterns', topic: 'Algebra and patterns', statement: 'Generalise numerical patterns, form expressions and solve simple equations in context.', questions: [
        ['The figures contain 4, 7 and 10 tiles. How many tiles will Figure 10 contain?', '31', ['28','30','34'], 'The rule is 3n + 1, so Figure 10 contains 3 × 10 + 1 = 31 tiles.', 'g6-math-tile-pattern'],
        ['Solve 5x + 7 = 32.', 'x = 5', ['x = 3','x = 7','x = 8'], 'Subtracting 7 gives 5x = 25, then dividing by 5 gives x = 5.'],
        ['A rectangle has width x and length x + 3. Which expression gives its perimeter?', '4x + 6', ['2x + 3','2x + 6','4x + 3'], 'Perimeter is 2x + 2(x + 3), which simplifies to 4x + 6.'],
        ['Plan A costs 4n + 12 soms and Plan B costs 6n soms. For what value of n do they cost the same?', 'n = 6', ['n = 2','n = 3','n = 12'], 'Setting 4n + 12 equal to 6n gives 12 = 2n, so n = 6.'],
      ]},
      { code: 'math6-geometry-measurement', topic: 'Geometry and measurement', statement: 'Apply angle, coordinate, area and volume relationships to solve geometric problems.', questions: [
        ['What is the value of x in the diagram?', '62°', ['52°','72°','118°'], 'Angles on a straight line total 180°, so x = 180° − 118° = 62°.', 'g6-math-straight-angle'],
        ['Point A is translated by (+5, −3). What are the coordinates of its image?', '(3, −2)', ['(−7, 4)','(3, 4)','(−3, 2)'], 'Starting at (−2, 1), add 5 to x and subtract 3 from y to get (3, −2).', 'g6-math-coordinate-translation'],
        ['A 10 cm by 8 cm rectangle has a 4 cm by 3 cm corner removed. What is the remaining area?', '68 cm²', ['56 cm²','72 cm²','92 cm²'], 'The full area is 80 cm² and the removed area is 12 cm², leaving 68 cm².'],
        ['A rectangular prism measures 6 cm by 4 cm by 5 cm. What is its volume?', '120 cm³', ['30 cm³','60 cm³','150 cm³'], 'Volume equals length × width × height: 6 × 4 × 5 = 120 cm³.'],
      ]},
      { code: 'math6-data-probability', topic: 'Data and probability', statement: 'Interpret data displays and use averages, range and probability to draw justified conclusions.', questions: [
        ['How many books did the four groups read altogether?', '26', ['22','24','30'], 'Adding the four bar values gives 6 + 9 + 4 + 7 = 26 books.', 'g6-math-books-bar-chart'],
        ['A fair spinner has 8 equal sectors and 3 are blue. What is the probability of landing on blue?', '3/8', ['3/5','5/8','1/3'], 'Three of the eight equally likely sectors are blue, so the probability is 3/8.'],
        ['What is the mean of 8, 10, 12, 14 and 16?', '12', ['10','13','60'], 'The total is 60 and there are five values, so the mean is 60 ÷ 5 = 12.'],
        ['A graph comparing 92% and 96% begins its vertical axis at 90%. Why might the bars be misleading?', 'The shortened axis exaggerates the difference', ['The values are percentages','The bars use equal widths','The categories have labels'], 'Starting at 90% makes a four-point difference look much larger than it is on a full zero-to-100 scale.'],
      ]},
    ],
  },
  {
    subject: 'English', subjectCode: 'english', short: 'eng', file: 'english-grade-6.json',
    objectives: [
      { code: 'eng6-reading-inference', topic: 'Reading and inference', statement: 'Retrieve evidence, infer meaning and identify purpose and main ideas across age-appropriate texts.', questions: [
        ['What can the reader infer from the visual sequence?', 'The student protected the books from the rain', ['The student threw the books away','The box was empty at the end','The rain damaged every book'], 'The covered box is later opened with dry books inside, showing that the student protected them.', 'g6-english-story-sequence'],
        ['Lina checked the clock twice, packed her bag by the door and kept her shoes on. What can be inferred?', 'She expected to leave soon', ['She had lost her shoes','She wanted to go to sleep','She planned to unpack the bag'], 'The clock checks, packed bag and shoes all suggest that Lina expected to leave soon.'],
        ['A character says, “I am fine,” but avoids eye contact and tears the edge of a tissue. Which detail best challenges the spoken claim?', 'The character avoids eye contact and tears the tissue', ['The character uses the word fine','The sentence is written in quotation marks','The tissue has an edge'], 'The nervous physical actions provide evidence that the character may not actually feel fine.'],
        ['A paragraph explains how reusable bottles reduce waste and save money over time. What is its main purpose?', 'To explain benefits of choosing reusable bottles', ['To narrate a journey to a factory','To describe the colour of one bottle','To argue that water is unnecessary'], 'Both supporting points explain practical benefits of using a reusable bottle.'],
      ]},
      { code: 'eng6-vocabulary-context', topic: 'Vocabulary in context', statement: 'Use context, word parts and figurative language to determine precise meanings and effects.', questions: [
        ['Nuri was reluctant to enter the competition, but his friends eventually persuaded him. What does reluctant mean?', 'Unwilling at first', ['Certain to win','Extremely noisy','Ready immediately'], 'The contrast with being persuaded shows that Nuri was unwilling or hesitant at first.'],
        ['In “The river was a silver ribbon through the valley,” which technique is used?', 'Metaphor', ['Rhyme','Onomatopoeia','Alliteration'], 'The river is directly described as a silver ribbon without using like or as, making it a metaphor.'],
        ['What does the prefix mis- mean in the word miscalculate?', 'Wrongly', ['Again','Before','Without'], 'The prefix mis- means wrongly or badly, so miscalculate means to calculate incorrectly.'],
        ['Which word suggests someone walked in a relaxed, unhurried way?', 'Strolled', ['Marched','Raced','Stumbled'], 'Strolled carries the precise meaning of walking in a relaxed and unhurried manner.'],
      ]},
      { code: 'eng6-grammar-sentences', topic: 'Grammar and sentence control', statement: 'Control agreement, pronouns, punctuation and clause structures to create accurate sentences.', questions: [
        ['Which sentence correctly punctuates Maya’s exact words?', 'Maya said, “I finished my project.”', ['Maya said “I finished my project”.','Maya said, I finished my project.','Maya said “I finished, my project.”'], 'A reporting clause is followed by a comma, and the spoken sentence is enclosed in quotation marks with punctuation inside.', 'g6-english-direct-speech'],
        ['Choose the sentence with correct subject–verb agreement.', 'The basket of apples is on the table.', ['The basket of apples are on the table.','The students in my class enjoys reading.','Each of the players have a number.'], 'The subject is the singular noun basket, so the correct verb is is.'],
        ['In “When Sara met Amina, she was carrying a violin,” what is the main problem?', 'The pronoun she has an unclear reference', ['The sentence has no verb','The comma creates a fragment','Violin is spelled incorrectly'], 'She could refer to Sara or Amina, so the pronoun reference is ambiguous.'],
        ['Which sentence combines the ideas most clearly: The path was steep. We continued climbing.', 'Although the path was steep, we continued climbing.', ['The path steep and continued climbing.','We continued because steep the path.','Steep, the path we climbing continued.'], 'Although creates a clear subordinate clause showing contrast between the difficulty and the continued action.'],
      ]},
      { code: 'eng6-writing-organisation', topic: 'Writing organisation', statement: 'Organise ideas into coherent paragraphs using evidence, explanation, transitions and purposeful editing.', questions: [
        ['Which step should replace the missing card after a claim?', 'Evidence', ['A new title','An unrelated fact','A repeated claim'], 'Evidence should follow and support a claim before the writer explains its significance and links back.', 'g6-english-paragraph-plan'],
        ['Which transition best shows contrast?', 'However', ['Similarly','Therefore','For example'], 'However signals that the next idea contrasts with the one that came before it.'],
        ['Which is the strongest topic sentence for a paragraph about school gardens?', 'School gardens improve learning, wellbeing and environmental awareness.', ['Our garden has a blue gate.','Yesterday was Tuesday.','Some students wear green shoes.'], 'The sentence introduces the paragraph’s central idea and previews the main areas the paragraph can develop.'],
        ['Which revision removes unnecessary repetition?', 'The final outcome surprised everyone.', ['The final outcome at the end surprised everyone.','The outcome was final at the end and surprising.','Everyone was surprised by the final end outcome.'], 'Final and at the end repeat the same idea, so the concise version communicates the meaning clearly.'],
      ]},
      { code: 'eng6-language-choices', topic: 'Audience and language choices', statement: 'Select tone, voice and persuasive techniques that suit purpose, audience and communication context.', questions: [
        ['Which sentence is most suitable for a formal email to a school principal?', 'Could we arrange a meeting to discuss the proposal?', ['Hey, can we chat about this thing?','You need to meet us right now.','What’s up with our proposal?'], 'The wording is polite, specific and appropriately formal for communication with a principal.'],
        ['“Join the clean-up and help create a safer park for every family.” Which persuasive appeal is strongest?', 'Shared community benefit', ['A scientific definition','A personal insult','A comic rhyme'], 'The sentence appeals to a benefit shared by families and the wider community.'],
        ['Which tone best suits safety instructions for a science experiment?', 'Clear and direct', ['Mysterious and vague','Playful but incomplete','Sarcastic and doubtful'], 'Safety instructions must be unambiguous, concise and direct so readers can follow them accurately.'],
        ['Which sentence uses active voice to make responsibility clearest?', 'The council repaired the bridge.', ['The bridge was repaired.','The bridge had been repaired somehow.','There was a repairing of the bridge.'], 'The active sentence clearly identifies the council as the person or group responsible for the action.'],
      ]},
    ],
  },
  {
    subject: 'Science', subjectCode: 'science', short: 'sci', file: 'science-grade-6.json',
    objectives: [
      { code: 'sci6-living-systems', topic: 'Living systems', statement: 'Explain how cells, organs, food chains and adaptations support living organisms and ecosystems.', questions: [
        ['Which cell structure is labelled X?', 'Cell wall', ['Nucleus','Vacuole','Cell membrane'], 'The arrow points to the thick, rigid outer boundary that supports a plant cell: the cell wall.', 'g6-science-plant-cell'],
        ['If the grasshopper population suddenly decreases, what is the most likely immediate effect on frogs?', 'Frogs have less food available', ['Frogs receive more energy from grass','Hawks stop eating frogs immediately','Grass disappears more quickly'], 'Grasshoppers transfer energy to frogs, so fewer grasshoppers mean less food is immediately available to frogs.', 'g6-science-food-chain'],
        ['Where are most digested nutrients absorbed into the blood?', 'Small intestine', ['Stomach','Large intestine','Oesophagus'], 'The small intestine has a large surface area and is the main site where digested nutrients enter the blood.'],
        ['Why do many desert plants have small leaves or spines?', 'To reduce water loss', ['To attract more large animals','To absorb salt from the air','To increase shade on nearby plants'], 'A smaller leaf surface reduces water loss by transpiration in hot, dry conditions.'],
      ]},
      { code: 'sci6-matter-materials', topic: 'Matter and materials', statement: 'Use particle ideas and material properties to explain changes and select separation methods.', questions: [
        ['Which particle model represents a gas?', 'C', ['A','B','A and B'], 'Gas particles are widely spaced and move throughout their container, as shown in model C.', 'g6-science-particles'],
        ['Salt dissolves in 100 g of water. The total mass is 115 g. What mass of salt was added?', '15 g', ['85 g','100 g','215 g'], 'Mass is conserved, so the salt mass is 115 g − 100 g = 15 g.'],
        ['Which change produces a new substance?', 'Iron rusting', ['Ice melting','Sugar dissolving','Water freezing'], 'Rusting is a chemical reaction that forms iron oxide, a substance with new properties.'],
        ['What is the best sequence for separating a mixture of sand and salt?', 'Add water, filter, then evaporate', ['Filter, add water, then freeze','Evaporate, sieve, then add water','Use a magnet, filter, then melt'], 'Water dissolves the salt, filtration removes the sand, and evaporation recovers the salt.'],
      ]},
      { code: 'sci6-forces-energy', topic: 'Forces and energy', statement: 'Analyse simple force, energy and electrical systems and plan fair tests of their behaviour.', questions: [
        ['What is the resultant force on the box?', '4 N to the right', ['8 N to the right','4 N to the left','2 N to the right'], 'Opposing forces subtract: 6 N right minus 2 N left gives a resultant of 4 N to the right.', 'g6-science-force-arrows'],
        ['What happens if one lamp is removed from this circuit?', 'Both lamps go out', ['The other lamp becomes a battery','Only the removed lamp gets brighter','Current takes a second branch'], 'A series circuit has one path, so removing one lamp breaks the path and both lamps go out.', 'g6-science-series-circuit'],
        ['Which energy transfer occurs in a battery-powered torch?', 'Chemical to electrical to light and thermal', ['Light to chemical to sound','Thermal to nuclear to light','Electrical to chemical only'], 'The battery stores chemical energy, which becomes electrical energy and then light with some thermal energy.'],
        ['To test how lubricant affects friction, which variable should be changed?', 'Amount of lubricant', ['Mass of the block and surface type','Distance pulled and block material','Spring balance and pulling direction'], 'A fair test changes the amount of lubricant while keeping the other relevant variables constant.'],
      ]},
      { code: 'sci6-earth-space', topic: 'Earth and space', statement: 'Use models to explain rotation, orbit, lunar light, seasons and the water cycle.', questions: [
        ['What causes the regular cycle of day and night?', 'Earth rotating on its axis', ['The Sun orbiting Earth daily','Earth moving closer to the Sun','The Moon blocking sunlight'], 'As Earth rotates, different parts face toward and then away from the Sun, producing day and night.', 'g6-science-earth-rotation'],
        ['Why can the Moon be seen from Earth?', 'It reflects light from the Sun', ['It produces its own visible light','It reflects light from Earth only','It is made entirely of fire'], 'The Moon does not make visible light; sunlight reflects from its surface toward Earth.'],
        ['Which process forms clouds when water vapour cools?', 'Condensation', ['Evaporation','Melting','Infiltration'], 'Cooling water vapour changes it into tiny liquid droplets through condensation, forming clouds.'],
        ['What is the main reason Earth has seasons?', 'Earth’s tilted axis as it orbits the Sun', ['Daily changes in Earth’s rotation speed','The Moon changing its distance from Earth','Clouds moving between hemispheres'], 'Earth’s axial tilt changes the angle and duration of sunlight in each hemisphere during its orbit.'],
      ]},
      { code: 'sci6-scientific-enquiry', topic: 'Scientific enquiry', statement: 'Identify variables, interpret data and evaluate reliability and limits in scientific investigations.', questions: [
        ['During which interval did temperature increase most quickly?', '0–2 minutes', ['2–4 minutes','4–6 minutes','6–8 minutes'], 'The graph rises by 12°C in the first two minutes, more than in any later equal interval.', 'g6-science-temperature-graph'],
        ['A student tests how distance from a lamp affects plant growth. What is the independent variable?', 'Distance from the lamp', ['Plant growth','Plant species','Amount of soil'], 'The independent variable is the factor deliberately changed: the plant’s distance from the lamp.'],
        ['Why should a measurement be repeated several times?', 'To reduce the effect of random error', ['To guarantee the hypothesis is correct','To change the independent variable','To remove the need for units'], 'Repeats reveal variation and allow a mean, reducing the influence of random measurement error.'],
        ['Four plants with fertiliser grew slightly taller than four without it. What is the best conclusion?', 'The evidence suggests an effect, but more repeats are needed', ['Fertiliser always doubles plant growth','The result proves every fertiliser is safe','Plant growth cannot be investigated'], 'The small sample suggests a possible effect but is not enough to justify a universal or causal claim.'],
      ]},
    ],
  },
  {
    subject: 'Geography', subjectCode: 'geography', short: 'geo', file: 'geography-grade-6.json',
    objectives: [
      { code: 'geo6-map-skills', topic: 'Map and spatial skills', statement: 'Use direction, grid references, scale and contour patterns to locate and interpret places.', questions: [
        ['Which direction lies halfway between north and east?', 'Northeast', ['Northwest','Southeast','Southwest'], 'Northeast is the intermediate compass direction exactly between north and east.', 'g6-geo-compass'],
        ['What is the museum’s grid reference?', 'C2', ['B2','C3','D2'], 'The museum lies in column C and row 2, so its grid reference is C2.', 'g6-geo-grid-map'],
        ['A map scale states 1 cm represents 2 km. Two places are 4.5 cm apart. What is the real distance?', '9 km', ['2.25 km','6.5 km','11 km'], 'Multiplying 4.5 cm by 2 km per centimetre gives a real distance of 9 km.'],
        ['What do very closely spaced contour lines usually show?', 'A steep slope', ['A flat plain','A river mouth','A political boundary'], 'Closely spaced contours show that height changes quickly over a short horizontal distance, indicating a steep slope.'],
      ]},
      { code: 'geo6-weather-climate', topic: 'Weather and climate', statement: 'Interpret weather data and explain basic differences and controls affecting weather and climate.', questions: [
        ['Which month recorded the highest rainfall?', 'March', ['January','April','June'], 'March has the tallest bar at 78 mm, the highest monthly total shown.', 'g6-geo-rainfall-chart'],
        ['Which statement correctly distinguishes weather from climate?', 'Weather is short-term; climate is a long-term pattern', ['Weather and climate both mean today’s rainfall','Climate changes every hour','Weather describes only temperature'], 'Weather describes current atmospheric conditions, while climate summarises patterns over many years.'],
        ['Where should a rain gauge be placed for the fairest measurement?', 'In an open area away from buildings and trees', ['Directly beneath a roof edge','Under a large tree','Beside a sprinkler'], 'An open site reduces obstruction, dripping and splash effects that would distort the rainfall measurement.'],
        ['Why do coastal places often have smaller temperature ranges than inland places?', 'The sea heats and cools more slowly than land', ['Sea level is always higher than the land','Coastal winds contain no moisture','The Sun is closer to the coast'], 'Water changes temperature slowly, moderating nearby air temperatures through the seasons.'],
      ]},
      { code: 'geo6-rivers-landforms', topic: 'Rivers and landforms', statement: 'Explain basic river processes, landforms and human factors that influence flood risk.', questions: [
        ['At which labelled point is river flow usually fastest?', 'X', ['Y','Both are always equal','Neither point has moving water'], 'Flow is fastest along the outside bend at X, where erosion is usually strongest.', 'g6-geo-river-bend'],
        ['What is the mouth of a river?', 'The place where it enters a sea, lake or another river', ['The highest point in its drainage basin','A small stream joining it','A bend in its upper course'], 'The mouth is the end of a river where its water flows into a larger body of water.'],
        ['Why can extensive concrete surfaces increase urban flood risk?', 'They reduce infiltration and increase surface runoff', ['They absorb all rainfall immediately','They stop water moving downhill','They make evaporation impossible everywhere'], 'Concrete is largely impermeable, so more rain runs rapidly across the surface into drains and rivers.'],
        ['Why does a delta often form near a river mouth?', 'The river loses energy and deposits sediment', ['The river becomes permanently faster','Sea water removes all sediment','The valley becomes much steeper'], 'As a river enters still water it slows, loses carrying capacity and deposits sediment.'],
      ]},
      { code: 'geo6-population-settlement', topic: 'Population and settlement', statement: 'Interpret population structure, density, urbanisation and settlement site factors.', questions: [
        ['What does the broad base of this population pyramid suggest?', 'A high birth rate', ['A very small child population','No migration at any age','Most people are elderly'], 'A broad 0–14 bar shows that children form a large share of the population, indicating a high birth rate.', 'g6-geo-population-pyramid'],
        ['Why did many early settlements develop beside rivers?', 'Rivers provided water, transport and fertile land', ['Rivers prevented all flooding','River valleys had no other communities','People could not travel on land'], 'Rivers offered several useful site advantages, including water, transport routes and fertile floodplain soils.'],
        ['What is urbanisation?', 'An increasing proportion of people living in towns and cities', ['A fall in the number of all buildings','The movement of rivers through cities','A change from industry to farming only'], 'Urbanisation is the growth in the share of a population living in urban areas.'],
        ['A region has 45,000 people and an area of 300 km². What is its population density?', '150 people per km²', ['15 people per km²','135 people per km²','13,500 people per km²'], 'Population density equals population divided by area: 45,000 ÷ 300 = 150 people per km².'],
      ]},
      { code: 'geo6-environments-sustainability', topic: 'Environments and sustainability', statement: 'Evaluate simple environmental decisions using systems, evidence, stakeholders and sustainability criteria.', questions: [
        ['Which proposed factory site is furthest from the river, forest and homes while remaining beside the main road?', 'D', ['A','B','C'], 'Site D has road access but is positioned away from the mapped river, forest and residential area.', 'g6-geo-land-use-map'],
        ['How can trees reduce storm runoff in a drainage basin?', 'They intercept rain and encourage infiltration', ['They make all soil impermeable','They prevent evaporation completely','They force rivers to flow uphill'], 'Leaves intercept rainfall and roots improve soil structure, allowing more water to infiltrate before reaching streams.', 'g6-geo-catchment-trees'],
        ['Which is a likely trade-off of building a large wind farm?', 'Low-carbon electricity but possible landscape and wildlife impacts', ['Unlimited energy with no local effects','More fossil-fuel use and no electricity','No construction cost or maintenance'], 'Wind power produces low-carbon electricity, but location decisions must consider landscape, habitats and communities.'],
        ['Which evidence set best supports a sustainable transport decision?', 'Cost, emissions, access, safety and community feedback', ['Only the colour of the vehicles','One person’s preference alone','Advertising slogans without data'], 'A sustainable decision balances environmental, economic and social evidence rather than relying on one unsupported preference.'],
      ]},
    ],
  },
];

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
        externalId: `bh-g6-${subject.short}-2026.7-${String(globalIndex + 1).padStart(3, '0')}`,
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
        mappings: [{ scopeCode: `${subject.subjectCode}-grade-6`, objectiveCode: objective.code }],
      });
      globalIndex += 1;
    });
  }
  writeFileSync(path.join(packageDir, subject.file), `${JSON.stringify({
    subject: subject.subject,
    subjectCode: subject.subjectCode,
    grade: 6,
    language: 'en',
    questions,
  }, null, 2)}\n`, 'utf8');
}

if (usedAssets.size !== 24 || usedAssets.size !== assetManifest.length) {
  throw new Error(`Expected exactly 24 referenced assets, found ${usedAssets.size} references and ${assetManifest.length} assets.`);
}

const manifest = {
  schemaVersion: 2,
  packageId: 'brain-heist-grade-6-core-2026-7',
  packageVersion: '2026.7.0',
  contentVersion: 'brain-heist-2026-7',
  authority: 'Brains Heist Academic Governance',
  releaseNotes: 'Sixth production package: 80 original Grade 6 questions across Mathematics, English, Integrated Science and Geography, supported by 24 checksum-verified Brains Heist SVG learning assets.',
  curriculum: { frameworkCode: 'brain-heist-international', versionCode: '2026-7' },
  assetBaseUrl: 'https://www.brainsheist.com',
  assets: assetManifest,
  files: subjectDefinitions.map((subject) => subject.file),
};
writeFileSync(path.join(packageDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Built ${manifest.packageId}@${manifest.packageVersion}: 80 questions and ${assetManifest.length} SVG assets.`);
