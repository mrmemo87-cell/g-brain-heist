import React, { useState, useEffect } from 'react';
import { resendVerificationEmail } from '../services/emailVerification';
import { supabase } from '../services/supabaseClient';

interface EmailVerificationGateProps {
  userEmail?: string;
}

const EmailVerificationGate: React.FC<EmailVerificationGateProps> = ({ userEmail: providedEmail }) => {
  const [sending, setSending] = useState(false);
  const [userEmail, setUserEmail] = useState<string | undefined>(providedEmail);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!providedEmail) {
      // Fetch email from Supabase auth
      supabase.auth.getUser().then(({ data }) => {
        setUserEmail(data?.user?.email);
      });
    }
  }, [providedEmail]);

  const handleResend = async () => {
    setSending(true);
    setMessage(null);

    const result = await resendVerificationEmail();

    if (result.success) {
      setMessage({ type: 'success', text: 'Verification email sent! Check your inbox.' });
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to send email' });
    }

    setSending(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)' }}>
      <div className="w-full max-w-md rounded-2xl border border-yellow-500/40 bg-black/40 p-8 backdrop-blur-md text-center">
        <div className="text-5xl mb-4">📧</div>
        <h1 className="font-heading text-2xl mb-3" style={{ color: 'var(--ion-blue)' }}>
          Verify Your Email
        </h1>
        <p className="text-gray-300 mb-2">
          Please verify your email address to continue.
        </p>
        {userEmail && (
          <p className="text-sm text-gray-400 mb-6">
            We sent a verification link to <strong>{userEmail}</strong>
          </p>
        )}
        
        <div className="space-y-4">
          <button
            onClick={handleResend}
            disabled={sending}
            className="w-full py-3 px-6 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ 
              background: sending ? '#444' : 'linear-gradient(135deg, #00d4ff 0%, #0099ff 100%)',
              color: sending ? '#999' : '#0a0e27'
            }}
          >
            {sending ? 'Sending...' : 'Resend Verification Email'}
          </button>

          {message && (
            <div 
              className={`p-3 rounded-lg border ${
                message.type === 'success' 
                  ? 'bg-green-500/10 border-green-500/40 text-green-400' 
                  : 'bg-red-500/10 border-red-500/40 text-red-400'
              }`}
            >
              <p className="text-sm">{message.text}</p>
            </div>
          )}

          <div className="pt-4 border-t border-gray-700">
            <p className="text-xs text-gray-500 mb-3">
              Already verified? Refresh the page or try logging in again.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailVerificationGate;
