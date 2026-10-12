import {
  LAYOUT,
  bubblePreviewRegion,
  type ScanSheet,
  type DetectedRow,
} from "../src/lib/paperScan/layout";
import { readBubbles, bubbleRowOffset, type Raster } from "../src/lib/paperScan/omr";
export interface ProcessedPhoto {
  sheetId: string;
  image: Raster;
  hash: string;
}
export async function loadScanPhoto(
  file: File,
  signal?: AbortSignal,
): Promise<ProcessedPhoto> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 20 MB.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Use a JPG, PNG or WebP photo.");
  const bytes = await file.arrayBuffer();
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(
          new Error(
            "The photo could not be opened. Export it as JPG and try again.",
          ),
        );
      image.src = url;
    });
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (image.naturalWidth * image.naturalHeight > 80000000)
      throw new Error("This image is too large. Use a standard phone photo.");
    const scale = Math.min(
      1,
      2400 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    if (canvas.width < 600 || canvas.height < 600)
      throw new Error("This photo is too small. Take a closer, clearer photo.");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx)
      throw new Error("Photo processing is unavailable in this browser.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return await new Promise<ProcessedPhoto>((resolve, reject) => {
      const worker = new Worker(
        new URL("../src/lib/paperScan/scanner.worker.ts", import.meta.url),
        { type: "module" },
      );
      const abort = () => {
        worker.terminate();
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      const clean = () => {
        signal?.removeEventListener("abort", abort);
        worker.terminate();
        clearTimeout(timer);
      };
      const timer = setTimeout(() => {
        clean();
        reject(
          new Error(
            "This photo took too long to read. Retake a clearer photo.",
          ),
        );
      }, 20000);
      worker.onmessage = (
        e: MessageEvent<{ error?: string; sheetId: string; image: Raster }>,
      ) => {
        clean();
        if (e.data.error) reject(new Error(e.data.error));
        else resolve({ sheetId: e.data.sheetId, image: e.data.image, hash });
      };
      worker.onerror = () => {
        clean();
        reject(
          new Error("The scanner could not start. Refresh and try again."),
        );
      };
      worker.postMessage(
        { width: pixels.width, height: pixels.height, data: pixels.data },
        [pixels.data.buffer],
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function detectedAnswers(
  photo: ProcessedPhoto,
  sheet: ScanSheet,
): Record<string, DetectedRow> {
  if (sheet.layoutVersion !== LAYOUT.version)
    throw new Error("Unsupported sheet version. Print a current sheet.");
  return readBubbles(photo.image, sheet.questions);
}
export function rowPreviews(
  photo: ProcessedPhoto,
  sheet: ScanSheet,
): Record<string, string> {
  const canvas = document.createElement("canvas");
  canvas.width = 350;
  canvas.height = 38;
  const ctx = canvas.getContext("2d");
  if (!ctx) return {};
  const source = document.createElement("canvas");
  source.width = photo.image.width;
  source.height = photo.image.height;
  source
    .getContext("2d")
    ?.putImageData(
      new ImageData(
        new Uint8ClampedArray(photo.image.data),
        photo.image.width,
        photo.image.height,
      ),
      0,
      0,
    );
  return Object.fromEntries(
    sheet.questions.map((q, row) => {
      const region = bubblePreviewRegion(row, q.options.length);
      const offset = bubbleRowOffset(photo.image, row, q.options.length);
      region.x += offset.x;
      region.y += offset.y;
      canvas.width = region.width;
      canvas.height = region.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        source,
        region.x,
        region.y,
        region.width,
        region.height,
        0,
        0,
        region.width,
        region.height,
      );
      return [q.questionId, canvas.toDataURL("image/png")];
    }),
  );
}
