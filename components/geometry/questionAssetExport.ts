import type { BlankField } from './types';
import type { DiagramShape } from './KonvaCanvasEditor';

export type GeometryQuestionPaddingPreset = 'tight' | 'standard' | 'worksheet';
export type GeometryQuestionBackground = 'transparent' | 'white';

export interface GeometryQuestionExportOptions {
  paddingPreset: GeometryQuestionPaddingPreset;
  background: GeometryQuestionBackground;
}

export interface GeometryQuestionAssetDraft {
  svgFile: File;
  pngFile: File;
  title: string;
  width: number;
  height: number;
  padding: number;
  paddingPreset: GeometryQuestionPaddingPreset;
  background: GeometryQuestionBackground;
}

export const GEOMETRY_QUESTION_PADDING: Record<GeometryQuestionPaddingPreset, number> = {
  tight: 24,
  standard: 40,
  worksheet: 64,
};

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type Point = { x: number; y: number };

const EMPTY_BOUNDS: Bounds = {
  minX: Number.POSITIVE_INFINITY,
  minY: Number.POSITIVE_INFINITY,
  maxX: Number.NEGATIVE_INFINITY,
  maxY: Number.NEGATIVE_INFINITY,
};

const PRINT_SAFE_COLORS = new Set([
  '#06b6d4',
  '#22d3ee',
  '#00ffff',
  '#e2e8f0',
  '#f8fafc',
]);

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const safeNumber = (value: unknown, fallback = 0) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeExportColor = (value: unknown, fallback = '#0f172a') => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'transparent' || normalized === 'none') return 'none';
  return PRINT_SAFE_COLORS.has(normalized) ? '#0f172a' : value.trim();
};

const expandBounds = (bounds: Bounds, point: Point, margin = 0) => {
  bounds.minX = Math.min(bounds.minX, point.x - margin);
  bounds.minY = Math.min(bounds.minY, point.y - margin);
  bounds.maxX = Math.max(bounds.maxX, point.x + margin);
  bounds.maxY = Math.max(bounds.maxY, point.y + margin);
};

const rotatePoint = (point: Point, origin: Point, degrees: number): Point => {
  if (!degrees) return point;
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
};

const pointsFromFlatArray = (values: number[] | undefined): Point[] => {
  const points: Point[] = [];
  if (!values) return points;
  for (let index = 0; index + 1 < values.length; index += 2) {
    points.push({ x: safeNumber(values[index]), y: safeNumber(values[index + 1]) });
  }
  return points;
};

const textMetrics = (shape: DiagramShape) => {
  const text = shape.text || 'Text';
  const fontSize = Math.max(8, safeNumber(shape.fontSize, 18));
  const lines = text.split(/\r?\n/);
  const longestLine = lines.reduce((max, line) => Math.max(max, Array.from(line).length), 1);
  return {
    text,
    fontSize,
    width: Math.max(fontSize * 0.75, longestLine * fontSize * 0.62),
    height: Math.max(fontSize * 1.2, lines.length * fontSize * 1.25),
  };
};

const includeShapeBounds = (bounds: Bounds, shape: DiagramShape) => {
  const strokeMargin = Math.max(1, safeNumber(shape.strokeWidth, 2) / 2) + 2;

  if (shape.type === 'line' || shape.type === 'arrow' || shape.type === 'angle') {
    const points = pointsFromFlatArray(shape.points);
    const extra = shape.type === 'arrow' ? Math.max(strokeMargin, 8) : strokeMargin;
    points.forEach((point) => expandBounds(bounds, point, extra));
    return;
  }

  if (shape.type === 'circle' || shape.type === 'point') {
    const x = safeNumber(shape.x);
    const y = safeNumber(shape.y);
    const radius = Math.max(1, safeNumber(shape.radius, shape.type === 'circle' ? 50 : 6));
    expandBounds(bounds, { x: x - radius, y: y - radius }, strokeMargin);
    expandBounds(bounds, { x: x + radius, y: y + radius }, strokeMargin);
    return;
  }

  if (shape.type === 'text') {
    const x = safeNumber(shape.x);
    const y = safeNumber(shape.y);
    const metrics = textMetrics(shape);
    const rotation = safeNumber(shape.rotation);
    const origin = { x, y };
    const corners = [
      { x, y },
      { x: x + metrics.width, y },
      { x: x + metrics.width, y: y + metrics.height },
      { x, y: y + metrics.height },
    ].map((point) => rotatePoint(point, origin, rotation));
    corners.forEach((point) => expandBounds(bounds, point, 3));
  }
};

const includeBlankBounds = (bounds: Bounds, blank: BlankField) => {
  const scaleX = Math.abs(safeNumber(blank.scaleX, 1)) || 1;
  const scaleY = Math.abs(safeNumber(blank.scaleY, 1)) || 1;
  const width = Math.max(1, safeNumber(blank.width, 80) * scaleX);
  const height = Math.max(1, safeNumber(blank.height, 40) * scaleY);
  const origin = { x: safeNumber(blank.x), y: safeNumber(blank.y) };
  const rotation = safeNumber(blank.rotation);
  const corners = [
    origin,
    { x: origin.x + width, y: origin.y },
    { x: origin.x + width, y: origin.y + height },
    { x: origin.x, y: origin.y + height },
  ].map((point) => rotatePoint(point, origin, rotation));
  corners.forEach((point) => expandBounds(bounds, point, 3));
};

const resolveContentBounds = (shapes: DiagramShape[], blanks: BlankField[]) => {
  const bounds = { ...EMPTY_BOUNDS };
  shapes.forEach((shape) => includeShapeBounds(bounds, shape));
  blanks.forEach((blank) => includeBlankBounds(bounds, blank));

  if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.minY) || !Number.isFinite(bounds.maxX) || !Number.isFinite(bounds.maxY)) {
    return { minX: 0, minY: 0, maxX: 240, maxY: 160 };
  }

  return bounds;
};

const renderPolyline = (shape: DiagramShape) => {
  const points = pointsFromFlatArray(shape.points);
  if (points.length < 2) return '';
  const pointList = points.map((point) => `${point.x},${point.y}`).join(' ');
  const stroke = normalizeExportColor(shape.stroke);
  const strokeWidth = Math.max(1, safeNumber(shape.strokeWidth, 2));
  return `<polyline points="${pointList}" fill="none" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
};

const renderArrow = (shape: DiagramShape) => {
  const points = pointsFromFlatArray(shape.points);
  if (points.length < 2) return '';
  const line = renderPolyline(shape);
  const tip = points[points.length - 1];
  const previous = points[points.length - 2];
  const angle = Math.atan2(tip.y - previous.y, tip.x - previous.x);
  const pointerLength = Math.max(6, safeNumber(shape.pointerLength, 10));
  const pointerWidth = Math.max(5, safeNumber(shape.pointerWidth, 8));
  const baseX = tip.x - Math.cos(angle) * pointerLength;
  const baseY = tip.y - Math.sin(angle) * pointerLength;
  const halfWidth = pointerWidth / 2;
  const normalX = -Math.sin(angle) * halfWidth;
  const normalY = Math.cos(angle) * halfWidth;
  const fill = normalizeExportColor(shape.fill || shape.stroke);
  const polygon = `${tip.x},${tip.y} ${baseX + normalX},${baseY + normalY} ${baseX - normalX},${baseY - normalY}`;
  return `${line}<polygon points="${polygon}" fill="${escapeXml(fill)}"/>`;
};

const renderAngle = (shape: DiagramShape) => {
  const values = shape.points && shape.points.length >= 6 ? shape.points : [0, 0, 80, 0, 0, -80];
  const points = pointsFromFlatArray(values.slice(0, 6));
  if (points.length < 3) return '';
  const [origin, firstEnd, secondEnd] = points;
  const color = normalizeExportColor(shape.stroke);
  const strokeWidth = Math.max(1, safeNumber(shape.strokeWidth, 2));
  const firstVector = { x: firstEnd.x - origin.x, y: firstEnd.y - origin.y };
  const secondVector = { x: secondEnd.x - origin.x, y: secondEnd.y - origin.y };
  const firstAngle = Math.atan2(firstVector.y, firstVector.x) * 180 / Math.PI;
  const secondAngle = Math.atan2(secondVector.y, secondVector.x) * 180 / Math.PI;
  let startAngle = Math.min(firstAngle, secondAngle);
  let endAngle = Math.max(firstAngle, secondAngle);
  let sweepAngle = endAngle - startAngle;
  if (sweepAngle > 180) {
    startAngle = endAngle;
    sweepAngle = 360 - sweepAngle;
  }
  const firstLength = Math.hypot(firstVector.x, firstVector.y);
  const secondLength = Math.hypot(secondVector.x, secondVector.y);
  const radius = Math.max(4, Math.min(firstLength, secondLength, 35) * 0.5);
  const startRadians = startAngle * Math.PI / 180;
  const endRadians = (startAngle + sweepAngle) * Math.PI / 180;
  const arcStart = { x: origin.x + Math.cos(startRadians) * radius, y: origin.y + Math.sin(startRadians) * radius };
  const arcEnd = { x: origin.x + Math.cos(endRadians) * radius, y: origin.y + Math.sin(endRadians) * radius };
  return [
    `<line x1="${origin.x}" y1="${origin.y}" x2="${firstEnd.x}" y2="${firstEnd.y}" stroke="${escapeXml(color)}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`,
    `<line x1="${origin.x}" y1="${origin.y}" x2="${secondEnd.x}" y2="${secondEnd.y}" stroke="${escapeXml(color)}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`,
    `<path d="M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 0 1 ${arcEnd.x} ${arcEnd.y}" fill="none" stroke="${escapeXml(color)}" stroke-width="1.5"/>`,
  ].join('');
};

const renderShape = (shape: DiagramShape) => {
  if (shape.type === 'line') return renderPolyline(shape);
  if (shape.type === 'arrow') return renderArrow(shape);
  if (shape.type === 'angle') return renderAngle(shape);

  if (shape.type === 'circle' || shape.type === 'point') {
    const radius = Math.max(1, safeNumber(shape.radius, shape.type === 'circle' ? 50 : 6));
    const stroke = normalizeExportColor(shape.stroke);
    const fill = shape.type === 'point'
      ? normalizeExportColor(shape.fill || shape.stroke)
      : normalizeExportColor(shape.fill, 'none');
    const strokeWidth = shape.type === 'point' ? 1.5 : Math.max(1, safeNumber(shape.strokeWidth, 2));
    return `<circle cx="${safeNumber(shape.x)}" cy="${safeNumber(shape.y)}" r="${radius}" fill="${escapeXml(fill)}" stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}"/>`;
  }

  if (shape.type === 'text') {
    const metrics = textMetrics(shape);
    const x = safeNumber(shape.x);
    const y = safeNumber(shape.y);
    const rotation = safeNumber(shape.rotation);
    const fill = normalizeExportColor(shape.fill || shape.stroke);
    const transform = rotation ? ` transform="rotate(${rotation} ${x} ${y})"` : '';
    const lines = metrics.text.split(/\r?\n/);
    const tspans = lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : metrics.fontSize * 1.25}">${escapeXml(line || ' ')}</tspan>`).join('');
    return `<text x="${x}" y="${y}" font-size="${metrics.fontSize}" font-family="Inter, Arial, sans-serif" font-weight="600" dominant-baseline="hanging" fill="${escapeXml(fill)}"${transform}>${tspans}</text>`;
  }

  return '';
};

const renderBlank = (blank: BlankField) => {
  const x = safeNumber(blank.x);
  const y = safeNumber(blank.y);
  const scaleX = Math.abs(safeNumber(blank.scaleX, 1)) || 1;
  const scaleY = Math.abs(safeNumber(blank.scaleY, 1)) || 1;
  const width = Math.max(1, safeNumber(blank.width, 80) * scaleX);
  const height = Math.max(1, safeNumber(blank.height, 40) * scaleY);
  const rotation = safeNumber(blank.rotation);
  const transform = rotation ? ` transform="rotate(${rotation} ${x} ${y})"` : '';
  const fontSize = Math.max(11, Math.min(18, height * 0.45));
  const label = blank.label?.trim() || '?';
  return `<g${transform}><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" fill="none" stroke="#0f172a" stroke-width="2" stroke-dasharray="7 5"/><text x="${x + width / 2}" y="${y + height / 2}" text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}" font-family="Inter, Arial, sans-serif" font-weight="700" fill="#0f172a">${escapeXml(label)}</text></g>`;
};

export const buildGeometryQuestionSvg = (
  shapes: DiagramShape[],
  blanks: BlankField[],
  options: GeometryQuestionExportOptions,
) => {
  const padding = GEOMETRY_QUESTION_PADDING[options.paddingPreset];
  const contentBounds = resolveContentBounds(shapes, blanks);
  const contentWidth = Math.max(1, contentBounds.maxX - contentBounds.minX);
  const contentHeight = Math.max(1, contentBounds.maxY - contentBounds.minY);
  const width = Math.ceil(contentWidth + padding * 2);
  const height = Math.ceil(contentHeight + padding * 2);
  const translateX = -contentBounds.minX + padding;
  const translateY = -contentBounds.minY + padding;
  const background = options.background === 'white'
    ? `<rect width="${width}" height="${height}" fill="#ffffff"/>`
    : '';
  const artwork = [
    ...shapes.map(renderShape),
    ...blanks.map(renderBlank),
  ].join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Geometry diagram" shape-rendering="geometricPrecision">${background}<g transform="translate(${translateX} ${translateY})">${artwork}</g></svg>`;

  return { svg, width, height, padding };
};

const slugify = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60) || 'geometry-diagram';

const svgToPngFile = async (svg: string, baseName: string, width: number, height: number) => {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Unable to rasterize the geometry SVG.'));
      image.src = objectUrl;
    });

    const pixelRatio = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width * pixelRatio));
    canvas.height = Math.max(1, Math.ceil(height * pixelRatio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable for PNG fallback export.');
    context.scale(pixelRatio, pixelRatio);
    context.drawImage(image, 0, 0, width, height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Unable to create PNG fallback.')), 'image/png');
    });
    return new File([pngBlob], `${baseName}.png`, { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

export const createGeometryQuestionAssetDraft = async (
  title: string,
  shapes: DiagramShape[],
  blanks: BlankField[],
  options: GeometryQuestionExportOptions,
): Promise<GeometryQuestionAssetDraft> => {
  const resolvedTitle = title.trim() || 'Geometry diagram';
  const baseName = `${slugify(resolvedTitle)}-geometry`;
  const { svg, width, height, padding } = buildGeometryQuestionSvg(shapes, blanks, options);
  const svgFile = new File([svg], `${baseName}.svg`, { type: 'image/svg+xml' });
  const pngFile = await svgToPngFile(svg, baseName, width, height);

  return {
    svgFile,
    pngFile,
    title: resolvedTitle,
    width,
    height,
    padding,
    paddingPreset: options.paddingPreset,
    background: options.background,
  };
};
