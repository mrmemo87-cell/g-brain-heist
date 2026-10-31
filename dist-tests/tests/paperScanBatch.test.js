import test from "node:test";
import assert from "node:assert/strict";
import { runScanBatch, MAX_SCAN_BATCH } from "../src/lib/paperScan/batch.js";
test("batch processes sequentially and continues after an unreadable page", async () => {
    const events = [];
    let active = 0;
    await runScanBatch([1, 2, 3], async (item) => {
        assert.equal(active++, 0);
        events.push(`start${item}`);
        await Promise.resolve();
        active--;
        if (item === 2)
            throw new Error("Unreadable QR");
        events.push(`done${item}`);
    }, (item, error) => {
        assert.equal(error.message, "Unreadable QR");
        events.push(`error${item}`);
    }, new AbortController().signal);
    assert.deepEqual(events, ["start1", "done1", "start2", "error2", "start3", "done3"]);
    assert.equal(MAX_SCAN_BATCH, 30);
});
test("stop finishes the current page and leaves subsequent photos untouched", async () => {
    const controller = new AbortController();
    const completed = [];
    await runScanBatch([1, 2, 3], async (item) => {
        completed.push(item);
        controller.abort();
    }, () => assert.fail("Stopping is not a scan error"), controller.signal);
    assert.deepEqual(completed, [1]);
});
