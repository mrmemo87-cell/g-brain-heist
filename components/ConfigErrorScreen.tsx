import React from 'react';

/**
 * Shown when required environment variables (e.g. VITE_SUPABASE_URL) are
 * missing.  Replaces the old "blank white page" failure with a clear,
 * actionable message so developers / previews / staging instantly know what
 * to fix.
 */
const ConfigErrorScreen: React.FC = () => (
  <div
    className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center"
    style={{ backgroundColor: 'var(--ink-900, #050813)', color: 'var(--paper-50, #eef4ff)' }}
  >
    <span className="text-6xl" role="img" aria-label="warning">⚙️</span>

    <h1
      className="font-heading text-3xl font-bold tracking-wide"
      style={{ color: 'var(--danger-red, #ff5f9f)' }}
    >
      Configuration Missing
    </h1>

    <p className="max-w-md text-lg" style={{ color: 'var(--mist-400, #a9b7d4)' }}>
      The app could not start because one or more required environment variables
      are not set.
    </p>

    <div className="w-full max-w-md rounded-lg bg-black/40 p-5 text-left font-mono text-sm leading-relaxed">
      <p className="mb-2 font-bold" style={{ color: 'var(--amber-warn, #ffc861)' }}>
        Required variables:
      </p>
      <ul className="list-inside list-disc space-y-1" style={{ color: 'var(--mist-400, #a9b7d4)' }}>
        <li>VITE_SUPABASE_URL</li>
        <li>VITE_SUPABASE_ANON_KEY</li>
      </ul>
    </div>

    <div className="max-w-md text-sm leading-relaxed" style={{ color: 'var(--mist-400, #a9b7d4)' }}>
      <p className="mb-2 font-semibold">How to fix</p>
      <ol className="list-inside list-decimal space-y-1 text-left">
        <li>
          Copy <code className="rounded bg-white/10 px-1">.env.example</code> to{' '}
          <code className="rounded bg-white/10 px-1">.env</code>
        </li>
        <li>Fill in your Supabase project URL and anon key.</li>
        <li>Restart the dev server.</li>
      </ol>
    </div>

    <button
      onClick={() => window.location.reload()}
      className="mt-2 rounded-xl px-6 py-3 font-heading text-lg transition-all hover:scale-105"
      style={{
        background: 'linear-gradient(135deg, var(--ion-blue, #2cf6c8), var(--plasma-pink, #9a6bff))',
        color: 'white',
      }}
    >
      🔄 Retry
    </button>
  </div>
);

export default ConfigErrorScreen;
