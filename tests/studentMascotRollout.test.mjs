import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const app = fs.readFileSync(path.join(root,'App.tsx'),'utf8');
const dock = fs.readFileSync(path.join(root,'src/features/studentMascot/StudentMascotDock.tsx'),'utf8');
const css = fs.readFileSync(path.join(root,'src/features/studentMascot/StudentMascotDock.css'),'utf8');
const asset = fs.readFileSync(path.join(root,'public/mascot/brains-heist-neon-cat.glb'));

test('approved Tripo asset is valid, six-clip, embedded skin/texture GLB',()=>{
 assert.equal(asset.toString('utf8',0,4),'glTF');
 assert.ok(asset.length < 5_000_000, 'must remain below 5MB');
 const jsonLength=asset.readUInt32LE(12);
 const gltf=JSON.parse(asset.subarray(20,20+jsonLength).toString('utf8'));
 assert.deepEqual(gltf.animations.map(a=>a.name),['idle.001','cheer.001','angry_03.001','greet_03.001','box_01.001','clap.001']);
 assert.ok(gltf.skins?.[0]?.joints?.length>=60);
 assert.ok(gltf.images?.every(i=>i.bufferView!==undefined));
});
test('student shell owns one mascot across tabs, without teacher/admin or exam overlays',()=>{
 assert.match(app, /<StudentMascotDock userId={profile\.id}/);
 assert.match(app, /profile\?\.role === 'student'/);
 assert.match(app, /!isTeacherRole && !isSchoolAdminRole && !isAdminMode/);
 assert.match(app, /view === 'dashboard'/);
 assert.match(app, /!isCambridgeView/);
 assert.ok(app.indexOf('<StudentMascotDock userId=')>app.indexOf('          {renderView()}'), 'companion must render outside tab content');
});
test('dock has hide, pause, reduced motion and original pilot conflict protection',()=>{
 assert.match(dock, /bh:student-mascot:hidden:v1:/);
 assert.match(dock, /IntersectionObserver/);
 assert.match(dock, /prefers-reduced-motion/);
 assert.match(dock, /visibilitychange/);
 assert.match(css, /language-dock\.is-companion/);
 assert.match(app, /!isCambridgeView/);
 assert.match(css, /safe-area-inset-bottom/);
});
