# Brains Heist iPhone and Android apps

The apps are the Brains Heist web app wrapped with [Capacitor 8](https://capacitorjs.com/). They ship the
built `dist/` folder inside the app and use the same Supabase backend as brainsheist.com, so every web
change reaches the apps on the next app build.

| | |
| --- | --- |
| App ID (both stores) | `com.brainsheist.app` |
| App name | Brains Heist |
| Native projects | `android/` (Android Studio), `ios/` (Xcode, Swift Package Manager) |
| Link scheme | `brainsheist://` (opens the app; universal links come with the Apple account) |
| Icon and splash sources | `assets/` (regenerate with `npx @capacitor/assets generate`) |

## Everyday commands

```bash
npm run native:sync      # build the web app and copy it into android/ and ios/
npm run native:android   # sync, then open Android Studio
npm run native:ios       # sync, then open Xcode (macOS only)
```

`npm run build` needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`). Set
`VITE_SITE_URL=https://www.brainsheist.com` for app builds so emails and sign-in links point at the website.

## Test builds without a Mac

- **Android:** the `Android test APK` GitHub Action builds `app-debug.apk` on every pull request that
  touches the native shell, and on demand (Actions → Android test APK → Run workflow). Download it from
  the run's Artifacts and install it on an Android phone (allow "install unknown apps").
- **iPhone:** needs the Apple Developer account (Brains Heist LLC, waiting on the D-U-N-S number). A
  TestFlight workflow on a macOS runner will be added once the account exists.

## How the code tells it is inside the app

`src/lib/nativePlatform.ts` → `isNativeApp()`. Inside the app:

- the service worker, the "install this app" guide and the web-push prompt are switched off (`index.tsx`);
- `getSiteUrl()` returns `https://www.brainsheist.com` instead of the local `capacitor://localhost` origin;
- `src/native/nativeShell.ts` styles the status bar, handles the Android back button and opens
  `brainsheist://` / brainsheist.com links in the matching in-app page.

Use `publicSiteUrl('/api/...')` for anything that must reach the live website (Vercel `/api` routes,
files that are not bundled in the app).

## Known gaps (next steps)

1. **App size.** `dist/` is about 540 MB (211 MB of Biology question images, ~130 MB of character art and
   sounds, plus test HTML). Google Play limits the base download to 200 MB, so images must be converted to
   WebP/AVIF and the largest test folders loaded from the website before a Play Store release.
2. **Google sign-in** must run in the system browser and return through `brainsheist://auth/callback`;
   add Sign in with Apple at the same time (App Store rule when Google sign-in is offered).
3. **Native push** (Firebase Cloud Messaging + APNs) to replace web push inside the app.
4. **Settings → Delete my account** (App Store rule).
5. **IELTS Prime** in-app purchase (Apple/Google) via RevenueCat; Paddle stays on the website.
