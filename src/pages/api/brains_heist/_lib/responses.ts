import type { ApiErrorShape, ApiSuccessResponse, NextApiResponse } from './types';

export const sendJson = <T>(res: NextApiResponse<ApiSuccessResponse<T> | ApiErrorShape>, status: number, payload: ApiSuccessResponse<T> | ApiErrorShape) => {
  res.status(status).json(payload);
};

export const sendSuccess = <T>(res: NextApiResponse<ApiSuccessResponse<T> | ApiErrorShape>, data: T, status = 200) => {
  sendJson(res, status, { success: true, data });
};

export const sendError = (
  res: NextApiResponse<ApiErrorShape | ApiSuccessResponse<unknown>>,
  code: string,
  message: string,
  status = 400,
  details?: unknown
) => {
  sendJson(res, status, { success: false, error: { code, message, details } });
};
