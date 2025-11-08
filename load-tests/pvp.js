import http from 'k6/http';
import { check, sleep } from 'k6';

/*
  Usage:
    SUPABASE_URL=<https://project.supabase.co> \
    SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
    ATTACKER_ID=<uuid> DEFENDER_ID=<uuid> \
    k6 run load-tests/pvp.js
*/

const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = __ENV.SUPABASE_SERVICE_ROLE_KEY;
const ATTACKER_ID = __ENV.ATTACKER_ID ?? '00000000-0000-0000-0000-000000000000';
const DEFENDER_ID = __ENV.DEFENDER_ID ?? '00000000-0000-0000-0000-000000000001';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables must be set.');
}

export const options = {
  vus: 20,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<600'],
    http_req_failed: ['rate<0.05']
  }
};

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json'
};

export default function simulateHackAttempt() {
  const payload = JSON.stringify({
    p_attacker_id: ATTACKER_ID,
    p_defender_id: DEFENDER_ID,
    p_use_cracker: false
  });

  const res = http.post(`${SUPABASE_URL}/rest/v1/rpc/rpc_hack_attempt`, payload, { headers });

  check(res, {
    'rpc responded': (r) => r.status === 200 || r.status === 400,
    'payload is object': (r) => typeof r.json() === 'object'
  });

  sleep(0.5);
}

