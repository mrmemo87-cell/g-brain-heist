import React from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reactLazy: (factory: () => Promise<{ default: any }>) => any = (React as any).lazy;

/**
 * Wraps React.lazy with automatic retry + cache-bust for stale deployment chunks.
 *
 * After a new deployment Vite generates fresh hashed filenames for every chunk.
 * Users whose browser still holds the old index.html will request chunk URLs that
 * no longer exist on the server, producing:
 *   "Failed to fetch dynamically imported module: …"
 *
 * This helper:
 *  1. Retries the dynamic import up to `maxRetries` times with a short delay.
 *  2. On failure, forces a single hard page reload (cache-bust) so the browser
 *     fetches the new index.html with updated chunk references.
 *  3. Uses sessionStorage to prevent infinite reload loops — if the page was
 *     already reloaded once for this specific chunk, it gives up.
 */

const RELOAD_KEY_PREFIX = 'chunk-reload:';

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes('dynamically imported module')
  );
}

export function lazyRetry(
  importFn: () => Promise<{ default: any }>,
  chunkName?: string,
  maxRetries = 2
) {
  return reactLazy(() => retryImport(importFn, chunkName, maxRetries));
}

async function retryImport(
  importFn: () => Promise<{ default: any }>,
  chunkName?: string,
  retriesLeft = 2
): Promise<{ default: any }> {
  try {
    return await importFn();
  } catch (error) {
    // Only handle chunk-load errors; re-throw everything else immediately
    if (!isChunkLoadError(error)) throw error;

    // Still have retries? Wait briefly and try again (transient network blip)
    if (retriesLeft > 0) {
      await new Promise((r) => setTimeout(r, 1000));
      return retryImport(importFn, chunkName, retriesLeft - 1);
    }

    // Out of retries — attempt a one-time hard reload to bust the cache
    const key = RELOAD_KEY_PREFIX + (chunkName ?? 'unknown');
    const alreadyReloaded = sessionStorage.getItem(key);

    if (!alreadyReloaded) {
      sessionStorage.setItem(key, '1');
      window.location.reload();
      // Return a never-resolving promise so React doesn't try to render
      // the failed component while the browser is reloading
      return new Promise(() => {});
    }

    // Already reloaded once for this chunk — clear flag and let the error
    // propagate so the ErrorBoundary can display a proper message
    sessionStorage.removeItem(key);
    throw error;
  }
}

export default lazyRetry;
