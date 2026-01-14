import React from 'react';
import { Profile } from '../types';
import BackButton from './BackButton';

interface TournamentHubProps {
  profile: Profile;
  onClose: () => void;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const TournamentHub: React.FC<TournamentHubProps> = ({ profile, onClose, addToast }) => {
  void profile;
  void addToast;

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none bg-gradient-to-br from-[#120027]/80 via-[#001527]/80 to-[#101010]/80" />
      <div className="relative z-10 p-6">
        <BackButton onClick={onClose} />
        <div className="mt-16 flex flex-col items-center text-center text-white">
          <h1 className="text-3xl font-heading">Tournament Command Center</h1>
          <p className="mt-4 text-lg text-white/70">Coming soon.</p>
        </div>
      </div>
    </div>
  );
};

export default TournamentHub;
