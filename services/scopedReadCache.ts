/** A bounded single-entry cache. A session/token change isolates both values and
 * in-flight requests; invalidation prevents older responses repopulating it. */
export function createScopedReadCache<T>(ttlMs: number, cacheable: (value: T) => boolean = () => true) {
  let scope: string | undefined;
  let generation = 0;
  let cached: { value: T; expires: number } | undefined;
  let pending: Promise<T> | undefined;
  function clear() {
    generation++;
    cached = undefined;
    pending = undefined;
  }
  return {
    clear,
    read(key: string, load: () => Promise<T>, force = false): Promise<T> {
      if (scope !== key) { clear(); scope = key; }
      if (!force && cached && cached.expires > Date.now()) return Promise.resolve(cached.value);
      if (pending) return pending;
      const startedGeneration = generation;
      const request = Promise.resolve().then(load).then(value => {
        if (generation === startedGeneration) cached = cacheable(value)
          ? { value, expires: Date.now() + ttlMs } : undefined;
        return value;
      }).finally(() => { if (pending === request) pending = undefined; });
      pending = request;
      return request;
    },
  };
}
