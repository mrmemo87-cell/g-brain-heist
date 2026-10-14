import jsQR from "jsqr";
import { LAYOUT, parseSheetToken } from "./layout";
import { homography, markerCentres, markerCandidates, transform, warp, type Raster, type Point } from "./omr";

function resize(image: Raster, width: number): Raster {
  const scale = width / image.width;
  const height = Math.round(image.height * scale);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.floor(x / scale));
      const sy = Math.min(image.height - 1, Math.floor(y / scale));
      const target = (y * width + x) * 4, source = (sy * image.width + sx) * 4;
      for (let c = 0; c < 4; c++) data[target + c] = image.data[source + c];
    }
  return { width, height, data };
}
function contrast(image: Raster): Raster {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < image.data.length; i += 4)
    histogram[Math.round(image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114)]++;
  const total = image.width * image.height;
  let low = 0, high = 255, count = 0;
  for (let v = 0; v < 256; v++) { count += histogram[v]; if (count >= total * 0.01) { low = v; break; } }
  count = 0;
  for (let v = 255; v >= 0; v--) { count += histogram[v]; if (count >= total * 0.05) { high = v; break; } }
  const data = new Uint8ClampedArray(image.data.length);
  for (let i = 0; i < data.length; i += 4) {
    const value = image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114;
    const gray = Math.max(0, Math.min(255, (value - low) * 255 / Math.max(40, high - low)));
    data[i] = data[i + 1] = data[i + 2] = gray;
    data[i + 3] = 255;
  }
  return { ...image, data };
}

/** Retry QR decoding at a quieter resolution and with contrast normalization.
 * Coordinates are always converted back to the untouched original photograph.
 */
export function decodeSheetQr(image: Raster) {
  const reducedWidth = Math.round(image.width * Math.min(1, 1400 / Math.max(image.width, image.height)));
  const candidates = [() => image, () => resize(image, reducedWidth), () => contrast(image)];
  for (const candidate of candidates) {
    const raster = candidate();
    const qr = jsQR(raster.data, raster.width, raster.height, { inversionAttempts: "attemptBoth" });
    if (!qr) continue;
    const sheetId = parseSheetToken(qr.data);
    const sx = image.width / raster.width, sy = image.height / raster.height;
    const point = (p: Point) => ({ x: p.x * sx, y: p.y * sy });
    return { sheetId, version: qr.version, corners: [
      point(qr.location.topLeftCorner), point(qr.location.topRightCorner),
      point(qr.location.bottomRightCorner), point(qr.location.bottomLeftCorner),
    ] };
  }
  throw new Error("The QR code could not be read. Keep it visible and avoid glare.");
}

export function normalizeScanPhoto(image: Raster, anchors?: readonly Point[]) {
  const qr = decodeSheetQr(image);
  const modules = 17 + qr.version * 4;
  const unit = LAYOUT.qr.size / (modules + 8);
  const left = LAYOUT.qr.x + 4 * unit, top = LAYOUT.qr.y + 4 * unit, size = modules * unit;
  const canonical = [{ x: left, y: top }, { x: left + size, y: top },
    { x: left + size, y: top + size }, { x: left, y: top + size }];
  const [tl, tr, br, bl] = qr.corners;
  const scale = (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(bl.x - tl.x, bl.y - tl.y)) / (2 * size);
  const affine = [tl, tr, { x: tr.x + bl.x - tl.x, y: tr.y + bl.y - tl.y }, bl];
  const calibrate = (centres: Point[]) => {
    if (centres.length !== 4 || centres.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x >= image.width || p.y >= image.height)) throw new Error("Four visible corner squares are required.");
    if (new Set(centres.map(p => `${p.x}:${p.y}`)).size !== 4) throw new Error("Page corners overlap.");
    for (let i = 0; i < 4; i++) {
      const a = centres[i], b = centres[(i + 1) % 4], c = centres[(i + 2) % 4];
      if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0) throw new Error("Choose the corners clockwise, starting at the printed page’s top left.");
    }
    const sourceToCanonical = homography(centres, LAYOUT.markers);
    if (qr.corners.some((p, i) => {
      const mapped = transform(sourceToCanonical, p);
      return !Number.isFinite(mapped.x) || !Number.isFinite(mapped.y) || Math.hypot(mapped.x - canonical[i].x, mapped.y - canonical[i].y) > 10;
    })) throw new Error("Page corners disagree with the QR position.");
    const normalized = warp(image, homography(LAYOUT.markers, centres));
    const verified = markerCentres(normalized, 28);
    if (verified.some((p, i) => Math.hypot(p.x - LAYOUT.markers[i].x, p.y - LAYOUT.markers[i].y) > 4)) throw new Error("Page calibration could not be verified.");
    return { sheetId: qr.sheetId, image: normalized };
  };
  if (anchors) {
    if (anchors.length !== 4 || anchors.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > 1 || p.y > 1)) throw new Error("Choose all four corner squares.");
    const expected = anchors.map(p => ({ x: p.x * image.width, y: p.y * image.height }));
    // Taps locate the search, never override square, QR, or geometry validation.
    const localScale = (Math.hypot(expected[1].x - expected[0].x, expected[1].y - expected[0].y) / 910 + Math.hypot(expected[3].x - expected[0].x, expected[3].y - expected[0].y) / 1324) / 2;
    return calibrate(markerCentres(image, 45 * localScale, expected, localScale));
  }
  let lastError: unknown;
  // QR extrapolation is noisy far from the code. Match candidate sets jointly
  // against the independent QR; a nearby dark blob cannot reject a real square.
  for (const corners of [qr.corners, affine]) {
    for (const radius of [140, 260]) {
      try {
        const estimate = homography(canonical, corners);
        const expected = LAYOUT.markers.map(p => transform(estimate, p));
        const candidates = markerCandidates(image, radius * scale, expected, scale);
        for (const tl of candidates[0]) for (const tr of candidates[1]) for (const br of candidates[2]) for (const bl of candidates[3]) {
          try { return calibrate([tl, tr, br, bl]); } catch (error) { lastError = error; }
        }
      } catch (error) { lastError = error; }
    }
  }
  throw new Error("The page corners could not be matched. Include all four squares and leave a little space around the sheet.", { cause: lastError });
}
