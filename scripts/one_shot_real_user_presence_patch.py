from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    file.write_text(text.replace(old, new, 1))


# App.tsx: heartbeat only while the authenticated app is actually visible/online.
app_anchor = "  const [isOnline, setIsOnline] = useState(navigator.onLine);\n"
app_insertion = app_anchor + r'''

  useEffect(() => {
    let disposed = false;

    const touchPresence = () => {
      if (disposed || document.visibilityState === 'hidden' || !navigator.onLine) return;

      void supabase.rpc('rpc_touch_last_seen').then(({ error }) => {
        if (error && import.meta.env.DEV) {
          console.warn('[presence] Could not update last active:', error.message);
        }
      });
    };

    touchPresence();
    const intervalId = window.setInterval(touchPresence, 60_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') touchPresence();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', touchPresence);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', touchPresence);
    };
  }, []);
'''
replace_once('App.tsx', app_anchor, app_insertion, 'authenticated presence heartbeat')

# UsersTab.tsx: never treat generic record edits as user activity.
replace_once(
    'components/admin/tabs/UsersTab.tsx',
    "    const raw = user?.last_seen ?? user?.last_active ?? user?.last_active_at ?? user?.updated_at ?? null;\n",
    "    const raw = user?.last_seen ?? user?.last_active ?? user?.last_active_at ?? null;\n",
    'remove fake updated_at activity fallback',
)

# gameService.ts: legacy whoami refreshes should touch the isolated presence ledger,
# not public.users (which has profile-side update triggers).
replace_once(
    'services/gameService.ts',
    "  // Update last_seen\n  supabase.from('users').update({ last_seen: new Date().toISOString() }).eq('id', user.id).then(() => {});\n",
    "  // Record real activity without mutating profile metadata/triggers.\n  supabase.rpc('rpc_touch_last_seen').then(() => {});\n",
    'route whoami presence through rpc',
)

print('Real user presence patch applied.')
