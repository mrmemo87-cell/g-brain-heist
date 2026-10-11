import jsQR from "jsqr";
import { LAYOUT, parseSheetToken } from "./layout";
import { homography, markerCentres, warp, type Raster } from "./omr";
self.onmessage = (event: MessageEvent<Raster>) => {
  try {
    const image = event.data;
    const qr = jsQR(image.data, image.width, image.height, {
      inversionAttempts: "dontInvert",
    });
    if (!qr)
      throw new Error("QR code not clear. Include the whole sheet and retake.");
    const sheetId = parseSheetToken(qr.data);
    const modules = 17 + qr.version * 4;
    const unit = LAYOUT.qr.size / (modules + 8);
    const left = LAYOUT.qr.x + 4 * unit,
      top = LAYOUT.qr.y + 4 * unit,
      size = modules * unit;
    const canonical = [
      { x: left, y: top },
      { x: left + size, y: top },
      { x: left + size, y: top + size },
      { x: left, y: top + size },
    ];
    const photographed = [
      qr.location.topLeftCorner,
      qr.location.topRightCorner,
      // Use an affine coarse estimate: a sub-pixel QR corner error must not
      // become a large projective error at the far end of a full A4 sheet.
      {
        x:
          qr.location.topRightCorner.x +
          qr.location.bottomLeftCorner.x -
          qr.location.topLeftCorner.x,
        y:
          qr.location.topRightCorner.y +
          qr.location.bottomLeftCorner.y -
          qr.location.topLeftCorner.y,
      },
      qr.location.bottomLeftCorner,
    ];
    let normalized = warp(image, homography(canonical, photographed));
    const centres = markerCentres(normalized);
    normalized = warp(normalized, homography(LAYOUT.markers, centres));
    markerCentres(normalized, 28);
    self.postMessage(
      { sheetId, image: normalized },
      { transfer: [normalized.data.buffer as ArrayBuffer] },
    );
  } catch (cause) {
    self.postMessage({
      error:
        cause instanceof Error
          ? cause.message
          : "Could not read this photo. Try again.",
    });
  }
};
