import { getSupabaseServerClient } from './supabaseServer';
import type { NextApiHandler } from './types';
import { sendSuccess } from './responses';
import { ApiError, handleApiError } from './errors';
import { requireTeacher, type AuthContext } from './auth';
import { getQueryValue } from './request';

export type CrudBuilder<TPayload, TResult> = {
  table: string;
  select?: string;
  mapPayload: (payload: unknown, action: 'create' | 'update', context: AuthContext) => TPayload;
  mapResult?: (result: TResult | TResult[]) => unknown;
  idColumn?: string;
};

export const createCrudHandler = <TPayload extends Record<string, unknown>, TResult = TPayload>(
  options: CrudBuilder<TPayload, TResult>
): NextApiHandler => {
  const { table, select = '*', mapPayload, mapResult, idColumn = 'id' } = options;

  return async (req, res) => {
    try {
      const context = requireTeacher(req);
      const supabase = getSupabaseServerClient() as any;

      switch (req.method) {
        case 'GET': {
          const id = getQueryValue(req, 'id');
          if (id) {
            const { data, error } = await supabase.from(table).select(select).eq(idColumn, id).single();
            if (error) throw new ApiError('DB_ERROR', error.message, 500);
            const normalized = data as TResult;
            sendSuccess(res, mapResult ? mapResult(normalized) : normalized);
            return;
          }
          const { data, error } = await supabase.from(table).select(select).order('created_at', { ascending: true });
          if (error) throw new ApiError('DB_ERROR', error.message, 500);
          const normalized = data as TResult[];
          sendSuccess(res, mapResult ? mapResult(normalized) : normalized);
          return;
        }
        case 'POST': {
          const payload = mapPayload(req.body, 'create', context);
          const { data, error } = await supabase.from(table).insert(payload).select(select).single();
          if (error) throw new ApiError('DB_ERROR', error.message, 500);
          const normalized = data as TResult;
          sendSuccess(res, mapResult ? mapResult(normalized) : normalized);
          return;
        }
        case 'PUT': {
          const id = getQueryValue(req, 'id');
          if (!id) throw new ApiError('INVALID_QUERY', 'Missing id for update');
          const payload = mapPayload(req.body, 'update', context);
          const { data, error } = await supabase.from(table).update(payload).eq(idColumn, id).select(select).single();
          if (error) throw new ApiError('DB_ERROR', error.message, 500);
          const normalized = data as TResult;
          sendSuccess(res, mapResult ? mapResult(normalized) : normalized);
          return;
        }
        case 'DELETE': {
          const id = getQueryValue(req, 'id');
          if (!id) throw new ApiError('INVALID_QUERY', 'Missing id for delete');
          const { error } = await supabase.from(table).delete().eq(idColumn, id);
          if (error) throw new ApiError('DB_ERROR', error.message, 500);
          sendSuccess(res, { deleted: true });
          return;
        }
        default:
          throw new ApiError('METHOD_NOT_ALLOWED', 'Unsupported method', 405);
      }
    } catch (error) {
      handleApiError(res, error);
    }
  };
};
