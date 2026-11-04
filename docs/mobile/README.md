# Brains Heist iPhone and Android apps

The apps are the Brains Heist web app wrapped with [Capacitor 8](https://capacitorjs.com/). They ship the
built `dist/` folder inside the app and use the same Supabase backend as brainsheist.com, so every web
change reaches the apps on the next app build.

| | |
| --- | --- |
| App ID (both stores) | `com.brainsheist.app` |
| App name | Brains Heist |
| Bundled web folder | `dist-native/` (made by `scripts/prepare-native-web.mjs` from `dist/`) |
| Native projects | `android/` (Android Studio), `ios/` (Xcode, Swift Package Manager) |
| Link scheme | `brainsheist://` (opens the app; universal links come with the Apple account) |
| Icon and splash sources | `assets/` (regenerate with `npx @capacitor/assets generate`) |

## Everyday commands

```bash
npm run native:sync      # build, trim into dist-native/, copy into android/ and ios/
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

1. **App size — done.** PNGs were shrunk in place with `scripts/optimize-png-assets.py` (434 MB → 122 MB,
   same file names), battle sounds moved from WAV to MP3, and `scripts/prepare-native-web.mjs` builds
   `dist-native/` without admission-test sources, past-paper PDFs, reports and source maps. The app's web
   content is ~181 MB on disk and ~151 MB compressed, under Google Play's 200 MB base limit. Run the image
   script again whenever large PNGs are added.
2. **Google sign-in — done in code.** `services/oauthSignIn.ts` opens Google in the system browser inside
   the app and returns through `brainsheist://auth/callback`. **One dashboard step is required:** Supabase →
   Authentication → URL Configuration → Redirect URLs → add `brainsheist://**`. Sign in with Apple (App Store
   rule when Google sign-in is offered) follows once the Apple Developer account exists.
3. **Native push** (Firebase Cloud Messaging + APNs) to replace web push inside the app.
4. **Settings → Delete my account** (App Store rule).
5. **IELTS Prime** in-app purchase (Apple/Google) via RevenueCat; Paddle stays on the website.
