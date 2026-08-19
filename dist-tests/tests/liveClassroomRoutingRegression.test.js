import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const lockdownManager = readFileSync('src/features/lockdown/LockdownManager.tsx', 'utf8');
const clanTerritoryManager = readFileSync('src/features/clanTerritory/ClanTerritoryManager.tsx', 'utf8');
const clanTerritoryTransport = readFileSync('src/features/clanTerritory/clanTerritorySupabaseTransport.ts', 'utf8');
test('Lockdown uses the class-aware live classroom arena instead of a separate room-code protocol', () => {
    assert.match(lockdownManager, /import ClanTerritoryManager from '\.\.\/clanTerritory\/ClanTerritoryManager'/);
    assert.match(lockdownManager, /<ClanTerritoryManager/);
    assert.doesNotMatch(lockdownManager, /SupabaseLockdownTransport/);
    assert.doesNotMatch(lockdownManager, /Room not found or host inactive/);
});
test('live classroom events retain automatic selected-class discovery', () => {
    assert.match(clanTerritoryManager, /transport\.startDiscovery\(userSchoolId/);
    assert.match(clanTerritoryManager, /room\.classCodes/);
    assert.match(clanTerritoryManager, /studentClassCodes/);
    assert.match(clanTerritoryTransport, /event: "room_open"/);
    assert.match(clanTerritoryTransport, /setInterval\(\(\) =>/);
});
