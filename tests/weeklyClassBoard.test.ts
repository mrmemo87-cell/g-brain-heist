import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('supabase/migrations/20261021140000_weekly_class_board.sql', 'utf8');
const board = readFileSync('components/student/WeeklyClassBoard.tsx', 'utf8');
const mission = readFileSync('components/student/DailyMissionCard.tsx', 'utf8');
const app = readFileSync('App.tsx', 'utf8');

test('weekly points reward effort and reset every Monday', () => {
  assert.match(migration, /date_trunc\('week', \(now\(\) at time zone 'Asia\/Bishkek'\)\)::date/);
  assert.match(migration, /case when dm\.completed_at is not null then 10 else 0 end \+ 2 \* dm\.correct_count/);
  assert.match(migration, /5 \* count\(\*\) as points/);
});

test('students only ever see their own class', () => {
  assert.match(migration, /where cs\.student_id = v_uid/);
  assert.match(migration, /where cs\.class_id = v_class_id and u\.role = 'student'/);
  assert.match(migration, /revoke all on function private\.weekly_board_points\([^)]*\) from public, anon, authenticated/i);
  assert.match(migration, /revoke all on function public\.rpc_get_weekly_class_board\(\) from public, anon/i);
});

test('the board shows the gap to the next person and today’s climb', () => {
  assert.match(migration, /'points_to_next'/);
  assert.match(migration, /'places_climbed_today', greatest\(/);
  assert.match(board, /points behind \{name\}/);
  assert.match(board, /You moved up \{count\} places today/);
});

test('finishing the mission refreshes the board on the home screen', () => {
  assert.match(mission, /if \(result\.completed\) onMissionCompleted\?\.\(\);/);
  assert.match(app, /onMissionCompleted=\{\(\) => setWeeklyBoardRefreshKey\(\(key\) => key \+ 1\)\}/);
  assert.match(app, /<WeeklyClassBoard refreshKey=\{weeklyBoardRefreshKey\} \/>/);
});

test('the board hides itself when unavailable', () => {
  assert.match(board, /if \(!board\) return null;/);
});

test('student cards keep the dark theme in performance (light) mode', () => {
  // body.light-mode is the app's performance mode, not a light colour theme.
  for (const file of ['components/student/DailyMissionCard.css', 'components/student/WeeklyClassBoard.css']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /body\.light-mode/, `${file} must not restyle for performance mode`);
  }
});

test('mission fill-up never uses subjects the student has not studied', () => {
  const fix = readFileSync('supabase/migrations/20261021150000_daily_mission_relevant_subjects.sql', 'utf8');
  assert.match(fix, /studied_subjects as/);
  assert.match(fix, /p\.subject in \('English', 'Mathematics', 'Maths', 'Science'\)/);
  assert.doesNotMatch(fix, /from pool p where v_grade is not null and p\.grade = v_grade\s*\)/);
});
