import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LAYOUT,
  bubblePosition,
  bubblePreviewRegion,
  parseSheetToken,
} from "../src/lib/paperScan/layout";
import {
  classifyBubbles,
  homography,
  transform,
  readBubbles,
  markerCentres,
  type Raster,
} from "../src/lib/paperScan/omr";
const raster = (): Raster => {
  const data = new Uint8ClampedArray(LAYOUT.width * LAYOUT.height * 4);
  data.fill(255);
  return { width: LAYOUT.width, height: LAYOUT.height, data };
};
// Cropped/resampled from IMG_7129.png; contains only answer bubbles, no identity.
test("reported phone review rows recognise D and B despite local grid drift", () => {
  const fixture = JSON.parse(readFileSync("tests/fixtures/paperScanSingleMarkPhotoRows.json", "utf8"));
  for (let row = 0; row < fixture.rows.length; row++) {
    const image = raster();
    const region = bubblePreviewRegion(0, 4);
    const pixels = Buffer.from(fixture.rows[row], "base64");
    for (let y = 0; y < fixture.height; y++)
      for (let x = 0; x < fixture.width; x++) {
        const target = ((region.y + y) * image.width + region.x + x) * 4;
        const value = pixels[y * fixture.width + x];
        image.data[target] = image.data[target + 1] = image.data[target + 2] = value;
      }
    const detected = readBubbles(image, [{ questionId: "photo", orderIndex: 1, options: ["A", "B", "C", "D"] }])["photo"];
    assert.equal(detected.state, "clear", JSON.stringify(detected));
    assert.equal(detected.choice, fixture.expected[row]);
  }
});
test("sloped printed circles exclude outlines and preserve genuine double marks", () => {
  for (const marks of [[3], [1], [0, 2], []]) {
    const image = raster();
    image.data.fill(190);
    for (let choice = 0; choice < 4; choice++) {
      const p = bubblePosition(0, choice);
      const x = p.x + 4 - choice * 2, y = p.y - 3 + choice * 2;
      disk(image, x, y, 13, 30);
      disk(image, x, y, 10, 190);
      if (marks.includes(choice)) disk(image, x, y, 9, 70);
    }
    const detected = readBubbles(image, [{ questionId: "sloped", orderIndex: 1, options: ["A", "B", "C", "D"] }])["sloped"];
    assert.equal(detected.state, marks.length === 2 ? "multiple" : marks.length ? "clear" : "blank");
    assert.equal(detected.choice, marks.length === 1 ? marks[0] : null);
  }
});
function disk(image: Raster, x: number, y: number, r: number, value = 0) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx * dx + dy * dy <= r * r) {
        const p = ((y + dy) * image.width + x + dx) * 4;
        image.data[p] = image.data[p + 1] = image.data[p + 2] = value;
      }
}
test("bubble measurements distinguish clear marks, blanks, faint marks and double answers", () => {
  assert.equal(classifyBubbles([0, 0.95, 0, 0]).choice, 1);
  assert.equal(classifyBubbles([0, 0.95, 0, 0]).state, "clear");
  assert.equal(classifyBubbles([0, 0, 0, 0]).state, "blank");
  assert.equal(classifyBubbles([0.2, 0, 0, 0]).state, "uncertain");
  assert.equal(classifyBubbles([0.95, 0.85, 0, 0]).state, "multiple");
  assert.equal(classifyBubbles([0.7, 0.15, 0, 0]).state, "uncertain");
  assert.throws(() => classifyBubbles([NaN, 0]));
});
test("perspective transform maps all four corners and fails closed on degenerate geometry", () => {
  const from = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    to = [
      { x: 20, y: 10 },
      { x: 140, y: 25 },
      { x: 120, y: 160 },
      { x: 5, y: 130 },
    ];
  const h = homography(from, to);
  from.forEach((p, i) => {
    const v = transform(h, p);
    assert.ok(Math.abs(v.x - to[i].x) < 1e-6);
    assert.ok(Math.abs(v.y - to[i].y) < 1e-6);
  });
  assert.throws(() =>
    homography(
      from.map(() => ({ x: 0, y: 0 })),
      to,
    ),
  );
});
test("real raster reading measures interiors and recognises both answer columns", () => {
  const image = raster();
  const questions = Array.from({ length: 21 }, (_, i) => ({
    questionId: String(i),
    orderIndex: i + 1,
    options: ["A", "B", "C", "D"],
  }));
  let p = bubblePosition(0, 2);
  disk(image, p.x, p.y, 8);
  p = bubblePosition(20, 3);
  disk(image, p.x, p.y, 8);
  const rows = readBubbles(image, questions);
  assert.equal(rows["0"].choice, 2);
  assert.equal(rows["20"].choice, 3);
  assert.equal(rows["1"].state, "blank");
  p = bubblePosition(0, 0);
  disk(image, p.x, p.y, 8);
  assert.equal(readBubbles(image, questions)["0"].state, "multiple");
});
test("missing page markers and foreign QR contents are rejected", () => {
  assert.throws(() => markerCentres(raster()), /corner squares/);
  assert.equal(
    parseSheetToken("BH1:40000000-0000-0000-0000-000000000001"),
    "40000000-0000-0000-0000-000000000001",
  );
  assert.throws(() => parseSheetToken("https://example.com/student"));
});

test("solid corner detection tolerates coarse alignment noise and ignores text-shaped components", () => {
  const image = raster();
  for (const p of LAYOUT.markers) {
    for (let y = p.y - 10; y < p.y + 10; y++)
      for (let x = p.x - 10; x < p.x + 10; x++) {
        const i = (y * image.width + x) * 4;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = 0;
      }
  }
  // A nearby long black line is not a square marker.
  for (let y = 85; y < 90; y++)
    for (let x = 75; x < 135; x++) {
      const i = (y * image.width + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = 0;
    }
  const points = markerCentres(image);
  points.forEach((p, i) => {
    assert.ok(Math.abs(p.x - LAYOUT.markers[i].x) < 1);
    assert.ok(Math.abs(p.y - LAYOUT.markers[i].y) < 1);
  });
});

test("uneven single marks are accepted only with a substantial lead", () => {
  for (const coverage of [[0.45, 0.02, 0, 0], [0.55, 0.1, 0, 0], [0.8, 0.12, 0, 0]]) {
    assert.equal(classifyBubbles(coverage).state, "clear");
    assert.equal(classifyBubbles(coverage).choice, 0);
  }
  for (const coverage of [[0.39, 0, 0, 0], [0.4, 0.12, 0, 0], [0.8, 0.13, 0, 0], [0.25, 0.2, 0, 0]]) {
    assert.equal(classifyBubbles(coverage).state, "uncertain");
    assert.equal(classifyBubbles(coverage).choice, null);
  }
  assert.equal(classifyBubbles([0.9, 0.22, 0, 0]).state, "multiple");
  assert.equal(classifyBubbles([0.02, 0.03]).state, "blank");
});

test("pencil, uneven shading, mild shadows and stray graphite retain the intended answer", () => {
  const image = raster();
  const questions = Array.from({ length: 8 }, (_, i) => ({
    questionId: String(i), orderIndex: i + 1, options: ["A", "B", "C", "D"],
  }));
  // Medium-grey pencil: previously no pixels passed the fixed 170 threshold.
  let p = bubblePosition(0, 0);
  disk(image, p.x, p.y, 8, 180);
  // Messy half-fill: substantial, isolated mark, previously below 62%.
  p = bubblePosition(1, 2);
  disk(image, p.x + 5, p.y, 8, 60);
  // Pencil under a mild shadow.
  p = bubblePosition(2, 3);
  disk(image, p.x, p.y, 22, 200);
  disk(image, p.x, p.y, 8, 145);
  // Pencil extending outside the bubble cannot lower the paper reference.
  p = bubblePosition(3, 1);
  disk(image, p.x, p.y, 8, 180);
  disk(image, p.x + 18, p.y, 9, 30);
  // Light erasure and genuine double mark stay reviewable.
  p = bubblePosition(4, 0);
  disk(image, p.x, p.y, 3, 160);
  for (const choice of [0, 2]) {
    p = bubblePosition(5, choice);
    disk(image, p.x, p.y, 8, 180);
  }
  // Printed outlines must never be interpreted as filled bubbles.
  for (let choice = 0; choice < 4; choice++) {
    p = bubblePosition(6, choice);
    disk(image, p.x, p.y, 12);
    disk(image, p.x, p.y, 10, 255);
  }
  // True/false uses the same rules.
  questions[7].options = ["True", "False"];
  p = bubblePosition(7, 1);
  disk(image, p.x, p.y, 8, 180);
  const rows = readBubbles(image, questions);
  for (const [row, choice] of [[0, 0], [1, 2], [2, 3], [3, 1], [7, 1]]) {
    assert.equal(rows[String(row)].state, "clear", `row ${row}`);
    assert.equal(rows[String(row)].choice, choice);
  }
  assert.equal(rows["4"].state, "uncertain");
  assert.equal(rows["5"].state, "multiple");
  assert.equal(rows["6"].state, "blank");
});

test("review crops align every option centre with its equal-width button cell", () => {
  for (const row of [0, 19, 20, 39]) {
    for (const count of [2, 3, 4]) {
      const region = bubblePreviewRegion(row, count);
      for (let choice = 0; choice < count; choice++) {
        const bubble = bubblePosition(row, choice);
        assert.equal((bubble.x - region.x) / region.width, (choice + 0.5) / count);
        assert.equal(bubble.y - region.y, region.height / 2);
        for (const displayWidth of [192, 256, 320, 384]) {
          const photoCentre = ((bubble.x - region.x) / region.width) * displayWidth;
          const buttonCentre = ((choice + 0.5) / count) * displayWidth;
          assert.equal(photoCentre, buttonCentre);
        }
      }
    }
  }
});

