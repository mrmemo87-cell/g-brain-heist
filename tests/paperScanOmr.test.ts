import test from "node:test";
import assert from "node:assert/strict";
import {
  LAYOUT,
  bubblePosition,
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
