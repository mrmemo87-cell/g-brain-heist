import type { CapacitorConfig } from '@capacitor/cli';

// Brains Heist iPhone + Android apps. The apps ship the built website (dist/) inside them and talk to the
// same Supabase backend as brainsheist.com. Build with `npm run native:sync`, then open the native project
// with `npx cap open android` / `npx cap open ios`. See docs/mobile/README.md.
const config: CapacitorConfig = {
  appId: 'com.brainsheist.app',
  appName: 'Brains Heist',
  webDir: 'dist',
  backgroundColor: '#050813',
  android: {
    // The app talks only to https endpoints; keep mixed content and WebView debugging off in release builds.
    allowMixedContent: false,
  },
  ios: {
    // The app already handles notches and the home indicator with CSS safe-area insets.
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#050813',
      showSpinner: false,
    },
  },
};

export default config;
