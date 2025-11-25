import React from 'react';

export const SyndicateRune: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 100 100"
    fill="none"
    stroke="currentColor"
    strokeWidth={8}
    strokeLinecap="round"
    {...props}
  >
    <line x1="50" y1="10" x2="50" y2="90" />
    <line x1="20" y1="30" x2="80" y2="30" />
    <line x1="30" y1="45" x2="70" y2="45" />
    <line x1="25" y1="60" x2="75" y2="60" />
    <line x1="30" y1="30" x2="50" y2="45" />
    <line x1="70" y1="30" x2="50" y2="45" />
    <line x1="30" y1="75" x2="50" y2="60" />
    <line x1="70" y1="75" x2="50" y2="60" />
  </svg>
);

export default SyndicateRune;
