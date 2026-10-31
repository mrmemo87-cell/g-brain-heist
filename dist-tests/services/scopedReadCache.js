/** A bounded single-entry cache. A session/token change isolates both values and
 * in-flight requests; invalidation prevents older responses repopulating it. */
export function createScopedReadCache(ttlMs, cacheable = () => true) {
    let scope;
    let generation = 0;
    let cached;
    let pending;
    function clear() {
        generation++;
        cached = undefined;
        pending = undefined;
    }
    return {
        clear,
        read(key, load, force = false) {
            if (scope !== key) {
                clear();
                scope = key;
            }
            if (!force && cached && cached.expires > Date.now())
                return Promise.resolve(cached.value);
            if (pending)
                return pending;
            const startedGeneration = generation;
            const request = Promise.resolve().then(load).then(value => {
                if (generation === startedGeneration)
                    cached = cacheable(value)
                        ? { value, expires: Date.now() + ttlMs } : undefined;
                return value;
            }).finally(() => { if (pending === request)
                pending = undefined; });
            pending = request;
            return request;
        },
    };
}
