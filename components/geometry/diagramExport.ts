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

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const exportInk = (value?: string, fallback = DEFAULT_INK) => {
  if (!value) return fallback;
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

const pointsBounds = (points: number[], offsetX = 0, offsetY = 0): Bounds | null => {
  if (points.length < 2) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    xs.push(points[index] + offsetX);
    ys.push(points[index + 1] + offsetY);
  }
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
};

const rotatePoint = (x: number, y: number, rotation: number) => {
  const radians = rotation * Math.PI / 180;
  return {
    x: x * Math.cos(radians) - y * Math.sin(radians),
    y: x * Math.sin(radians) + y * Math.cos(radians),
  };
};

const rotatedRectBounds = (
  x: number,
  y: number,
  width: number,
  height: number,
  rotation = 0,
): Bounds => {
  const corners = [
    rotatePoint(0, 0, rotation),
    rotatePoint(width, 0, rotation),
    rotatePoint(width, height, rotation),
    rotatePoint(0, height, rotation),
  ];
  const xs = corners.map((point) => point.x + x);
  const ys = corners.map((point) => point.y + y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
};

const shapeBounds = (shape: DiagramShape, offsetX = 0, offsetY = 0): Bounds | null => {
  const strokePad = Math.max(3, (shape.strokeWidth || 2) / 2 + 2);
  const x = (shape.x || 0) + offsetX;
  const y = (shape.y || 0) + offsetY;

  if (shape.type === 'group' && Array.isArray(shape.children)) {
    return shape.children.reduce<Bounds | null>(
      (bounds, child) => mergeBounds(bounds, shapeBounds(child, x, y)),
      null,
    );
  }

  if (shape.type === 'line' || shape.type === 'arrow' || shape.type === 'angle') {
    const points = shape.points?.length
      ? shape.points
      : [0, 0, (shape.x2 || shape.x || 0) - (shape.x || 0), (shape.y2 || shape.y || 0) - (shape.y || 0)];
    const bounds = pointsBounds(points, x, y);
    return bounds ? expandBounds(bounds, shape.type === 'arrow' ? Math.max(strokePad, 12) : strokePad) : null;
  }

  if (shape.type === 'circle' || shape.type === 'point' || shape.type === 'arc') {
    const radius = Math.max(1, shape.radius || (shape.type === 'point' ? 6 : 50));
    return expandBounds({
      minX: x - radius,
      minY: y - radius,
      maxX: x + radius,
      maxY: y + radius,
    }, strokePad);
  }

  if (shape.type === 'text') {
    const fontSize = Math.max(8, shape.fontSize || 18);
    const text = shape.text || 'Text';
    const width = Math.max(fontSize * 0.65, text.length * fontSize * 0.62);
    const height = fontSize * 1.35;
    return expandBounds(rotatedRectBounds(x, y, width, height, shape.rotation || 0), 3);
  }

  return expandBounds({ minX: x, minY: y, maxX: x + 1, maxY: y + 1 }, strokePad);
};

const blankBounds = (blank: BlankField): Bounds => expandBounds(
  rotatedRectBounds(blank.x, blank.y, blank.width, blank.height, blank.rotation || 0),
  3,
);

const coordinatePairs = (points: number[], offsetX = 0, offsetY = 0) => {
  const pairs: string[] = [];
  for (let index = 0; index + 1 < points.length; index += 2) {
    pairs.push(`${points[index] + offsetX},${points[index + 1] + offsetY}`);
  }
  return pairs.join(' ');
};

const renderArrowHead = (points: number[], stroke: string, strokeWidth: number, offsetX = 0, offsetY = 0) => {
  if (points.length < 4) return '';
  const endX = points[points.length - 2] + offsetX;
  const endY = points[points.length - 1] + offsetY;
  const prevX = points[points.length - 4] + offsetX;
  const prevY = points[points.length - 3] + offsetY;
  const angle = Math.atan2(endY - prevY, endX - prevX);
  const size = Math.max(10, strokeWidth * 4);
  const spread = Math.PI / 7;
  const leftX = endX - size * Math.cos(angle - spread);
  const leftY = endY - size * Math.sin(angle - spread);
  const rightX = endX - size * Math.cos(angle + spread);
  const rightY = endY - size * Math.sin(angle + spread);
  return `<path d="M ${leftX} ${leftY} L ${endX} ${endY} L ${rightX} ${rightY}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
};

const arcPath = (
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) => {
  const startRadians = startAngle * Math.PI / 180;
  const endRadians = endAngle * Math.PI / 180;
  const startX = x + radius * Math.cos(startRadians);
  const startY = y + radius * Math.sin(startRadians);
  const endX = x + radius * Math.cos(endRadians);
  const endY = y + radius * Math.sin(endRadians);
  let sweep = ((endAngle - startAngle) % 360 + 360) % 360;
  if (sweep === 0 && endAngle !== startAngle) sweep = 360;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`;
};

const renderShape = (shape: DiagramShape, offsetX = 0, offsetY = 0): string => {
  const x = (shape.x || 0) + offsetX;
  const y = (shape.y || 0) + offsetY;
  const stroke = exportInk(shape.stroke);
  const fill = exportInk(shape.fill, stroke);
  const strokeWidth = shape.strokeWidth || 2;
  const dash = shape.dash?.length ? ` stroke-dasharray="${shape.dash.join(' ')}"` : '';

  if (shape.type === 'group' && Array.isArray(shape.children)) {
    return shape.children.map((child) => renderShape(child, x, y)).join('');
  }

  if (shape.type === 'line' || shape.type === 'arrow') {
    const points = shape.points?.length
      ? shape.points
      : [0, 0, (shape.x2 || shape.x || 0) - (shape.x || 0), (shape.y2 || shape.y || 0) - (shape.y || 0)];
    const polyline = `<polyline points="${coordinatePairs(points, x, y)}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
    return shape.type === 'arrow'
      ? `${polyline}${renderArrowHead(points, stroke, strokeWidth, x, y)}`
      : polyline;
  }

  if (shape.type === 'angle') {
    const points = shape.points || [0, 0, 80, 0, 0, -80];
    if (points.length < 6) {
      return `<polyline points="${coordinatePairs(points, x, y)}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`;
    }

    const p0 = { x: points[0] + x, y: points[1] + y };
    const p1 = { x: points[2] + x, y: points[3] + y };
    const p2 = { x: points[4] + x, y: points[5] + y };
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
    return [
      `<path d="M ${p0.x} ${p0.y} L ${p1.x} ${p1.y} M ${p0.x} ${p0.y} L ${p2.x} ${p2.y}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`,
      `<path d="${arcPath(p0.x, p0.y, radius, startAngle, endAngle)}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${Math.max(1.5, strokeWidth * 0.75)}"/>`,
    ].join('');
  }

  if (shape.type === 'circle') {
    return `<circle cx="${x}" cy="${y}" r="${Math.max(1, shape.radius || 50)}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}"${dash}/>`;
  }

  if (shape.type === 'point') {
    const radius = Math.max(2, shape.radius || 6);
    return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${Math.max(1, strokeWidth)}"/>`;
  }

  if (shape.type === 'arc') {
    const radius = Math.max(1, shape.radius || 50);
    const startAngle = (shape.startAngle || 0) + (shape.rotation || 0);
    const endAngle = (shape.endAngle ?? 180) + (shape.rotation || 0);
    return `<path d="${arcPath(x, y, radius, startAngle, endAngle)}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}"${dash}/>`;
  }

  if (shape.type === 'text') {
    const fontSize = Math.max(8, shape.fontSize || 18);
    const fontFamily = shape.fontFamily || 'Arial, sans-serif';
    const transform = shape.rotation ? ` transform="rotate(${shape.rotation} ${x} ${y})"` : '';
    return `<text x="${x}" y="${y}" dominant-baseline="hanging" font-family="${escapeXml(fontFamily)}" font-size="${fontSize}" font-weight="600" fill="${escapeXml(exportInk(shape.fill))}"${transform}>${escapeXml(shape.text || 'Text')}</text>`;
  }

  return '';
};

const renderBlank = (blank: BlankField) => {
  const rotation = blank.rotation || 0;
  const transform = `translate(${blank.x} ${blank.y})${rotation ? ` rotate(${rotation})` : ''}`;
  const fontSize = Math.min(16, blank.height * 0.6);
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
  shapes.forEach((shape) => {
    contentBounds = mergeBounds(contentBounds, shapeBounds(shape));
  });
  blanks.forEach((blank) => {
    contentBounds = mergeBounds(contentBounds, blankBounds(blank));
  });

  if (!contentBounds) {
    throw new Error('Add at least one visible diagram element before exporting.');
  }

  const padding = PADDING_BY_PRESET[paddingPreset];
  const rawWidth = contentBounds.maxX - contentBounds.minX;
  const rawHeight = contentBounds.maxY - contentBounds.minY;
  const width = Math.max(120, Math.ceil(rawWidth + padding * 2));
  const height = Math.max(80, Math.ceil(rawHeight + padding * 2));
  const translateX = padding - contentBounds.minX + Math.max(0, (120 - (rawWidth + padding * 2)) / 2);
  const translateY = padding - contentBounds.minY + Math.max(0, (80 - (rawHeight + padding * 2)) / 2);
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
