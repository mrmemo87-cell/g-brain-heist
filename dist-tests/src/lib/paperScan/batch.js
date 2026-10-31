export const MAX_SCAN_BATCH = 30;
/** One photo at a time keeps phone memory bounded. One bad page never drops
 * the rest of the batch; cancellation leaves queued pages available to retry.
 */
export async function runScanBatch(items, process, failed, signal) {
    for (const item of items) {
        if (signal.aborted)
            break;
        try {
            await process(item);
        }
        catch (error) {
            if (signal.aborted)
                break;
            failed(item, error);
        }
    }
}
