import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const service = fs.readFileSync(path.join(process.cwd(), 'services/schoolAdminService.ts'), 'utf8');
test('school capability resolution preserves success, absence, and error as distinct states', () => {
    assert.match(service, /type SchoolCapabilitiesResolution =[\s\S]*status: 'ready'[\s\S]*status: 'error'/);
    assert.match(service, /payload\['success'\] !== true[\s\S]*no active school membership[\s\S]*status: 'ready', capabilities: null/);
    assert.match(service, /if \(error\) \{[\s\S]*status: 'error', capabilities: null/);
    assert.match(service, /typeof resolvedSchoolId !== 'string'[\s\S]*status: 'error', capabilities: null/);
});
test('legacy capability helper consumes the explicit resolution without granting on errors', () => {
    assert.match(service, /const resolution = await resolveMySchoolCapabilities\(schoolId\)/);
    assert.match(service, /resolution\.status === 'ready' \? resolution\.capabilities : null/);
});
