import type { NextApiRequest } from './types';
import { ApiError } from './errors';

export const getQueryValue = (req: NextApiRequest, key: string): string | undefined => {
  const value = req.query[key];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

export const requireQueryValue = (req: NextApiRequest, key: string): string => {
  const value = getQueryValue(req, key);
  if (!value) {
    throw new ApiError('INVALID_QUERY', `Missing required query param: ${key}`);
  }
  return value;
};
