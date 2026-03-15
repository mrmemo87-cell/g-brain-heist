import React, { useState } from 'react';
import * as AuthService from '../services/authService';
import SchoolRequestModal from './SchoolRequestModal';
import VisualFallbackImage from './VisualFallbackImage';

interface JoinSchoolCardProps {
  onJoined?: () => void;
}

const JoinSchoolCard: React.FC<JoinSchoolCardProps> = ({ onJoined }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);

  const normalizeInviteCode = (code: string) => code.replace(/\s+/g, '').toUpperCase();
  const inviteCodeNormalized = normalizeInviteCode(inviteCode);
  const inviteCodeReady = inviteCodeNormalized.length >= 6;

  const handleJoin = async () => {
    if (!inviteCodeReady) {
      setError('Please enter a valid invite code');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Check email verification first
      const verificationStatus = await AuthService.checkEmailVerification();
      if (!verificationStatus.isVerified) {
        setError('Please verify your email before joining a school. Check your inbox for the verification link.');
        setIsLoading(false);
        return;
      }

      // Validate the code first
      const validateResult = await AuthService.validateInviteCode(inviteCodeNormalized);
      
      if (!validateResult.valid) {
        setError('Invalid or expired invite code');
        return;
      }

      // Join as student by default (they can change role in settings later)
      const joinResult = await AuthService.joinSchoolByCode(inviteCodeNormalized, 'student');
      
      if (!joinResult.success) {
        setError(joinResult.error || 'Failed to join school');
        return;
      }

      // Success!
      setInviteCode('');
      setIsExpanded(false);
      onJoined?.();
    } catch (err) {
      setError('Failed to join school. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="mb-4 overflow-hidden rounded-xl border border-cyan-500/30 bg-gradient-to-br from-slate-900/95 to-slate-800/95 shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-cyan-400/50">
        {/* Collapsed state */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-4 flex items-center justify-between text-left transition-all duration-200 hover:bg-white/5"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center border border-cyan-500/40">
              <span className="text-xl">🏫</span>
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Join Your School</h3>
              <p className="text-xs text-gray-400">
                {isExpanded ? 'Click to collapse' : 'Get full access to school features'}
              </p>
            </div>
          </div>
          
          <svg 
            className={`w-5 h-5 text-cyan-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Expanded content */}
        <div 
          className={`transition-all duration-300 ease-in-out ${
            isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="p-4 pt-0 space-y-4 border-t border-gray-800/50">
            <VisualFallbackImage
              src="/visuals/Unlock-School-Leaderboards.png"
              alt="Unlock school features"
              className="h-24 overflow-hidden rounded-lg border border-cyan-500/20"
              imgClassName="h-full w-full object-cover"
              fallback={(
                <div className="flex h-24 items-center justify-between rounded-lg border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 px-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Unlock school mode</p>
                    <p className="text-xs text-cyan-200">Leaderboards • Clans • Competitions</p>
                  </div>
                  <span className="text-2xl" aria-hidden>🏆</span>
                </div>
              )}
            />

            {/* Benefits list */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-2 text-gray-300">
                <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>School leaderboards</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300">
                <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>Join school clans</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300">
                <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>School competitions</span>
              </div>
              <div className="flex items-center gap-2 text-gray-300">
                <svg className="w-4 h-4 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span>Teacher assignments</span>
              </div>
            </div>

            {/* Invite code input */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-300">
                Enter Invite Code
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => {
                    setInviteCode(normalizeInviteCode(e.target.value));
                    setError(null);
                  }}
                  placeholder="XXXXXXXX"
                  className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all"
                  maxLength={10}
                  disabled={isLoading}
                />
                <button
                  onClick={handleJoin}
                  disabled={!inviteCodeReady || isLoading}
                  className="px-4 py-2 rounded-lg font-semibold text-sm bg-cyan-500 text-gray-900 hover:bg-cyan-400 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-all"
                >
                  {isLoading ? '...' : 'Join'}
                </button>
              </div>
              
              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}
            </div>

            {/* Request school option */}
            <div className="pt-2 border-t border-gray-800/50">
              <button
                onClick={() => setShowRequestModal(true)}
                className="w-full text-center text-xs text-gray-400 hover:text-cyan-400 transition-colors"
              >
                Don't have a code? Request school access →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* School Request Modal */}
      {showRequestModal && (
        <SchoolRequestModal
          isOpen={showRequestModal}
          onClose={() => setShowRequestModal(false)}
        />
      )}
    </>
  );
};

export default JoinSchoolCard;
