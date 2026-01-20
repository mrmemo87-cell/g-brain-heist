import React from 'react';
import { useNavigate } from 'react-router-dom';

const AccessDenied: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', color: '#111827' }}>
      <div
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          padding: '4rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '1.5rem',
        }}
      >
        <div
          style={{
            width: '4rem',
            height: '4rem',
            borderRadius: '9999px',
            backgroundColor: '#fee2e2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
          }}
        >
          🚫
        </div>
        <div>
          <p style={{ margin: 0, fontSize: '0.75rem', letterSpacing: '0.2em', color: '#6b7280' }}>
            ACCESS DENIED
          </p>
          <h1 style={{ margin: '0.5rem 0 0', fontSize: '1.75rem', fontWeight: 700 }}>
            IELTS Admin Portal
          </h1>
        </div>
        <p style={{ margin: 0, color: '#4b5563', lineHeight: 1.6 }}>
          You do not have permission to view this page. If you believe this is a mistake, please
          contact support or your administrator.
        </p>
        <button
          type="button"
          onClick={() => navigate('/ielts')}
          style={{
            borderRadius: '9999px',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 600,
            boxShadow: '0 8px 20px rgba(37, 99, 235, 0.25)',
          }}
        >
          Return to IELTS Home
        </button>
      </div>
    </div>
  );
};

export default AccessDenied;
