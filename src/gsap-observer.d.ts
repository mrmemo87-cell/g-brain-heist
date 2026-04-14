// Workaround: GSAP's observer.d.ts declares module "gsap/Observer" (capital O)
// but the file is named observer.d.ts (lowercase), causing TS1149 with
// forceConsistentCasingInFileNames on case-insensitive OS (Windows) where CI
// sees both casings. We re-declare the module here so TS resolves via this shim
// (which is in src/, not node_modules) and avoids the casing conflict.
declare module 'gsap/Observer' {
  class _Observer {
    static create(vars: Record<string, unknown>): _Observer;
    kill(): void;
  }
  export { _Observer as Observer, _Observer as default };
}
