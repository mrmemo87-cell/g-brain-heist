import { supabase } from './supabaseClient.js';

export interface GeometryQuestionImageUploadResult {
  primaryUrl: string;
  svgUrl: string | null;
  pngUrl: string;
}

const QUESTION_IMAGE_BUCKET = 'question-images';

const randomSuffix = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 12);
};

const getPublicUrl = (path: string) => {
  const { data } = supabase.storage.from(QUESTION_IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
};

export const uploadGeometryQuestionAssets = async (
  svgFile: File,
  pngFile: File,
): Promise<GeometryQuestionImageUploadResult> => {
  if (svgFile.type !== 'image/svg+xml') {
    throw new Error('Geometry primary asset must be an SVG file.');
  }
  if (pngFile.type !== 'image/png') {
    throw new Error('Geometry fallback asset must be a PNG file.');
  }

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error('You must be signed in to attach a geometry diagram.');
  }

  const basePath = `${authData.user.id}/${Date.now()}-${randomSuffix()}-geometry`;
  const pngPath = `${basePath}.png`;
  const svgPath = `${basePath}.svg`;
  const storage = supabase.storage.from(QUESTION_IMAGE_BUCKET);

  const { error: pngError } = await storage.upload(pngPath, pngFile, {
    cacheControl: '3600',
    contentType: 'image/png',
    upsert: false,
  });
  if (pngError) {
    throw new Error(`Unable to upload PNG fallback: ${pngError.message}`);
  }

  const pngUrl = getPublicUrl(pngPath);
  const { error: svgError } = await storage.upload(svgPath, svgFile, {
    cacheControl: '3600',
    contentType: 'image/svg+xml',
    upsert: false,
  });

  if (svgError) {
    console.warn('SVG geometry upload failed; using PNG fallback.', svgError);
    return {
      primaryUrl: pngUrl,
      svgUrl: null,
      pngUrl,
    };
  }

  const svgUrl = getPublicUrl(svgPath);
  return {
    primaryUrl: svgUrl,
    svgUrl,
    pngUrl,
  };
};

export const geometryPngFallbackUrl = (imageUrl?: string | null) => {
  if (!imageUrl || !/-geometry\.svg(?:[?#].*)?$/i.test(imageUrl)) return null;
  return imageUrl.replace(/\.svg(?=([?#].*)?$)/i, '.png');
};
