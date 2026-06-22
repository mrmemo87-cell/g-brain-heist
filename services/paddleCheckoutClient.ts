declare global {
  interface Window {
    Paddle?: {
      Environment?: {
        set: (environment: 'sandbox' | 'production') => void;
      };
      Initialize: (config: Record<string, unknown>) => void;
      Checkout: {
        open: (config: Record<string, unknown>) => void;
      };
    };
  }
}

let paddleScriptPromise: Promise<void> | null = null;
let paddleInitialized = false;

function loadPaddleScript(): Promise<void> {
  if (window.Paddle) return Promise.resolve();

  if (!paddleScriptPromise) {
    paddleScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[src="https://cdn.paddle.com/paddle/v2/paddle.js"]',
      );

      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Failed to load Paddle.js')));
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Paddle.js'));
      document.head.appendChild(script);
    });
  }

  return paddleScriptPromise;
}

export async function openPaddleCheckoutForTransaction(transactionId: string): Promise<void> {
  if (!transactionId) {
    throw new Error('Missing Paddle transaction ID.');
  }

  const clientToken = import.meta.env['VITE_PADDLE_CLIENT_TOKEN'] as string | undefined;
  const environment = (import.meta.env['VITE_PADDLE_ENVIRONMENT'] || 'production') as
    | 'sandbox'
    | 'production';

  if (!clientToken) {
    throw new Error('Missing VITE_PADDLE_CLIENT_TOKEN.');
  }

  await loadPaddleScript();

  if (!window.Paddle) {
    throw new Error('Paddle.js did not initialize.');
  }

  if (!paddleInitialized) {
    if (environment === 'sandbox') {
      window.Paddle.Environment?.set('sandbox');
    }

    window.Paddle.Initialize({
      token: clientToken,
      checkout: {
        settings: {
          displayMode: 'overlay',
          variant: 'one-page',
          theme: 'light',
          locale: 'en',
          successUrl: `${window.location.origin}/ielts/apply-prime?checkout=success`,
        },
      },
    });

    paddleInitialized = true;
  }

  window.Paddle.Checkout.open({
    transactionId,
    settings: {
      displayMode: 'overlay',
      variant: 'one-page',
      theme: 'light',
      locale: 'en',
      successUrl: `${window.location.origin}/ielts/apply-prime?checkout=success`,
    },
  });
}
