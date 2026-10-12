import { normalizeScanPhoto } from "./recognition";
import type { Raster } from "./omr";
self.onmessage = (event: MessageEvent<Raster>) => {
  try {
    const result = normalizeScanPhoto(event.data);
    self.postMessage(result, { transfer: [result.image.data.buffer as ArrayBuffer] });
  } catch (cause) {
    self.postMessage({ error: cause instanceof Error ? cause.message : "Could not read this photo. Try again." });
  }
};
