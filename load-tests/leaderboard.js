import http from 'k6/http';
import { check, sleep } from 'k6';

/*
  Usage:
    SUPABASE_URL=<https://project.supabase.co> \
    SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
    k6 run load-tests/leaderboard.js
*/

const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = __ENV.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables must be set.');
}

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<400'],
    http_req_failed: ['rate<0.01']
  }
};

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
};

export default function leaderboardLoad() {
  const url = `${SUPABASE_URL}/rest/v1/users?select=id,username,level,coins&order=level.desc&limit=50`;
  const res = http.get(url, { headers });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'payload returned rows': (r) => Array.isArray(r.json())
  });

  sleep(1);
}
