import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';

interface EmailVerificationScreenProps {
  email: string;
  onVerified?: () => void;
}

const EmailVerificationScreen: React.FC<EmailVerificationScreenProps> = ({ email, onVerified }) => {
  const [isResending, setIsResending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleResendEmail = async () => {
    setIsResending(true);
    setMessage('');
    setError('');

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });

      if (resendError) {
        throw resendError;
      }

      setMessage('Verification email sent! Check your inbox.');
    } catch (err) {
      console.error('Resend email error:', err);
      setError(err instanceof Error ? err.message : 'Failed to resend email');
    } finally {
      setIsResending(false);
    }
  };

  const handleCheckVerification = async () => {
    try {
      // Refresh the session to check if email is now verified
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError) throw refreshError;
      
      if (data.session?.user?.email_confirmed_at) {
        setMessage('Email verified! Loading...');
        if (onVerified) {
          onVerified();
        } else {
          // Reload the page to trigger auth check
          window.location.reload();
        }
      } else {
        setError('Email not verified yet. Please check your inbox.');
      }
    } catch (err) {
      console.error('Check verification error:', err);
      setError(err instanceof Error ? err.message : 'Failed to check verification status');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-2xl border border-purple-500/30 p-8">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-purple-500/20 flex items-center justify-center">
            <svg
              className="w-10 h-10 text-purple-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-center mb-2 text-white font-heading">
          Verify your email
        </h1>

        {/* Subtitle */}
        <p className="text-center text-slate-300 mb-6">
          We sent a verification link to:
        </p>
        <p className="text-center text-purple-400 font-semibold mb-8 break-all">
          {email}
        </p>

        {/* Instructions */}
        <div className="bg-slate-900/50 rounded-lg p-4 mb-6 space-y-2">
          <p className="text-sm text-slate-300">
            <span className="text-purple-400 font-semibold">1.</span> Check your inbox (and spam folder)
          </p>
          <p className="text-sm text-slate-300">
            <span className="text-purple-400 font-semibold">2.</span> Click the verification link
          </p>
          <p className="text-sm text-slate-300">
            <span className="text-purple-400 font-semibold">3.</span> Come back here and click "I've verified"
          </p>
        </div>

        {/* Messages */}
        {message && (
          <div className="mb-4 p-3 bg-green-500/20 border border-green-500/50 rounded-lg">
            <p className="text-sm text-green-300 text-center">{message}</p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
            <p className="text-sm text-red-300 text-center">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleCheckVerification}
            className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors duration-200"
          >
            I've verified my email
          </button>

          <button
            onClick={handleResendEmail}
            disabled={isResending}
            className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isResending ? 'Sending...' : 'Resend verification email'}
          </button>
        </div>

        {/* Help text */}
        <p className="text-center text-sm text-slate-400 mt-6">
          Having trouble? Contact support at{' '}
          <a href="mailto:support@example.com" className="text-purple-400 hover:underline">
            support@example.com
          </a>
        </p>
      </div>
    </div>
  );
};

export default EmailVerificationScreen;
