import React from 'react';

interface BackButtonProps {
  onClick: () => void;
  label?: string;
}

const BackButton: React.FC<BackButtonProps> = ({ onClick, label = 'Return to Dashboard' }) => {
  return (
    <button
      onClick={onClick}
      className="fixed top-6 left-6 z-50 flex items-center space-x-2 bg-black/40 hover:bg-black/60 border border-gray-600 hover:border-cyan-400 text-gray-300 hover:text-white px-4 py-2 rounded-lg transition-all duration-300 backdrop-blur-sm"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      <span className="font-medium">{label}</span>
    </button>
  );
};

export default BackButton;
