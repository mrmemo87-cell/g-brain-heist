import React from 'react';

interface IeltsSchoolLearnerLinksProps {
  onNavigate: (route: string) => void;
}

const IeltsSchoolLearnerLinks: React.FC<IeltsSchoolLearnerLinksProps> = ({ onNavigate }) => (
  <nav
    aria-label="School IELTS tools"
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '.7rem',
      flexWrap: 'wrap',
      padding: '.9rem 1rem',
      background: 'rgba(255,255,255,0.92)',
      border: '1px solid rgba(148,163,184,0.28)',
      borderRadius: '1.1rem',
      boxShadow: '0 14px 36px rgba(15,23,42,0.07)',
    }}
  >
    <span style={{ color: '#475569', fontWeight: 900, marginRight: '.15rem' }}>School IELTS</span>
    <button type="button" onClick={() => onNavigate('/ielts/practice/assigned')} style={{ minHeight: 42, border: '1px solid #c4b5fd', borderRadius: 999, background: '#f5f3ff', color: '#5b21b6', padding: '.65rem .9rem', fontWeight: 900, cursor: 'pointer' }}>📌 Assigned Practice</button>
    <button type="button" onClick={() => onNavigate('/ielts/journey')} style={{ minHeight: 42, border: '1px solid #bae6fd', borderRadius: 999, background: '#f0f9ff', color: '#075985', padding: '.65rem .9rem', fontWeight: 900, cursor: 'pointer' }}>🧭 My IELTS Journey</button>
  </nav>
);

export default IeltsSchoolLearnerLinks;
