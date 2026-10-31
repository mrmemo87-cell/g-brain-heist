/** Bound a read and cancel its HTTP request; never turn a timeout into empty data. */
export async function boundedRead(read, timeoutMs, parentSignal) {
    const controller = new AbortController();
    let timer;
    let rejectCancellation = () => { };
    const cancelled = new Promise((_, reject) => { rejectCancellation = reject; });
    const cancel = (reason) => { controller.abort(); rejectCancellation(reason); };
    const parentAbort = () => cancel(new Error('Read cancelled'));
    try {
        if (parentSignal?.aborted)
            throw new Error('Read cancelled');
        parentSignal?.addEventListener('abort', parentAbort, { once: true });
        timer = setTimeout(() => cancel(new Error('Read timed out')), timeoutMs);
        return await Promise.race([read(controller.signal), cancelled]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
        parentSignal?.removeEventListener('abort', parentAbort);
    }
}
