// Turns a recording (capture/out/<mode>) into Remotion-ready assets under public/footage/<mode>:
// H.264 MP4s, the first issued sheet, the first photo, and the click timeline.
//   node capture/prepare.mjs desktop
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] === 'mobile' ? 'mobile' : 'desktop';
const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'out', mode);
const dest = join(here, '..', 'public', 'footage', mode);
mkdirSync(dest, { recursive: true });

const toMp4 = (input, output) => {
  if (!existsSync(input)) return false;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an', '-movflags', '+faststart', output]);
  return true;
};
toMp4(join(src, 'page.webm'), join(dest, 'page.mp4'));
toMp4(join(src, 'print.webm'), join(dest, 'print.mp4'));

const sheets = readdirSync(join(src, 'sheets')).filter((f) => f.endsWith('.svg')).sort();
sheets.slice(0, 3).forEach((f, i) => copyFileSync(join(src, 'sheets', f), join(dest, `sheet-${i + 1}.svg`)));
const photos = readdirSync(join(src, 'photos')).filter((f) => f.endsWith('.jpg')).sort();
photos.slice(0, 4).forEach((f, i) => copyFileSync(join(src, 'photos', f), join(dest, `photo-${i + 1}.jpg`)));

const timeline = JSON.parse(readFileSync(join(src, 'timeline.json'), 'utf8'));
const probe = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
timeline.durations = { page: probe(join(dest, 'page.mp4')), print: existsSync(join(dest, 'print.mp4')) ? probe(join(dest, 'print.mp4')) : 0 };
timeline.marks = Object.fromEntries(timeline.timeline.map((m) => [m.label, m.t / 1000]));
timeline.sheets = sheets.slice(0, 3);
const firstSheet = readFileSync(join(src, 'sheets', sheets[0]), 'utf8');
timeline.questions = Math.floor(((firstSheet.match(/<circle cx=/g) || []).length - 1) / 4);
timeline.studentName = firstSheet.match(/aria-label="Answer sheet for ([^"]+)"/)?.[1] ?? 'Student';
timeline.photos = photos.slice(0, 4);
writeFileSync(join(dest, 'timeline.json'), JSON.stringify(timeline, null, 2));
console.log(mode, 'ready:', Object.keys(timeline.marks).length, 'marks, page', timeline.durations.page.toFixed(1), 's');
