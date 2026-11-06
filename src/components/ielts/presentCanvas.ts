/**
 * Shows a three.js frame through an ordinary 2D canvas. Some Android WebViews draw a WebGL canvas for a
 * split second and then stop showing it (owner report 2026-11-05: "I saw Blaze and in a millisecond it
 * disappeared"), while 2D canvases always appear. The WebGL canvas stays off the page and each finished
 * frame is copied across, which costs very little at these sizes.
 */
export interface Presenter {
  element: HTMLCanvasElement;
  present: () => void;
  /** True when the shown frame has visible pixels around (x, y), given as fractions of the canvas. */
  hasPixelsAt: (x: number, y: number) => boolean;
  remove: () => void;
}

export function createPresenter(host: HTMLElement, source: HTMLCanvasElement): Presenter | null {
  const out = document.createElement('canvas');
  const ctx = out.getContext('2d', { willReadFrequently: false });
  if (!ctx) return null;
  // !important: some browser extensions hide canvases with injected styles (owner's laptop, 2026-11-07).
  out.style.setProperty('display', 'block', 'important');
  out.style.setProperty('visibility', 'visible', 'important');
  out.style.setProperty('opacity', '1', 'important');
  out.style.width = '100%';
  out.style.height = '100%';
  host.appendChild(out);
  return {
    element: out,
    present: () => {
      if (out.width !== source.width || out.height !== source.height) {
        out.width = source.width;
        out.height = source.height;
      }
      ctx.clearRect(0, 0, out.width, out.height);
      ctx.drawImage(source, 0, 0);
    },
    hasPixelsAt: (x, y) => {
      // Drawn pixels only count if the canvas is actually laid out on screen.
      if (!out.isConnected || out.getClientRects().length === 0 || out.offsetWidth === 0) return false;
      try {
        const px = Math.max(0, Math.floor(out.width * x) - 3);
        const py = Math.max(0, Math.floor(out.height * y) - 3);
        const data = ctx.getImageData(px, py, 6, 6).data;
        for (let i = 3; i < data.length; i += 4) if (data[i]! > 40) return true;
      } catch { /* ignore */ }
      return false;
    },
    remove: () => out.remove(),
  };
}
