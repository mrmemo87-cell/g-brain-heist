import {
  LAYOUT,
  bubblePosition,
  type ScanQuestion,
  type DetectedRow,
} from "./layout";
export interface Point {
  x: number;
  y: number;
}
export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
/** Solve an eight-parameter homography. Fail closed on degenerate geometry. */
export function homography(
  from: readonly Point[],
  to: readonly Point[],
): number[] {
  if (from.length !== 4 || to.length !== 4)
    throw new Error("Four page corners are required.");
  const rows: number[][] = [];
  from.forEach((p, i) => {
    const q = to[i];
    rows.push(
      [p.x, p.y, 1, 0, 0, 0, -q.x * p.x, -q.x * p.y, q.x],
      [0, 0, 0, p.x, p.y, 1, -q.y * p.x, -q.y * p.y, q.y],
    );
  });
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let i = col + 1; i < 8; i++)
      if (Math.abs(rows[i][col]) > Math.abs(rows[pivot][col])) pivot = i;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const d = rows[col][col];
    if (Math.abs(d) < 1e-9)
      throw new Error("The page is too tilted. Retake it from above.");
    for (let j = col; j <= 8; j++) rows[col][j] /= d;
    for (let i = 0; i < 8; i++) {
      if (i === col) continue;
      const f = rows[i][col];
      for (let j = col; j <= 8; j++) rows[i][j] -= f * rows[col][j];
    }
  }
  return [...rows.map((r) => r[8]), 1];
}
export function transform(h: number[], p: Point): Point {
  const d = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / d,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / d,
  };
}
const luminance = (data: Uint8ClampedArray, index: number) =>
  data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
export function warp(source: Raster, canonicalToSource: number[]): Raster {
  const data = new Uint8ClampedArray(LAYOUT.width * LAYOUT.height * 4);
  data.fill(255);
  for (let y = 0; y < LAYOUT.height; y++)
    for (let x = 0; x < LAYOUT.width; x++) {
      const p = transform(canonicalToSource, { x, y });
      const sx = Math.round(p.x),
        sy = Math.round(p.y);
      if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height)
        continue;
      const i = (y * LAYOUT.width + x) * 4,
        j = (sy * source.width + sx) * 4;
      data[i] = source.data[j];
      data[i + 1] = source.data[j + 1];
      data[i + 2] = source.data[j + 2];
    }
  return { width: LAYOUT.width, height: LAYOUT.height, data };
}
export function markerCentres(image: Raster, searchRadius = 100): Point[] {
  return LAYOUT.markers.map((p) => {
    const minX = Math.max(0, Math.round(p.x - searchRadius)),
      maxX = Math.min(image.width - 1, Math.round(p.x + searchRadius));
    const minY = Math.max(0, Math.round(p.y - searchRadius)),
      maxY = Math.min(image.height - 1, Math.round(p.y + searchRadius));
    const width = maxX - minX + 1,
      height = maxY - minY + 1,
      visited = new Uint8Array(width * height);
    const candidates: { point: Point; distance: number }[] = [];
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const local = (y - minY) * width + x - minX;
        if (visited[local]) continue;
        visited[local] = 1;
        if (luminance(image.data, (y * image.width + x) * 4) >= 110) continue;
        const queue = [{ x, y }];
        let count = 0,
          xsum = 0,
          ysum = 0,
          left = x,
          right = x,
          top = y,
          bottom = y;
        for (let head = 0; head < queue.length; head++) {
          const current = queue[head];
          count++;
          xsum += current.x;
          ysum += current.y;
          left = Math.min(left, current.x);
          right = Math.max(right, current.x);
          top = Math.min(top, current.y);
          bottom = Math.max(bottom, current.y);
          for (const [dx, dy] of [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
          ]) {
            const nx = current.x + dx,
              ny = current.y + dy;
            if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
            const index = (ny - minY) * width + nx - minX;
            if (visited[index]) continue;
            visited[index] = 1;
            if (luminance(image.data, (ny * image.width + nx) * 4) < 110)
              queue.push({ x: nx, y: ny });
          }
        }
        const w = right - left + 1,
          h = bottom - top + 1;
        if (
          count < 170 ||
          count > 1600 ||
          w < 13 ||
          h < 13 ||
          w / h < 0.65 ||
          w / h > 1.55 ||
          count / (w * h) < 0.8
        )
          continue;
        const point = { x: xsum / count, y: ysum / count };
        candidates.push({
          point,
          distance: Math.hypot(point.x - p.x, point.y - p.y),
        });
      }
    candidates.sort((a, b) => a.distance - b.distance);
    if (!candidates.length)
      throw new Error(
        "Keep all four corner squares visible. Retake the photo.",
      );
    return candidates[0].point;
  });
}
/** Interior-only measurements exclude printed outlines. Local paper brightness handles mild shadows. */
export function bubbleCoverage(image: Raster, p: Point): number {
  const background: number[] = [];
  for (let y = -18; y <= 18; y++)
    for (let x = -18; x <= 18; x++)
      if (x * x + y * y >= 225 && x * x + y * y <= 324) {
        background.push(luminance(
          image.data,
          ((p.y + y) * image.width + p.x + x) * 4,
        ));
      }
  // Stray pencil outside the circle must not darken the paper reference.
  background.sort((a, b) => a - b);
  const paper = background[Math.floor(background.length * 0.75)];
  if (paper < 95)
    throw new Error("A dark shadow covers the answers. Retake in even light.");
  let marked = 0,
    count = 0;
  // Measure contrast against local paper, including medium-grey graphite.
  // Very light erasures remain below this contrast and require review.
  const threshold = Math.min(205, paper - Math.max(30, paper * 0.2));
  for (let y = -7; y <= 7; y++)
    for (let x = -7; x <= 7; x++)
      if (x * x + y * y <= 49) {
        count++;
        if (
          luminance(image.data, ((p.y + y) * image.width + p.x + x) * 4) <
          threshold
        )
          marked++;
      }
  return marked / count;
}
export function classifyBubbles(coverage: number[]): DetectedRow {
  if (
    coverage.length < 2 ||
    coverage.length > 4 ||
    coverage.some((v) => !Number.isFinite(v) || v < 0 || v > 1)
  )
    throw new Error("Invalid bubble measurements.");
  const sorted = coverage.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v),
    first = sorted[0],
    second = sorted[1];
  if (first.v < 0.06) return { choice: null, state: "blank", coverage };
  if (second.v >= 0.22) return { choice: null, state: "multiple", coverage };
  // Accept uneven shading only when a substantial single mark dominates.
  // Two substantial marks are always reviewed, even if one is darker.
  if (
    first.v >= 0.4 &&
    second.v <= 0.12 &&
    first.v - second.v >= 0.3
  )
    return { choice: first.i, state: "clear", coverage };
  return { choice: null, state: "uncertain", coverage };
}
export function readBubbles(
  image: Raster,
  questions: ScanQuestion[],
): Record<string, DetectedRow> {
  if (
    image.width !== LAYOUT.width ||
    image.height !== LAYOUT.height ||
    questions.length < 1 ||
    questions.length > 40
  )
    throw new Error("Unsupported sheet layout.");
  return Object.fromEntries(
    questions.map((q, row) => [
      q.questionId,
      classifyBubbles(
        q.options.map((_, choice) =>
          bubbleCoverage(image, bubblePosition(row, choice)),
        ),
      ),
    ]),
  );
}
