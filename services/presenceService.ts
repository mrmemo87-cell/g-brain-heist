import { supabase } from './supabaseClient';
import { createScopedReadCache } from './scopedReadCache';

// Suppress focus/visibility/bootstrap bursts before they reach the database.
// No retries: presence is optional and must never delay acknowledged work.
// Cool down failures too; the normal heartbeat retries without focus storms.
const writes = createScopedReadCache<boolean>(45_000);
export async function touchPresence(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await writes.read(data.session.access_token, async () => {
      const { error } = await supabase.rpc('rpc_touch_last_seen');
      return !error;
    });
  } catch { /* best effort */ }
}
