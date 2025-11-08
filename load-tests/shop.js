import http from 'k6/http';
import { check, sleep } from 'k6';

/*
  Usage:
    SUPABASE_URL=<https://project.supabase.co> \
    SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
    TEST_USER_ID=<uuid to attribute purchases> \
    k6 run load-tests/shop.js
*/

const SUPABASE_URL = __ENV.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = __ENV.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables must be set.');
}

export const options = {
  scenarios: {
    browse: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 10,
      exec: 'listItems'
    },
    purchase: {
      executor: 'per-vu-iterations',
      vus: 5,
      iterations: 20,
      exec: 'simulatePurchase',
      startTime: '5s'
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<500']
  }
};

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json'
};

export function listItems() {
  const res = http.get(`${SUPABASE_URL}/rest/v1/shop_items?select=*`, { headers });
  check(res, {
    'shop response ok': (r) => r.status === 200,
    'items returned array': (r) => Array.isArray(r.json())
  });
  sleep(0.5);
}

export function simulatePurchase() {
  const payload = JSON.stringify({
    item_id: 'item_shield',
    quantity: 1,
    user_id: __ENV.TEST_USER_ID ?? '00000000-0000-0000-0000-000000000000'
  });

  const res = http.post(`${SUPABASE_URL}/rest/v1/rpc/perform_shop_purchase`, payload, { headers });
  check(res, {
    'purchase rpc responded': (r) => r.status === 200 || r.status === 400
  });
  sleep(1);
}

