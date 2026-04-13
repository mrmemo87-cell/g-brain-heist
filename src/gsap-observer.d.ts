// Workaround: GSAP's observer.d.ts declares module "gsap/Observer" (capital O)
// but the file is named observer.d.ts (lowercase), causing TS1149 with
// forceConsistentCasingInFileNames. This shim provides a lowercase module path.
// The global Observer class is already available via gsap's /// <reference> chain.
declare module 'gsap/observer' {
  export { Observer };
  export { Observer as default };
}
