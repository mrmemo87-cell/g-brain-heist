import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCanvas, loadImage } from "canvas";
import { buildBubbleSheetSvg } from "../services/scanSheetPrintService";
import type { PaperWorkspace } from "../services/assignmentPaperService";
import { LAYOUT, bubblePosition, type ScanSheet, type ScanSession } from "../src/lib/paperScan/layout";
import { detectedAnswers } from "../services/paperScanImage";
import { normalizeScanPhoto, decodeSheetQr } from "../src/lib/paperScan/recognition";
import { readBubbles, bubbleCoverage, classifyBubbles, homography, transform, type Raster } from "../src/lib/paperScan/omr";

const questions = Array.from({ length: 40 }, (_, row) => ({ questionId: String(row), orderIndex: row + 1, options: ["A", "B", "C", "D"] }));
const sheet: ScanSheet = { id: "40000000-0000-0000-0000-000000000001", studentId: "test", studentName: "Scanner regression fixture", pageNumber: 1, pageCount: 1, layoutVersion: LAYOUT.version, questions };
const session: ScanSession = { id: "fixture", assignmentId: "fixture", assessedAt: "2026-10-12T09:00:00Z", formHash: "12345678", sheets: [sheet] };
const packet = { code: "BH-TEST", assignment: { title: "Printed scanner fixture", className: "Test class" } } as unknown as PaperWorkspace;

async function printedSheet(shiftRows = false): Promise<Raster> {
  let svg = buildBubbleSheetSvg(sheet, session, packet, "Fixture school");
  if (shiftRows) svg = svg.replace(/<circle cx="(\d+)" cy="(\d+)" r="12"/g, (all, x, y) => Number(y) >= 395 && Number(y) < 1180 ? `<circle cx="${Number(x) - 2}" cy="${Number(y) + 6}" r="12"` : all);
  const canvas = createCanvas(LAYOUT.width, LAYOUT.height), ctx = canvas.getContext("2d");
  ctx.drawImage(await loadImage(Buffer.from(svg)), 0, 0, LAYOUT.width, LAYOUT.height);
  questions.forEach((_, row) => {
    if (row % 7 === 0) return;
    const choices = row === 10 ? [0, 2] : [row % 4];
    for (const choice of choices) {
      const p = bubblePosition(row, choice);
      ctx.fillStyle = "#606060";
      ctx.beginPath();
      ctx.arc(p.x + (shiftRows ? -2 : 0), p.y + (shiftRows ? 6 : 0), row === 12 ? 3 : 9, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data: pixels.data };
}

async function phonePhoto(source: Raster, grayPhotocopy = false): Promise<Raster> {
  const width = 1250, height = 1850, data = new Uint8ClampedArray(width * height * 4).fill(255);
  const from = [{ x: 0, y: 0 }, { x: LAYOUT.width, y: 0 }, { x: LAYOUT.width, y: LAYOUT.height }, { x: 0, y: LAYOUT.height }];
  const to = [{ x: 135, y: 95 }, { x: 1135, y: 175 }, { x: 1040, y: 1685 }, { x: 180, y: 1760 }];
  const h = homography(to, from);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = transform(h, { x, y }), sx = Math.round(p.x), sy = Math.round(p.y);
    if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue;
    const target = (y * width + x) * 4, original = (sy * source.width + sx) * 4;
    for (let c = 0; c < 3; c++) {
      const value = source.data[original + c];
      data[target + c] = grayPhotocopy ? 130 + value * 0.43 : value * (0.85 + 0.1 * x / width);
    }
  }
  // Real JPEG encoding adds edge/ringing artefacts absent from ideal disks.
  const canvas = createCanvas(width, height), ctx = canvas.getContext("2d");
  const pixels = ctx.createImageData(width, height); pixels.data.set(data); ctx.putImageData(pixels, 0, 0);
  const decoded = await loadImage(canvas.toBuffer("image/jpeg", { quality: 0.72 }));
  ctx.drawImage(decoded, 0, 0);
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

function checkRows(image: Raster) {
  const rows = readBubbles(image, questions);
  for (let row = 0; row < questions.length; row++) {
    const result = rows[String(row)];
    if (row % 7 === 0) assert.equal(result.state, "blank", `blank row ${row}`);
    else if (row === 10) assert.equal(result.state, "multiple", "double mark retained");
    else if (row === 12) assert.equal(result.state, "uncertain", "small/faint mark retained");
    else {
      assert.equal(result.state, "clear", `clear row ${row}: ${JSON.stringify(result.coverage)}`);
      assert.equal(result.choice, row % 4, `choice row ${row}`);
    }
  }
}
test("actual printed SVG with locally shifted circles reads both columns without flagging outlines", async () => {
  const source = await printedSheet(true);
  const result = normalizeScanPhoto(source);
  assert.equal(result.sheetId, sheet.id);
  checkRows(result.image);
});
test("complete printed sheet survives phone perspective, JPEG artefacts and mild shadows", async () => {
  const source = await phonePhoto(await printedSheet(true));
  checkRows(normalizeScanPhoto(source).image);
});
test("QR and rotated corner squares survive a grey photocopy photographed at an angle", async () => {
  const source = await phonePhoto(await printedSheet(), true);
  checkRows(normalizeScanPhoto(source).image);
});
test("a cropped page cannot be calibrated as a complete answer sheet", async () => {
  const source = await printedSheet();
  for (let y = 1310; y < source.height; y++) for (let x = 0; x < source.width; x++) {
    const i = (y * source.width + x) * 4;
    source.data[i] = source.data[i + 1] = source.data[i + 2] = 255;
  }
  assert.throws(() => normalizeScanPhoto(source), /corners/);
});


test("reported screenshot bands reproduce the false flags and read correctly after local registration", async () => {
  const fixtures = JSON.parse(readFileSync("tests/fixtures/paperScanReviewRows.json", "utf8"));
  for (const [key, expected] of [["blank", "blank"], ["filledC", "clear"]]) {
    const canvas = createCanvas(LAYOUT.width, LAYOUT.height), ctx = canvas.getContext("2d");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(await loadImage(Buffer.from(fixtures[key], "base64")), 186, 376);
    const raster = { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
    const unregistered = classifyBubbles([0, 1, 2, 3].map((choice) => bubbleCoverage(raster, bubblePosition(0, choice))));
    assert.notEqual(unregistered.state, expected, "old fixed-centre reader reproduces reported failure");
    const result = readBubbles(raster, [questions[0]])["0"];
    assert.equal(result.state, expected);
    if (expected === "clear") assert.equal(result.choice, 2);
  }
});
test("QR decoding accepts an inverted code", async () => {
  const source = await printedSheet();
  for (let i = 0; i < source.data.length; i += 4)
    for (let c = 0; c < 3; c++) source.data[i + c] = 255 - source.data[i + c];
  assert.equal(decodeSheetQr(source).sheetId, sheet.id);
});

test("a rotated phone frame retains all four solid corner squares", async () => {
  const source = await printedSheet();
  const page = createCanvas(source.width, source.height), pageCtx = page.getContext("2d");
  const pixels = pageCtx.createImageData(source.width, source.height); pixels.data.set(source.data); pageCtx.putImageData(pixels, 0, 0);
  const frame = createCanvas(2000, 2100), ctx = frame.getContext("2d");
  ctx.fillStyle = "#dddddd"; ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.translate(1000, 1050); ctx.rotate(25 * Math.PI / 180);
  ctx.drawImage(page, -source.width / 2, -source.height / 2);
  const result = normalizeScanPhoto({ width: frame.width, height: frame.height, data: ctx.getImageData(0, 0, frame.width, frame.height).data });
  checkRows(result.image);
});

test('teacher corner hints recover the original photo without changing sheet identity or answers', async () => {
  const source = await phonePhoto(await printedSheet());
  const photoMap = homography([{x:0,y:0},{x:1000,y:0},{x:1000,y:1414},{x:0,y:1414}], [{x:135,y:95},{x:1135,y:175},{x:1040,y:1685},{x:180,y:1760}]);
  const anchors = LAYOUT.markers.map(marker => { const p = transform(photoMap, marker); return { x: (p.x + 9) / source.width, y: (p.y - 8) / source.height }; });
  const result = normalizeScanPhoto(source, anchors);
  assert.equal(result.sheetId, sheet.id); checkRows(result.image);
  const rows = detectedAnswers({ ...result, hash: "photo-hash", manuallyAligned: true }, sheet);
  assert.ok(Object.values(rows).every(row => row.state === "uncertain" && row.choice === null));
});
test('corner adjustment accepts arbitrary order but rejects invalid hints and incomplete pages', async () => {
  const source = await printedSheet();
  const anchors = LAYOUT.markers.map(p => ({x:p.x/source.width,y:p.y/source.height}));
  assert.throws(() => normalizeScanPhoto(source, anchors.slice(0,3)), /four corner/);
  assert.throws(() => normalizeScanPhoto(source, [{x:NaN,y:0},...anchors.slice(1)]), /four corner/);
  assert.equal(normalizeScanPhoto(source, [anchors[0], anchors[2], anchors[1], anchors[3]]).sheetId, sheet.id);
  for(let y=1310;y<source.height;y++)for(let x=0;x<source.width;x++) { const i=(y*source.width+x)*4; source.data[i]=source.data[i+1]=source.data[i+2]=255; }
  assert.throws(() => normalizeScanPhoto(source, anchors), /corner/);
});

test('additional square-shaped marks near page corners cannot substitute for the real calibration frame', async () => {
  const source = await printedSheet();
  for (const marker of LAYOUT.markers) {
    const centre = {x:marker.x<500?marker.x+60:marker.x-60,y:marker.y<700?marker.y-20:marker.y-60};
    for(let y=centre.y-12;y<=centre.y+12;y++)for(let x=centre.x-12;x<=centre.x+12;x++){const i=(y*source.width+x)*4;source.data[i]=source.data[i+1]=source.data[i+2]=0;}
  }
  checkRows(normalizeScanPhoto(source).image);
});
