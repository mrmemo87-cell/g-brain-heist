import type { IncomingMessage, ServerResponse } from 'node:http';

type QueryValue = string | string[];

declare module globalThis {
  // Provide a narrow globalThis typing to avoid TS complaints when Next.js types are absent.
}

export interface NextApiRequest extends IncomingMessage {
  method?: string;
  query: Record<string, QueryValue>;
  body?: unknown;
  headers: IncomingMessage['headers'];
}

export interface NextApiResponse<T = any> extends ServerResponse<IncomingMessage> {
  status: (statusCode: number) => NextApiResponse<T>;
  json: (body: T) => void;
}

export type NextApiHandler<T = any> = (req: NextApiRequest, res: NextApiResponse<T>) => void | Promise<void>;

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorShape {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
