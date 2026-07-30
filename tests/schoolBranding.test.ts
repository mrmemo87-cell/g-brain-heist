import assert from 'node:assert/strict';
import test from 'node:test';
import { createSchoolBrand, normalizeBrandLogoUrl, PRODUCT_LOGO_URL } from '../src/lib/schoolBranding.js';

test('falls back to product branding only without a school identity', () => {
  assert.deepEqual(createSchoolBrand(null), { schoolId: null, name: 'Brains Heist', logoUrl: PRODUCT_LOGO_URL, isSchoolBrand: false });
});

test('does not render missing, invalid, or insecure school logos', () => {
  assert.equal(normalizeBrandLogoUrl(null), null);
  assert.equal(normalizeBrandLogoUrl('not a url'), null);
  assert.equal(normalizeBrandLogoUrl('http://school.test/logo.png'), null);
});

test('canonical settings override cached profile branding', () => {
  const brand = createSchoolBrand(
    { schoolId: 'school-a', schoolName: 'Current Academy', schoolLogoUrl: 'https://cdn.test/current.png' },
    { schoolId: 'school-a', schoolName: 'Old Academy', schoolLogoUrl: 'https://cdn.test/old.png' },
  );
  assert.equal(brand.name, 'Current Academy');
  assert.equal(brand.logoUrl, 'https://cdn.test/current.png');
});

test('resource school wins over a viewer profile from another school', () => {
  const resource = createSchoolBrand(
    { schoolId: 'resource-school', schoolName: 'Resource School' },
    { schoolId: 'viewer-school', schoolName: 'Viewer School' },
  );
  assert.equal(resource.schoolId, 'resource-school');
  assert.equal(resource.name, 'Resource School');
  assert.equal(resource.logoUrl, null);
});
