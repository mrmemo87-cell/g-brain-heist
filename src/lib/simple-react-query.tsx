import React, { createContext, useCallback, useContext, useMemo, useRef, useState, useEffect } from 'react';

type QueryKey = readonly unknown[];

type QueryListenerEvent = 'updated' | 'invalidated';
type QueryListener = (event: QueryListenerEvent) => void;

interface QueryEntry {
  key: QueryKey;
  data: unknown;
  listeners: Set<QueryListener>;
}

const hashKey = (key: QueryKey) => JSON.stringify(key);

const matchesPrefix = (key: QueryKey, prefix: QueryKey) => {
  if (prefix.length === 0) return true;
  if (prefix.length > key.length) return false;
  return hashKey(key.slice(0, prefix.length)) === hashKey(prefix);
};

export class QueryClient {
  private store = new Map<string, QueryEntry>();

  private ensureEntry(key: QueryKey) {
    const hashed = hashKey(key);
    let entry = this.store.get(hashed);
    if (!entry) {
      entry = { key, data: undefined, listeners: new Set() };
      this.store.set(hashed, entry);
    }
    return entry;
  }

  getQueryData<T>(key: QueryKey): T | undefined {
    const entry = this.store.get(hashKey(key));
    return entry?.data as T | undefined;
  }

  hasQueryData(key: QueryKey) {
    return this.store.has(hashKey(key));
  }

  setQueryData<T>(key: QueryKey, updater: T | ((oldData: T | undefined) => T)) {
    const entry = this.ensureEntry(key);
    if (typeof updater === 'function') {
      entry.data = (updater as (oldData: T | undefined) => T)(entry.data as T | undefined);
    } else {
      entry.data = updater;
    }
    entry.listeners.forEach((listener) => listener('updated'));
  }

  invalidateQueries(prefix: QueryKey) {
    for (const entry of this.store.values()) {
      if (matchesPrefix(entry.key, prefix)) {
        entry.listeners.forEach((listener) => listener('invalidated'));
      }
    }
  }

  subscribe(key: QueryKey, listener: QueryListener) {
    const entry = this.ensureEntry(key);
    entry.listeners.add(listener);
    return () => {
      entry.listeners.delete(listener);
    };
  }
}

interface QueryContextValue {
  client: QueryClient;
}

const QueryContext = createContext<QueryContextValue | null>(null);

interface QueryClientProviderProps {
  client: QueryClient;
  children: React.ReactNode;
}

export const QueryClientProvider: React.FC<QueryClientProviderProps> = ({ client, children }) => {
  const value = useMemo(() => ({ client }), [client]);
  return <QueryContext.Provider value={value}>{children}</QueryContext.Provider>;
};

export const useQueryClient = () => {
  const ctx = useContext(QueryContext);
  if (!ctx) {
    throw new Error('useQueryClient must be used within a QueryClientProvider');
  }
  return ctx.client;
};

interface UseQueryOptions<T> {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  enabled?: boolean;
}

interface UseQueryResult<T> {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  isFetching: boolean;
  refetch: () => Promise<T | undefined>;
}

export const useQuery = <T,>({ queryKey, queryFn, enabled = true }: UseQueryOptions<T>): UseQueryResult<T> => {
  const client = useQueryClient();
  const [data, setData] = useState<T | undefined>(() => client.getQueryData<T>(queryKey));
  const [error, setError] = useState<Error | null>(null);
  const [isFetching, setIsFetching] = useState<boolean>(() => (!client.hasQueryData(queryKey) && enabled));
  const mountedRef = useRef(true);

  const execute = useCallback(async () => {
    if (!enabled) {
      return data;
    }
    setIsFetching(true);
    setError(null);
    try {
      const result = await queryFn();
      if (!mountedRef.current) return result;
      client.setQueryData<T>(queryKey, result);
      setData(result);
      return result;
    } catch (err) {
      if (mountedRef.current) {
        setError(err as Error);
      }
      throw err;
    } finally {
      if (mountedRef.current) {
        setIsFetching(false);
      }
    }
  }, [client, queryFn, queryKey, enabled, data]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!data && enabled) {
      void execute();
    }
  }, [data, enabled, execute]);

  useEffect(() => {
    return client.subscribe(queryKey, (event) => {
      if (!mountedRef.current) return;
      if (event === 'invalidated') {
        void execute();
      } else {
        setData(client.getQueryData(queryKey));
      }
    });
  }, [client, execute, queryKey]);

  return {
    data,
    error,
    isLoading: !data && isFetching,
    isFetching,
    refetch: execute,
  };
};

interface UseMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables) => void;
}

interface UseMutationResult<TData, TVariables> {
  mutate: (variables: TVariables) => void;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
}

export const useMutation = <TData, TVariables>(options: UseMutationOptions<TData, TVariables>): UseMutationResult<TData, TVariables> => {
  const { mutationFn, onError, onSuccess } = options;
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const runMutation = useCallback(
    async (variables: TVariables) => {
      setIsPending(true);
      setError(null);
      try {
        const result = await mutationFn(variables);
        onSuccess?.(result, variables);
        setIsPending(false);
        return result;
      } catch (err) {
        const typedError = err as Error;
        setError(typedError);
        onError?.(typedError, variables);
        setIsPending(false);
        throw typedError;
      }
    },
    [mutationFn, onError, onSuccess]
  );

  return {
    mutate: (variables: TVariables) => {
      void runMutation(variables);
    },
    mutateAsync: runMutation,
    isPending,
    isError: !!error,
    error,
  };
};
