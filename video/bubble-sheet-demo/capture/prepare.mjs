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
// Screencast frames (phone takes) are assembled with per-frame durations into a constant 25 fps file.
const framesToMp4 = (dir, output, offsetMs = 0) => {
  if (!existsSync(join(dir, 'frames.json'))) return false;
  const { frames, end } = JSON.parse(readFileSync(join(dir, 'frames.json'), 'utf8'));
  if (!frames.length) return false;
  const list = [];
  frames.forEach((f, i) => {
    const start = i === 0 ? 0 : f.t - offsetMs;
    const next = i + 1 < frames.length ? frames[i + 1].t - offsetMs : end - offsetMs;
    list.push(`file '${join(dir, f.name)}'`, `duration ${Math.max(0.02, (next - start) / 1000).toFixed(3)}`);
  });
  list.push(`file '${join(dir, frames[frames.length - 1].name)}'`);
  writeFileSync(join(dir, 'list.txt'), list.join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'), '-vf', 'fps=25,scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', output]);
  return true;
};
const timeline = JSON.parse(readFileSync(join(src, 'timeline.json'), 'utf8'));
if (!toMp4(join(src, 'page.webm'), join(dest, 'page.mp4'))) framesToMp4(join(src, 'frames'), join(dest, 'page.mp4'));
if (!toMp4(join(src, 'print.webm'), join(dest, 'print.mp4'))) {
  const open = timeline.timeline.find((m) => m.label === 'print-window-open');
  framesToMp4(join(src, 'print-frames'), join(dest, 'print.mp4'), open ? open.t : 0);
}

const sheets = readdirSync(join(src, 'sheets')).filter((f) => f.endsWith('.svg')).sort();
sheets.slice(0, 3).forEach((f, i) => copyFileSync(join(src, 'sheets', f), join(dest, `sheet-${i + 1}.svg`)));
const photos = readdirSync(join(src, 'photos')).filter((f) => f.endsWith('.jpg')).sort();
photos.slice(0, 4).forEach((f, i) => copyFileSync(join(src, 'photos', f), join(dest, `photo-${i + 1}.jpg`)));

const probe = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
timeline.durations = { page: probe(join(dest, 'page.mp4')), print: existsSync(join(dest, 'print.mp4')) ? probe(join(dest, 'print.mp4')) : 0 };
// Click positions were logged in CSS pixels; express them in video pixels.
const probeSize = (file) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim().split(',').map(Number);
const [videoWidth, videoHeight] = probeSize(join(dest, 'page.mp4'));
const viewport = timeline.viewport ?? timeline.size;
const scaleX = videoWidth / viewport.width;
const scaleY = videoHeight / viewport.height;
timeline.size = { width: videoWidth, height: videoHeight };
timeline.timeline = timeline.timeline.map((m) => (m.x === undefined ? m : { ...m, x: Math.round(m.x * scaleX), y: Math.round(m.y * scaleY) }));
timeline.marks = Object.fromEntries(timeline.timeline.map((m) => [m.label, m.t / 1000]));
timeline.sheets = sheets.slice(0, 3);
const firstSheet = readFileSync(join(src, 'sheets', sheets[0]), 'utf8');
timeline.questions = Math.floor(((firstSheet.match(/<circle cx=/g) || []).length - 1) / 4);
timeline.studentName = firstSheet.match(/aria-label="Answer sheet for ([^"]+)"/)?.[1] ?? 'Student';
timeline.photos = photos.slice(0, 4);
writeFileSync(join(dest, 'timeline.json'), JSON.stringify(timeline, null, 2));
console.log(mode, 'ready:', Object.keys(timeline.marks).length, 'marks, page', timeline.durations.page.toFixed(1), 's');
