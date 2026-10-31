// Dev-only Vite config for e2e/commander.fixture.html: PGlite must not be pre-bundled,
// otherwise its WASM/data files are served from the wrong place.
import { defineConfig, mergeConfig, type ConfigEnv, type UserConfig } from 'vite';
import base from '../vite.config';

export default defineConfig((env: ConfigEnv) => mergeConfig(
  (typeof base === 'function' ? base(env) : base) as UserConfig,
  { optimizeDeps: { exclude: ['@electric-sql/pglite'] } },
));
