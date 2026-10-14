import { normalizeScanPhoto, decodeSheetQr } from "./recognition";
import type { Raster, Point } from "./omr";
self.onmessage = (event: MessageEvent<Raster & { anchors?: Point[] }>) => {
  try {
    const result = normalizeScanPhoto(event.data, event.data.anchors);
    self.postMessage(result, { transfer: [result.image.data.buffer as ArrayBuffer] });
  } catch (cause) {
    let sheetId: string | undefined;
    try { sheetId = decodeSheetQr(event.data).sheetId; } catch {}
    self.postMessage({ sheetId, error: cause instanceof Error ? cause.message : "Could not read this photo. Try again." });
  }
};
