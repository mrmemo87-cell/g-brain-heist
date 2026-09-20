import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
test("Formation Command is the continuous shipped Commander progression track from 41 through 100", () => {
    const sql = readFileSync("supabase/migrations/20260915233500_commander_formations_replace_future_track.sql", "utf8");
    assert.match(sql, /- 'skillTreeUnlockLevel'/);
    assert.match(sql, /- 'synergyUnlockLevel'/);
    assert.match(sql, /- 'eliteUnlockLevel'/);
    assert.match(sql, /- 'advancedPowerUnlockLevel'/);
    assert.match(sql, /- 'legendaryUnlockLevel'/);
    assert.match(sql, /"progressionVersion":3/);
    assert.match(sql, /"formationTrackEndLevel":100/);
});
