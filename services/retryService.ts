/**
 * Retry utility for automatic error recovery with exponential backoff
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: any) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  shouldRetry: (error: any) => {
    // Retry on network errors, timeouts, or 5xx server errors
    if (error?.message?.includes('fetch') || error?.message?.includes('network')) return true;
    if (error?.status >= 500 && error?.status < 600) return true;
    if (error?.code === 'PGRST301') return true; // PostgREST timeout
    return false;
  },
};

/**
 * Executes a function with automatic retry on failure
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns Promise resolving to the function result
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;
  let delay = opts.initialDelay;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry if this is the last attempt or if error is not retryable
      if (attempt >= opts.maxAttempts || !opts.shouldRetry(error)) {
        throw error;
      }

      console.warn(`Attempt ${attempt}/${opts.maxAttempts} failed, retrying in ${delay}ms...`, error);

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));

      // Increase delay with exponential backoff
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay);
    }
  }

  throw lastError;
}

/**
 * Checks if the browser is online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Adds an event listener for online/offline status changes
 */
export function onNetworkStatusChange(callback: (online: boolean) => void): () => void {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
