/** Crop exactly the same portrait A4 frame shown by object-fit: cover. */
export function a4CaptureFrame(width: number, height: number) {
  if (!(width > 0 && height > 0)) throw new Error("Camera is not ready.");
  const ratio = 210 / 297;
  const cropWidth = Math.min(width, height * ratio);
  const cropHeight = Math.min(height, width / ratio);
  const scale = Math.min(1, 2600 / Math.max(cropWidth, cropHeight));
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2,
    width: cropWidth, height: cropHeight,
    outputWidth: Math.round(cropWidth * scale), outputHeight: Math.round(cropHeight * scale) };
}
