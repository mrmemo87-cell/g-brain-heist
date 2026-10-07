/** Bound a read and cancel its HTTP request; never turn a timeout into empty data. */
export async function boundedRead<T>(
  read: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectCancellation: (reason: Error) => void = () => {};
  const cancelled = new Promise<never>((_, reject) => { rejectCancellation = reject; });
  const cancel = (reason: Error) => { controller.abort(); rejectCancellation(reason); };
  const parentAbort = () => cancel(new Error('Read cancelled'));
  try {
    if (parentSignal?.aborted) throw new Error('Read cancelled');
    parentSignal?.addEventListener('abort', parentAbort, { once: true });
    timer = setTimeout(() => cancel(new Error('Read timed out')), timeoutMs);
    return await Promise.race([read(controller.signal), cancelled]);
  } finally {
    if (timer) clearTimeout(timer);
    parentSignal?.removeEventListener('abort', parentAbort);
  }
}
