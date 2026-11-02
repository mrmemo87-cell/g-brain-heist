import type { ConquestResult } from '../src/lib/classConquest';
import { mapById } from '../src/lib/classConquest';
import type { CertificateTheme, PrintSides } from '../src/lib/conquestCertificates';
import type { CertificateImage, CertificatePdf } from '../src/lib/conquestCertificatePdf';

/**
 * Browser side of the certificate PDF: loads fonts and logos, draws the flag from the
 * device's emoji font, builds the PDF, and hands it to the device (share sheet on phones,
 * PDF viewer on computers). pdf-lib is loaded only when a teacher asks for certificates.
 */

const FONT_BASE = '/fonts/certificates/';
const fontCache = new Map<string, Promise<Uint8Array>>();
const fetchBytes = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
  return { bytes: new Uint8Array(await response.arrayBuffer()), type: response.headers.get('content-type') || '' };
};
const font = (file: string) => {
  if (!fontCache.has(file)) fontCache.set(file, fetchBytes(FONT_BASE + file).then((r) => r.bytes).catch((error) => { fontCache.delete(file); throw error; }));
  return fontCache.get(file)!;
};

const canvasToPng = (canvas: HTMLCanvasElement) => new Promise<Uint8Array>((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob) { reject(new Error('Image could not be prepared.')); return; }
    void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
  }, 'image/png');
});

/** PNG and JPEG are embedded as they are; anything else (SVG, WebP, GIF) is redrawn as PNG. */
async function loadImage(url: string | null | undefined): Promise<CertificateImage | null> {
  if (!url) return null;
  try {
    const { bytes, type } = await fetchBytes(url, { credentials: 'omit' });
    const isPng = type.includes('png') || (bytes[0] === 0x89 && bytes[1] === 0x50);
    const isJpg = type.includes('jpeg') || type.includes('jpg') || (bytes[0] === 0xff && bytes[1] === 0xd8);
    if (isPng) return { bytes, kind: 'png' };
    if (isJpg) return { bytes, kind: 'jpg' };
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: type || 'image/svg+xml' }));
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = blobUrl;
      await img.decode();
      const scale = 512 / Math.max(img.naturalWidth || 512, img.naturalHeight || 512);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round((img.naturalWidth || 512) * scale));
      canvas.height = Math.max(1, Math.round((img.naturalHeight || 512) * scale));
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      return { bytes: await canvasToPng(canvas), kind: 'png' };
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } catch {
    return null; // a missing logo must never block certificates; the monogram is drawn instead
  }
}

/** The map's flag emoji, drawn by the device's own emoji font onto a canvas. */
async function flagImage(mapId: string): Promise<CertificateImage | null> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240; canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.font = '150px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(mapById(mapId).flag, 120, 98);
    // Some systems have no colour flags (Windows shows letters): only keep a colourful result.
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let colourful = 0;
    for (let i = 0; i < pixels.length; i += 16) {
      const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
      if (a > 200 && Math.max(r, g, b) - Math.min(r, g, b) > 60) colourful++;
    }
    if (colourful < 200) return null;
    return { bytes: await canvasToPng(canvas), kind: 'png' };
  } catch {
    return null;
  }
}

export interface PreparedCertificates extends CertificatePdf { file: File; url: string }

export async function prepareCertificatePdf(input: {
  result: ConquestResult; issuer?: string; schoolLogoUrl?: string | null; theme: CertificateTheme; printSides: PrintSides; only?: number | null;
}): Promise<PreparedCertificates> {
  const [{ buildCertificatePdf, certificatePdfFileName }, serif, sans, sansBold, schoolLogo, brandLogo, flag] = await Promise.all([
    import('../src/lib/conquestCertificatePdf'),
    font('PlayfairDisplay_700Bold.ttf'), font('IBMPlexSans_400Regular.ttf'), font('IBMPlexSans_700Bold.ttf'),
    loadImage(input.schoolLogoUrl), loadImage('/logo.png'), flagImage(input.result.map_id),
  ]);
  const pdf = await buildCertificatePdf({
    result: input.result, issuer: input.issuer, theme: input.theme, printSides: input.printSides, only: input.only ?? null,
    assets: { serif, sans, sansBold, schoolLogo, brandLogo, flag },
  });
  const file = new File([pdf.bytes], certificatePdfFileName(input.result, input.only ?? null), { type: 'application/pdf' });
  return { ...pdf, file, url: URL.createObjectURL(file) };
}

const isTouchDevice = () => typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || /iPhone|iPad|Android/i.test(navigator.userAgent));

/**
 * Hand the PDF to the device. Must run inside a tap (share sheets and new tabs need one).
 * Phones: the share sheet (Print, Save to Files, AirDrop, Mail). Computers: the PDF viewer.
 * Returns how it was delivered, or 'download' when only a download link is possible.
 */
export async function deliverCertificatePdf(prepared: PreparedCertificates): Promise<'shared' | 'opened' | 'download' | 'cancelled'> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (isTouchDevice() && nav.canShare?.({ files: [prepared.file] })) {
    try {
      await nav.share({ files: [prepared.file], title: prepared.file.name });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // fall through to opening the PDF
    }
  }
  const win = window.open(prepared.url, '_blank');
  return win ? 'opened' : 'download';
}
