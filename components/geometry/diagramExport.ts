import type { BlankField } from './types';
import type { DiagramShape } from './KonvaCanvasEditor';

export type DiagramPaddingPreset = 'tight' | 'standard' | 'worksheet';

export interface DiagramQuestionAsset {
  svgFile: File;
  pngFile: File;
  width: number;
  height: number;
  padding: number;
  paddingPreset: DiagramPaddingPreset;
  title: string;
  subject: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface DiagramAssetOptions {
  shapes: DiagramShape[];
  blanks: BlankField[];
  title: string;
  subject: string;
  difficulty: 'easy' | 'medium' | 'hard';
  paddingPreset?: DiagramPaddingPreset;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const PADDING_BY_PRESET: Record<DiagramPaddingPreset, number> = {
  tight: 24,
  standard: 40,
  worksheet: 64,
};

const DEFAULT_INK = '#0f172a';
const EDITOR_LIGHT_COLORS = new Set([
  '#fff',
  '#ffffff',
  '#f8fafc',
  '#e2e8f0',
  '#00ffff',
  '#06b6d4',
  '#22d3ee',
  'cyan',
]);

const asNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asString = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback;

const asNumberArray = (value: unknown): number[] =>
  Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
    : [];

const asShapeArray = (value: unknown): DiagramShape[] =>
  Array.isArray(value) ? value.filter((item): item is DiagramShape => Boolean(item) && typeof item === 'object') : [];

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const exportInk = (value?: string, fallback = DEFAULT_INK) => {
  if (!value || value === 'transparent') return fallback;
  return EDITOR_LIGHT_COLORS.has(value.trim().toLowerCase()) ? fallback : value;
};

const expandBounds = (bounds: Bounds, amount: number): Bounds => ({
  minX: bounds.minX - amount,
  minY: bounds.minY - amount,
  maxX: bounds.maxX + amount,
  maxY: bounds.maxY + amount,
});

const mergeBounds = (current: Bounds | null, next: Bounds | null): Bounds | null => {
  if (!next) return current;
  if (!current) return next;
  return {
    minX: Math.min(current.minX, next.minX),
    minY: Math.min(current.minY, next.minY),
    maxX: Math.max(current.maxX, next.maxX),
    maxY: Math.max(current.maxY, next.maxY),
  };
};

const transformPoint = (
  pointX: number,
  pointY: number,
  x: number,
  y: number,
  scaleX: number,
  scaleY: number,
  rotation: number,
) => {
  const scaledX = pointX * scaleX;
  const scaledY = pointY * scaleY;
  const radians = rotation * Math.PI / 180;
  return {
    x: x + scaledX * Math.cos(radians) - scaledY * Math.sin(radians),
    y: y + scaledX * Math.sin(radians) + scaledY * Math.cos(radians),
  };
};

const transformedPointsBounds = (
  points: number[],
  x: number,
  y: number,
  scaleX: number,
  scaleY: number,
  rotation: number,
): Bounds | null => {
  if (points.length < 2) return null;
  const transformed: Array<{ x: number; y: number }> = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    transformed.push(transformPoint(points[index], points[index + 1], x, y, scaleX, scaleY, rotation));
  }
  return {
    minX: Math.min(...transformed.map((point) => point.x)),
    minY: Math.min(...transformed.map((point) => point.y)),
    maxX: Math.max(...transformed.map((point) => point.x)),
    maxY: Math.max(...transformed.map((point) => point.y)),
  };
};

const shapeBounds = (shape: DiagramShape, parentX = 0, parentY = 0): Bounds | null => {
  const shapeType = asString(shape.type);
  const x = parentX + asNumber(shape.x);
  const y = parentY + asNumber(shape.y);
  const scaleX = asNumber(shape.scaleX, 1) || 1;
  const scaleY = asNumber(shape.scaleY, 1) || 1;
  const rotation = asNumber(shape.rotation);
  const strokeWidth = Math.max(1, asNumber(shape.strokeWidth, 2));
  const strokePad = Math.max(3, strokeWidth / 2 + 2);

  if (shapeType === 'group') {
    let grouped: Bounds | null = null;
    for (const child of asShapeArray(shape['children'])) {
      grouped = mergeBounds(grouped, shapeBounds(child, x, y));
    }
    return grouped;
  }

  if (shapeType === 'line' || shapeType === 'arrow' || shapeType === 'angle') {
    let points = asNumberArray(shape.points);
    if (points.length < 4) {
      const endX = asNumber(shape.endX, asNumber(shape['x2'], asNumber(shape.x)));
      const endY = asNumber(shape.endY, asNumber(shape['y2'], asNumber(shape.y)));
      points = [0, 0, endX - asNumber(shape.x), endY - asNumber(shape.y)];
    }
    const bounds = transformedPointsBounds(points, x, y, scaleX, scaleY, rotation);
    return bounds ? expandBounds(bounds, shapeType === 'arrow' ? Math.max(strokePad, 12) : strokePad) : null;
  }

  if (shapeType === 'circle' || shapeType === 'point') {
    const radius = Math.max(1, asNumber(shape.radius, shapeType === 'point' ? 6 : 50));
    const halfWidth = radius * Math.abs(scaleX);
    const halfHeight = radius * Math.abs(scaleY);
    return expandBounds({
      minX: x - halfWidth,
      minY: y - halfHeight,
      maxX: x + halfWidth,
      maxY: y + halfHeight,
    }, strokePad);
  }

  if (shapeType === 'text') {
    const fontSize = Math.max(8, asNumber(shape.fontSize, 18));
    const text = asString(shape.text, 'Text');
    const width = Math.max(fontSize * 0.65, text.length * fontSize * 0.62);
    const height = fontSize * 1.35;
    const corners = [0, 0, width, 0, width, height, 0, height];
    const bounds = transformedPointsBounds(corners, x, y, scaleX, scaleY, rotation);
    return bounds ? expandBounds(bounds, 4) : null;
  }

  return expandBounds({ minX: x, minY: y, maxX: x + 1, maxY: y + 1 }, strokePad);
};

const blankBounds = (blank: BlankField): Bounds => {
  const scaleX = blank.scaleX || 1;
  const scaleY = blank.scaleY || 1;
  const points = [0, 0, blank.width, 0, blank.width, blank.height, 0, blank.height];
  const bounds = transformedPointsBounds(points, blank.x, blank.y, scaleX, scaleY, blank.rotation || 0);
  return expandBounds(bounds || { minX: blank.x, minY: blank.y, maxX: blank.x + blank.width, maxY: blank.y + blank.height }, 3);
};

const coordinatePairs = (points: number[]) => {
  const pairs: string[] = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    pairs.push(`${points[index]},${points[index + 1]}`);
  }
  return pairs.join(' ');
};

const shapeTransform = (shape: DiagramShape, parentX = 0, parentY = 0) => {
  const x = parentX + asNumber(shape.x);
  const y = parentY + asNumber(shape.y);
  const rotation = asNumber(shape.rotation);
  const scaleX = asNumber(shape.scaleX, 1) || 1;
  const scaleY = asNumber(shape.scaleY, 1) || 1;
  return `translate(${x} ${y}) rotate(${rotation}) scale(${scaleX} ${scaleY})`;
};

const renderArrowHead = (points: number[], stroke: string, strokeWidth: number) => {
  if (points.length < 4) return '';
  const endX = points[points.length - 2];
  const endY = points[points.length - 1];
  const prevX = points[points.length - 4];
  const prevY = points[points.length - 3];
  const angle = Math.atan2(endY - prevY, endX - prevX);
  const size = Math.max(10, strokeWidth * 4);
  const spread = Math.PI / 7;
  const leftX = endX - size * Math.cos(angle - spread);
  const leftY = endY - size * Math.sin(angle - spread);
  const rightX = endX - size * Math.cos(angle + spread);
  const rightY = endY - size * Math.sin(angle + spread);
  return `<path d="M ${leftX} ${leftY} L ${endX} ${endY} L ${rightX} ${rightY}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
};

const arcPath = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
  const startRadians = startAngle * Math.PI / 180;
  const endRadians = endAngle * Math.PI / 180;
  const startX = x + radius * Math.cos(startRadians);
  const startY = y + radius * Math.sin(startRadians);
  const endX = x + radius * Math.cos(endRadians);
  const endY = y + radius * Math.sin(endRadians);
  let sweep = ((endAngle - startAngle) % 360 + 360) % 360;
  if (sweep === 0 && endAngle !== startAngle) sweep = 360;
  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${sweep > 180 ? 1 : 0} 1 ${endX} ${endY}`;
};

const renderShape = (shape: DiagramShape, parentX = 0, parentY = 0): string => {
  const shapeType = asString(shape.type);
  const stroke = exportInk(asString(shape.stroke) || undefined);
  const fill = exportInk(asString(shape.fill) || undefined, stroke);
  const strokeWidth = Math.max(1, asNumber(shape.strokeWidth, 2));
  const dashValues = asNumberArray(shape['dash']);
  const dash = dashValues.length ? ` stroke-dasharray="${dashValues.join(' ')}"` : '';

  if (shapeType === 'group') {
    const children = asShapeArray(shape['children']);
    return `<g transform="${shapeTransform(shape, parentX, parentY)}">${children.map((child) => renderShape(child)).join('')}</g>`;
  }

  let points = asNumberArray(shape.points);
  if ((shapeType === 'line' || shapeType === 'arrow' || shapeType === 'angle') && points.length < 4) {
    const endX = asNumber(shape.endX, asNumber(shape['x2'], asNumber(shape.x)));
    const endY = asNumber(shape.endY, asNumber(shape['y2'], asNumber(shape.y)));
    points = [0, 0, endX - asNumber(shape.x), endY - asNumber(shape.y)];
  }

  let body = '';
  if (shapeType === 'line' || shapeType === 'arrow') {
    body = `<polyline points="${coordinatePairs(points)}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
    if (shapeType === 'arrow') body += renderArrowHead(points, stroke, strokeWidth);
  } else if (shapeType === 'angle') {
    const anglePoints = points.length >= 6 ? points : [0, 0, 80, 0, 0, -80];
    const p0 = { x: anglePoints[0], y: anglePoints[1] };
    const p1 = { x: anglePoints[2], y: anglePoints[3] };
    const p2 = { x: anglePoints[4], y: anglePoints[5] };
    const angle1 = Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180 / Math.PI;
    const angle2 = Math.atan2(p2.y - p0.y, p2.x - p0.x) * 180 / Math.PI;
    let startAngle = Math.min(angle1, angle2);
    let endAngle = Math.max(angle1, angle2);
    if (endAngle - startAngle > 180) {
      const originalStart = startAngle;
      startAngle = endAngle;
      endAngle = originalStart + 360;
    }
    const length1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const length2 = Math.hypot(p2.x - p0.x, p2.y - p0.y);
    const radius = Math.max(8, Math.min(length1, length2, 35) * 0.5);
    body = [
      `<path d="M ${p0.x} ${p0.y} L ${p1.x} ${p1.y} M ${p0.x} ${p0.y} L ${p2.x} ${p2.y}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`,
      `<path d="${arcPath(p0.x, p0.y, radius, startAngle, endAngle)}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${Math.max(1.5, strokeWidth * 0.75)}"/>`,
    ].join('');
  } else if (shapeType === 'circle') {
    body = `<circle cx="0" cy="0" r="${Math.max(1, asNumber(shape.radius, 50))}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}"${dash}/>`;
  } else if (shapeType === 'point') {
    const radius = Math.max(2, asNumber(shape.radius, 6));
    body = `<circle cx="0" cy="0" r="${radius}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}"/>`;
  } else if (shapeType === 'text') {
    const fontSize = Math.max(8, asNumber(shape.fontSize, 18));
    const fontFamily = asString(shape['fontFamily'], 'Arial, sans-serif');
    body = `<text x="0" y="0" dominant-baseline="hanging" font-family="${escapeXml(fontFamily)}" font-size="${fontSize}" font-weight="600" fill="${escapeXml(exportInk(asString(shape.fill) || undefined))}">${escapeXml(asString(shape.text, 'Text'))}</text>`;
  }

  return body ? `<g transform="${shapeTransform(shape, parentX, parentY)}">${body}</g>` : '';
};

const renderBlank = (blank: BlankField) => {
  const rotation = blank.rotation || 0;
  const scaleX = blank.scaleX || 1;
  const scaleY = blank.scaleY || 1;
  const fontSize = Math.min(16, blank.height * 0.6);
  const transform = `translate(${blank.x} ${blank.y}) rotate(${rotation}) scale(${scaleX} ${scaleY})`;
  return `<g transform="${transform}"><rect width="${blank.width}" height="${blank.height}" rx="4" fill="none" stroke="${DEFAULT_INK}" stroke-width="2" stroke-dasharray="6 4"/><text x="${blank.width / 2}" y="${blank.height / 2}" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="${DEFAULT_INK}">?</text></g>`;
};

const safeFileBase = (title: string) => {
  const cleaned = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned || 'geometry-diagram';
};

const svgToPngFile = async (svgText: string, fileName: string, width: number, height: number): Promise<File> => {
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('Unable to render the SVG PNG fallback.'));
      nextImage.src = objectUrl;
    });

    const maxDimension = Math.max(width, height);
    const pixelRatio = Math.max(1, Math.min(4, 4096 / Math.max(1, maxDimension)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width * pixelRatio));
    canvas.height = Math.max(1, Math.ceil(height * pixelRatio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PNG fallback canvas is unavailable.');

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Unable to create the PNG fallback.'));
      }, 'image/png');
    });

    return new File([pngBlob], fileName, { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export const downloadDiagramFile = (file: File) => {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const buildDiagramQuestionAsset = async ({
  shapes,
  blanks,
  title,
  subject,
  difficulty,
  paddingPreset = 'standard',
}: DiagramAssetOptions): Promise<DiagramQuestionAsset> => {
  let contentBounds: Bounds | null = null;
  for (const shape of shapes) {
    contentBounds = mergeBounds(contentBounds, shapeBounds(shape));
  }
  for (const blank of blanks) {
    contentBounds = mergeBounds(contentBounds, blankBounds(blank));
  }

  if (contentBounds === null) {
    throw new Error('Add at least one visible diagram element before exporting.');
  }

  const bounds = contentBounds as Bounds;
  const padding = PADDING_BY_PRESET[paddingPreset];
  const rawWidth = Math.max(1, bounds.maxX - bounds.minX);
  const rawHeight = Math.max(1, bounds.maxY - bounds.minY);
  const naturalWidth = rawWidth + padding * 2;
  const naturalHeight = rawHeight + padding * 2;
  const width = Math.max(120, Math.ceil(naturalWidth));
  const height = Math.max(80, Math.ceil(naturalHeight));
  const translateX = padding - bounds.minX + Math.max(0, (120 - naturalWidth) / 2);
  const translateY = padding - bounds.minY + Math.max(0, (80 - naturalHeight) / 2);
  const body = [
    ...shapes.map((shape) => renderShape(shape)),
    ...blanks.map((blank) => renderBlank(blank)),
  ].join('');

  const svgText = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title || 'Geometry diagram')}">`,
    `<g transform="translate(${translateX} ${translateY})">${body}</g>`,
    '</svg>',
  ].join('');

  const fileBase = safeFileBase(title);
  const svgFile = new File([svgText], `${fileBase}.svg`, { type: 'image/svg+xml' });
  const pngFile = await svgToPngFile(svgText, `${fileBase}.png`, width, height);

  return {
    svgFile,
    pngFile,
    width,
    height,
    padding,
    paddingPreset,
    title,
    subject,
    difficulty,
  };
};
