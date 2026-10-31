import test from "node:test";
import assert from "node:assert/strict";
import { saveRowPreviews, loadRowPreviews } from "../services/paperScanPreviewCache.js";
test("unavailable device preview storage leaves scanning usable and reports missing previews", async () => {
    // Node has no IndexedDB, matching private/device storage denial.
    assert.equal(await saveRowPreviews("teacher", "assignment", "sheet", "hash", { q: "data:image/png;base64,test" }), false);
    assert.equal(await loadRowPreviews("teacher", "assignment", "sheet", "hash"), null);
});
test("previews survive reopening and are isolated by teacher, assignment, page and photo", async (t) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
    const records = new Map();
    const request = (result) => {
        const value = { result, onsuccess: null };
        queueMicrotask(() => value.onsuccess?.());
        return value;
    };
    const db = {
        close() { },
        transaction() {
            const tx = { oncomplete: null,
                objectStore: () => ({
                    getAll: () => request([...records.values()]),
                    get: (key) => request(records.get(key)),
                    delete: (key) => records.delete(key),
                    put: (row) => {
                        records.set(row.key, row);
                        queueMicrotask(() => tx.oncomplete?.());
                    },
                }),
            };
            return tx;
        },
    };
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: { open: () => request(db) } });
    let now = Date.now();
    t.mock.method(Date, "now", () => now);
    try {
        const crops = { q12: "data:image/png;base64,original-row" };
        assert.equal(await saveRowPreviews("teacher", "assignment", "page", "photo", crops), true);
        assert.deepEqual(await loadRowPreviews("teacher", "assignment", "page", "photo"), crops);
        for (const ids of [["other", "assignment", "page", "photo"], ["teacher", "other", "page", "photo"], ["teacher", "assignment", "other", "photo"], ["teacher", "assignment", "page", "other"]]) {
            assert.equal(await loadRowPreviews(ids[0], ids[1], ids[2], ids[3]), null);
        }
        now += 8 * 86400000;
        assert.equal(await loadRowPreviews("teacher", "assignment", "page", "photo"), null);
        await saveRowPreviews("teacher", "assignment", "page", "new-photo", crops);
        assert.equal(records.size, 1, "old previews are removed on the next write");
    }
    finally {
        if (descriptor)
            Object.defineProperty(globalThis, "indexedDB", descriptor);
        else
            Reflect.deleteProperty(globalThis, "indexedDB");
    }
});
