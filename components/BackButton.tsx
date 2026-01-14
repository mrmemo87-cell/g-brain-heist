import React from 'react';

interface BackButtonProps {
  onClick: () => void;
  label?: string;
  containerClassName?: string;
  className?: string;
}

const BackButton: React.FC<BackButtonProps> = ({
  onClick,
  label = 'Return to Dashboard',
  containerClassName = 'mb-6',
  className = '',
}) => {
  return (
    <div className={containerClassName}>
      <button
        onClick={onClick}
        className={`flex items-center space-x-2 card-glass px-6 py-3 rounded-lg hover:scale-105 transition-all duration-300 group animate-fade-in-up ${className}`.trim()}
        style={{ borderColor: 'rgba(0, 208, 232, 0.3)' }}
      >
        <svg 
          className="w-5 h-5 group-hover:-translate-x-1 transition-transform" 
          style={{ color: 'var(--ion-blue)' }}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span className="font-semibold text-gray-200 group-hover:text-white transition-colors">{label}</span>
      </button>
    </div>
  );
};

export default BackButton;
