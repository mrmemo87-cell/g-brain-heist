import React from 'react';

interface BadgeProps {
  label: string;
  count: number;
  color: string;
  icon: string;
  onClick?: () => void;
}

const Badge: React.FC<BadgeProps> = ({ label, count, color, icon, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.55rem',
      padding: '0.6rem 0.9rem',
      borderRadius: '0.75rem',
      border: count > 0 ? `1px solid ${color}40` : '1px solid #e2e8f0',
      background: count > 0 ? `${color}10` : '#f9fafb',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'box-shadow 0.2s, border-color 0.2s',
      textAlign: 'left',
      boxShadow: count > 0 ? `0 1px 6px ${color}20` : 'none',
    }}
    onMouseEnter={(e) => { if (onClick && count > 0) (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 2px 12px ${color}30`; }}
    onMouseLeave={(e) => { if (onClick && count > 0) (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 1px 6px ${color}20`; }}
  >
    <span style={{ fontSize: '1.15rem' }}>{icon}</span>
    <div>
      <p style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: count > 0 ? color : '#d1d5db', lineHeight: 1 }}>
        {count}
      </p>
      <p style={{ margin: '0.1rem 0 0', fontSize: '0.68rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
        {label}
      </p>
    </div>
  </button>
);

interface IeltsAdminBadgeRowProps {
  totalUsers: number;
  premiumUsers: number;
  pendingPrime: number;
  ungradedWriting: number;
  ungradedSpeaking: number;
  onGoReviews?: () => void;
  onGoPrime?: () => void;
}

const IeltsAdminBadgeRow: React.FC<IeltsAdminBadgeRowProps> = ({
  totalUsers,
  premiumUsers,
  pendingPrime,
  ungradedWriting,
  ungradedSpeaking,
  onGoReviews,
  onGoPrime,
}) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.65rem' }}>
  <Badge label="IELTS Users" count={totalUsers} color="#0891b2" icon="👥" />
  <Badge label="Prime Users" count={premiumUsers} color="#b45309" icon="⭐" />
  <Badge label="Pending Prime" count={pendingPrime} color="#ea580c" icon="📋" onClick={onGoPrime} />
  <Badge label="Ungraded Writing" count={ungradedWriting} color="#7c3aed" icon="✍️" onClick={onGoReviews} />
  <Badge label="Ungraded Speaking" count={ungradedSpeaking} color="#059669" icon="🎤" onClick={onGoReviews} />
  </div>
);

export default IeltsAdminBadgeRow;
