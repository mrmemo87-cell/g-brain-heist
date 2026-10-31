import assert from "node:assert/strict";
import test from "node:test";
import { planBookletPrint } from "../src/lib/paperScan/printBooklets.js";
test("three-page duplex packs keep the next student off the previous student's back page", () => {
    const plan = planBookletPrint([3, 3], { keepTogether: true, duplex: true, pagesPerSide: 1 });
    assert.deepEqual(plan.padding, [1, 0]);
    assert.deepEqual(plan.startPages, [1, 5]);
    assert.equal(plan.physicalSheets, 4);
});
test("all supported printer layouts align every student to a new sheet with minimum padding", () => {
    for (const duplex of [false, true])
        for (const pagesPerSide of [1, 2, 4]) {
            for (let length = 1; length <= 25; length++) {
                const counts = Array.from({ length }, (_, i) => 1 + (i * 7 + length) % 19);
                const plan = planBookletPrint(counts, { keepTogether: true, duplex, pagesPerSide });
                plan.startPages.forEach((start) => assert.equal((start - 1) % plan.pagesPerSheet, 0));
                plan.padding.forEach((blank) => assert.ok(blank >= 0 && blank < plan.pagesPerSheet));
                assert.equal(plan.padding.at(-1), 0);
                assert.equal(plan.totalPages, plan.contentPages + plan.blankPages);
                assert.equal(plan.physicalSheets, counts.reduce((sum, count) => sum + Math.ceil(count / plan.pagesPerSheet), 0));
            }
        }
});
test("turning separation off adds no blank pages", () => {
    const plan = planBookletPrint([3, 5], { keepTogether: false, duplex: true, pagesPerSide: 4 });
    assert.deepEqual(plan.padding, [0, 0]);
    assert.equal(plan.totalPages, 8);
    assert.equal(plan.physicalSheets, 1);
});
test("empty orders and exact-sheet packs do not create trailing blank sheets", () => {
    assert.equal(planBookletPrint([], { keepTogether: true, duplex: true, pagesPerSide: 1 }).physicalSheets, 0);
    assert.deepEqual(planBookletPrint([8, 8], { keepTogether: true, duplex: true, pagesPerSide: 4 }).padding, [0, 0]);
});
test("invalid page counts and unsupported layouts fail closed", () => {
    for (const count of [0, -1, 1.5, NaN])
        assert.throws(() => planBookletPrint([count], { keepTogether: true, duplex: true, pagesPerSide: 1 }));
    assert.throws(() => planBookletPrint([1], { keepTogether: true, duplex: false, pagesPerSide: 3 }));
});
