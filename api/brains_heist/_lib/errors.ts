import type { NextApiResponse } from './types';
import { sendError } from './responses';

export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const handleApiError = (res: NextApiResponse, error: unknown) => {
  if (error instanceof ApiError) {
    sendError(res, error.code, error.message, error.status, error.details);
    return;
  }

  if (error instanceof Error) {
    sendError(res, 'UNEXPECTED_ERROR', error.message, 500);
    return;
  }

  sendError(res, 'UNKNOWN_ERROR', 'An unknown error occurred', 500);
};
