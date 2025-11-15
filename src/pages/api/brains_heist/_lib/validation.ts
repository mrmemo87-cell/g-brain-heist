import { ApiError } from './errors';

type Primitive = string | number | boolean | null;

type Validator<T> = (value: unknown, path: string) => T;

export const ensureString: Validator<string> = (value, path) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiError('INVALID_PAYLOAD', `${path} must be a non-empty string`);
  }
  return value.trim();
};

export const ensureOptionalString: Validator<string | undefined> = (value, path) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return ensureString(value, path);
};

export const ensureNumber: Validator<number> = (value, path) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ApiError('INVALID_PAYLOAD', `${path} must be a number`);
  }
  return value;
};

export const ensureOptionalNumber: Validator<number | undefined> = (value, path) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return ensureNumber(value, path);
};

export const ensureBoolean: Validator<boolean> = (value, path) => {
  if (typeof value !== 'boolean') {
    throw new ApiError('INVALID_PAYLOAD', `${path} must be a boolean`);
  }
  return value;
};

export const ensureArray = <T>(value: unknown, path: string, itemValidator: (value: unknown, childPath: string) => T): T[] => {
  if (!Array.isArray(value)) {
    throw new ApiError('INVALID_PAYLOAD', `${path} must be an array`);
  }
  return value.map((item, index) => itemValidator(item, `${path}[${index}]`));
};

export const ensurePrimitive: Validator<Primitive> = (value, path) => {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value;
  }
  throw new ApiError('INVALID_PAYLOAD', `${path} must be a primitive value`);
};

export const ensureIsoDateString: Validator<string> = (value, path) => {
  const stringValue = ensureString(value, path);
  const timestamp = Date.parse(stringValue);
  if (Number.isNaN(timestamp)) {
    throw new ApiError('INVALID_PAYLOAD', `${path} must be a valid ISO date string`);
  }
  return new Date(timestamp).toISOString();
};

export const ensureOptionalIsoDateString: Validator<string | undefined> = (value, path) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return ensureIsoDateString(value, path);
};
