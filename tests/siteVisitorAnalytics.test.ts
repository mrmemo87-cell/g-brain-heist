import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { deviceOf, externalReferrerHost, looksAutomated, utmFrom } from '../src/lib/siteVisitTracker';

test('tracker keeps only external referrer hosts', () => {
  assert.equal(externalReferrerHost('https://www.linkedin.com/feed/', 'brainsheist.com'), 'linkedin.com');
  assert.equal(externalReferrerHost('https://brainsheist.com/pricing', 'brainsheist.com'), null);
  assert.equal(externalReferrerHost('https://demo.brainsheist.com/', 'brainsheist.com'), null);
  assert.equal(externalReferrerHost('', 'brainsheist.com'), null);
  assert.equal(externalReferrerHost('not a url', 'brainsheist.com'), null);
});

test('tracker reads only UTM tags and classifies devices and bots', () => {
  assert.deepEqual(utmFrom('?utm_source=linkedin&utm_campaign=launch&email=x@y.z'), { utm_source: 'linkedin', utm_campaign: 'launch' });
  assert.equal(deviceOf(390, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'), 'phone');
  assert.equal(deviceOf(1440, 'Mozilla/5.0 (Windows NT 10.0)'), 'desktop');
  assert.equal(looksAutomated({ userAgent: 'Googlebot/2.1', webdriver: false }), true);
  assert.equal(looksAutomated({ userAgent: 'Mozilla/5.0 Chrome/130', webdriver: true }), true);
  assert.equal(looksAutomated({ userAgent: 'Mozilla/5.0 Chrome/130', webdriver: false }), false);
});

const SUPERADMIN = '00000000-0000-4000-8000-000000000001';

test('site visitor migration records anonymous visits and reports unplaced sign-ups to superadmins only', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key, email text, created_at timestamptz, last_sign_in_at timestamptz, deleted_at timestamptz, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      create table public.users (id uuid primary key, username text, full_name text, role text, school_id uuid, is_admin boolean);
      create table public.school_members (user_id uuid, school_id uuid, status text);
      create table public.superadmins (user_id uuid);
      create function public.is_superadmin(p_user_id uuid default null) returns boolean language sql stable as $$
        select exists (select 1 from public.superadmins where user_id = coalesce(p_user_id, auth.uid())) $$;
      insert into public.superadmins values ('${SUPERADMIN}');
      insert into auth.users (id, email, created_at, last_sign_in_at) values
        ('${SUPERADMIN}', 'boss@brainsheist.com', now() - interval '2 days', now()),
        ('00000000-0000-4000-8000-000000000002', 'outsider@gmail.com', now() - interval '1 day', null),
        ('00000000-0000-4000-8000-000000000003', 'placed@school.org', now() - interval '1 day', now()),
        ('00000000-0000-4000-8000-000000000004', 'old@gmail.com', now() - interval '100 days', null);
      insert into public.users (id, username, role, school_id) values
        ('00000000-0000-4000-8000-000000000002', 'outsider', 'teacher', null),
        ('00000000-0000-4000-8000-000000000003', 'placed', 'student', null);
      insert into public.school_members values ('00000000-0000-4000-8000-000000000003', gen_random_uuid(), 'active');
    `);
    await db.exec(readFileSync('supabase/migrations/20261102080000_site_visitor_analytics.sql', 'utf8'));

    const visitor = '11111111-1111-4111-8111-111111111111';
    const visit = (path: string, device = 'desktop') => db.query(
      `select public.rpc_site_visit($1, null, $2, 'LinkedIn.com', '{"utm_source":"li","email":"x@y.z"}'::jsonb, 'kg', 'Bishkek', $3, 'en') ok`,
      [visitor, path, device],
    );
    assert.equal(((await visit('/')).rows[0] as { ok: boolean }).ok, true);
    await visit('/pricing', 'laptop');

    const stored = await db.query<{ utm: Record<string, string>; geo_country: string; device: string | null; referrer_host: string }>(
      `select utm, geo_country, device, referrer_host from site_analytics.visits order by id`);
    assert.deepEqual(stored.rows[0].utm, { utm_source: 'li' });
    assert.equal(stored.rows[0].geo_country, 'KG');
    assert.equal(stored.rows[0].referrer_host, 'linkedin.com');
    assert.equal(stored.rows[1].device, null);

    await assert.rejects(db.query(`select public.rpc_site_visitor_report(30)`), /Platform administrator required/);

    await db.exec(`select set_config('test.uid', '${SUPERADMIN}', false)`);
    const report = (await db.query<{ r: { totals: { visitors: number; page_views: number }; sources: Array<{ source: string }>; unplaced: Array<{ email: string }> } }>(
      `select public.rpc_site_visitor_report(30) r`)).rows[0].r;
    assert.equal(report.totals.visitors, 1);
    assert.equal(report.totals.page_views, 2);
    assert.equal(report.sources[0].source, 'li');
    assert.deepEqual(report.unplaced.map((u) => u.email), ['outsider@gmail.com']);

    for (let i = 0; i < 70; i += 1) await visit(`/p${i}`);
    const capped = await db.query<{ n: number }>(`select count(*)::int n from site_analytics.visits where visitor_id = $1`, [visitor]);
    assert.equal(capped.rows[0].n, 60);
  } finally {
    await db.close();
  }
});
