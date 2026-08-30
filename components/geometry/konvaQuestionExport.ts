import type Konva from 'konva';
import { GEOMETRY_QUESTION_PADDING, type GeometryQuestionAssetDraft, type GeometryQuestionPaddingPreset } from './questionAssetExport';

const THEME_COLORS = new Set([
  '#06b6d4',
  '#22d3ee',
  '#00ffff',
  '#e2e8f0',
  '#f8fafc',
  '#f472b6',
]);

const normalizeColor = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  return THEME_COLORS.has(normalized) ? '#0f172a' : value;
};

const slugify = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60) || 'geometry-diagram';

const canvasToBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Unable to create geometry PNG.')), 'image/png');
});

const escapeXmlAttribute = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/**
 * Export the exact Konva composition the teacher sees instead of reconstructing
 * the scene with separate SVG text metrics. The whole scene is cropped and
 * translated once, preserving every node's relative position, scale and rotation.
 */
export const createKonvaQuestionAssetDraft = async (
  title: string,
  stage: Konva.Stage,
  paddingPreset: GeometryQuestionPaddingPreset,
): Promise<GeometryQuestionAssetDraft> => {
  const layers = stage.getLayers();
  const sourceLayer = layers[1] || layers[0];
  if (!sourceLayer) throw new Error('Geometry canvas is unavailable.');

  const layer = sourceLayer.clone({ listening: false });

  // Top-level editor helpers (Transformer and selection rectangle) have no
  // shapeId. Real teacher-authored shapes and blank groups always do.
  layer.getChildren().slice().forEach((node) => {
    if (!node.getAttr('shapeId')) node.destroy();
  });

  // Keep the teacher's exact Konva geometry/text layout. Only normalize the
  // neon editor palette to dark ink for the fixed white student canvas.
  layer.find(() => true).forEach((node: any) => {
    if (typeof node.stroke === 'function') {
      const stroke = node.stroke();
      const normalized = normalizeColor(stroke);
      if (normalized !== stroke) node.stroke(normalized);
    }
    if (typeof node.fill === 'function') {
      const fill = node.fill();
      const normalized = normalizeColor(fill);
      if (normalized !== fill) node.fill(normalized);
    }
  });

  const padding = GEOMETRY_QUESTION_PADDING[paddingPreset];
  const bounds = layer.getClientRect({ skipShadow: false, skipStroke: false });
  const contentWidth = Math.max(1, bounds.width);
  const contentHeight = Math.max(1, bounds.height);
  const width = Math.max(1, Math.ceil(contentWidth + padding * 2));
  const height = Math.max(1, Math.ceil(contentHeight + padding * 2));
  const pixelRatio = 2;

  const artworkCanvas = layer.toCanvas({
    x: bounds.x - padding,
    y: bounds.y - padding,
    width,
    height,
    pixelRatio,
  });

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = Math.ceil(width * pixelRatio);
  finalCanvas.height = Math.ceil(height * pixelRatio);
  const context = finalCanvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable for geometry export.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
  context.drawImage(artworkCanvas, 0, 0);

  const pngBlob = await canvasToBlob(finalCanvas);
  const resolvedTitle = title.trim() || 'Geometry diagram';
  const baseName = `${slugify(resolvedTitle)}-geometry`;
  const pngFile = new File([pngBlob], `${baseName}.png`, { type: 'image/png' });

  // Keep the existing SVG-primary upload contract while embedding the faithful
  // Konva raster. This prevents browser/font SVG re-layout from moving labels.
  const pngDataUrl = finalCanvas.toDataURL('image/png');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Geometry diagram"><rect width="100%" height="100%" fill="#ffffff"/><image href="${escapeXmlAttribute(pngDataUrl)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/></svg>`;
  const svgFile = new File([svg], `${baseName}.svg`, { type: 'image/svg+xml' });

  layer.destroy();

  return {
    svgFile,
    pngFile,
    title: resolvedTitle,
    width,
    height,
    padding,
    paddingPreset,
    background: 'white',
  };
};
