import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import * as AuthService from '../services/authService';

const PasswordResetPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setHasSession(!!session);
      } catch (err) {
        console.error('Error checking session:', err);
        setHasSession(false);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);

    try {
      await AuthService.updatePassword(newPassword);
      setSuccess(true);
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)' }}>
        <div className="text-center">
          <div className="font-heading text-2xl animate-pulse" style={{ color: 'var(--ion-blue)' }}>
            Verifying reset link...
          </div>
        </div>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)' }}>
        <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-black/40 p-8 backdrop-blur-md text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="font-heading text-2xl mb-3" style={{ color: 'var(--ion-blue)' }}>
            Invalid or Expired Link
          </h1>
          <p className="text-gray-300 mb-6">
            This password reset link is invalid or has expired. Please request a new one.
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 px-6 rounded-lg font-semibold transition-all"
            style={{ 
              background: 'linear-gradient(135deg, #00d4ff 0%, #0099ff 100%)',
              color: '#0a0e27'
            }}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)' }}>
        <div className="w-full max-w-md rounded-2xl border border-green-500/40 bg-black/40 p-8 backdrop-blur-md text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="font-heading text-2xl mb-3" style={{ color: '#00d4ff' }}>
            Password Reset Successful!
          </h1>
          <p className="text-gray-300 mb-6">
            Your password has been updated. Redirecting to login...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)' }}>
      <div className="w-full max-w-md rounded-2xl border border-cyan-400/40 bg-black/40 p-8 backdrop-blur-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🔐</div>
          <h1 className="font-heading text-2xl mb-2" style={{ color: 'var(--ion-blue)' }}>
            Reset Your Password
          </h1>
          <p className="text-gray-400 text-sm">
            Enter your new password below
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-300 mb-1">
              New Password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-md p-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
              placeholder="Enter new password"
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-md p-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
              placeholder="Confirm new password"
              disabled={submitting}
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/40">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !newPassword || !confirmPassword}
            className="w-full py-3 px-6 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ 
              background: submitting || !newPassword || !confirmPassword 
                ? '#444' 
                : 'linear-gradient(135deg, #00d4ff 0%, #0099ff 100%)',
              color: submitting || !newPassword || !confirmPassword ? '#999' : '#0a0e27'
            }}
          >
            {submitting ? 'Updating Password...' : 'Reset Password'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-cyan-400 hover:text-cyan-300"
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default PasswordResetPage;
