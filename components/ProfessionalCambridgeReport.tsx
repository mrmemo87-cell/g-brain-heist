import React, { useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';

// ─── Serial Number Generator ─────────────────────────────────────────────────
// Deterministic serial number from record ID + student name + submission date.
// Format: BH-YYYY-XXXXXXXX  (BH = Brains Heist, YYYY = year, 8 hex chars)
// Since it's deterministic, the same inputs always produce the same serial,
// making it verifiable and reprintable.
function generateSerialNumber(recordId: string, studentName: string, submittedAt: string): string {
  const raw = `${recordId}|${studentName}|${submittedAt}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  // Make it positive and pad to 8 hex chars
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const year = new Date(submittedAt).getFullYear() || new Date().getFullYear();
  return `BH-${year}-${hex}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface SkillData {
  correct: number;
  total: number;
  percentage: number;
  icon: string;
}

interface ActionPlanItem {
  title: string;
  tips: string[];
}

export interface ProfessionalReportData {
  // Core student data
  id: string;
  studentName: string;
  studentClass?: string;
  quizName: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  submittedAt: string;
  timeTakenSeconds?: number;
  
  // Analysis data
  skillPerformance: Record<string, SkillData>;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  
  // Computed from helper functions
  grade: string;
  encouragement: { title: string; message: string };
  actionPlanItems: { skill: string; title: string; tips: string[]; percentage: number }[];
  fallbackPlan?: ActionPlanItem;
  personalizedNote: string;
  
  // Optional school/institution branding
  schoolName?: string;
}

interface ProfessionalCambridgeReportProps {
  data: ProfessionalReportData;
  onClose: () => void;
  /** Whether this is the teacher view (shows more detail) vs student view */
  isTeacherView?: boolean;
}

// ─── Helper: format seconds to human-readable time ───────────────────────────
function formatTime(seconds?: number): string {
  if (!seconds || seconds <= 0) return 'N/A';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  }
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

// ─── Main Component ──────────────────────────────────────────────────────────
const ProfessionalCambridgeReport: React.FC<ProfessionalCambridgeReportProps> = ({
  data,
  onClose,
  isTeacherView = false,
}) => {
  // Esc key to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const serial = useMemo(
    () => generateSerialNumber(data.id, data.studentName, data.submittedAt),
    [data.id, data.studentName, data.submittedAt]
  );

  const sortedSkills = useMemo(
    () => Object.entries(data.skillPerformance).sort((a, b) => a[1].percentage - b[1].percentage),
    [data.skillPerformance]
  );

  const weakAreas = useMemo(
    () => sortedSkills.filter(([_, d]) => d.percentage < 70),
    [sortedSkills]
  );

  const gradeColor =
    data.percentage >= 85 ? '#16a34a' :
    data.percentage >= 70 ? '#2563eb' :
    data.percentage >= 55 ? '#d97706' :
    '#dc2626';

  const gradeBg =
    data.percentage >= 85 ? 'linear-gradient(135deg, #22c55e, #059669)' :
    data.percentage >= 70 ? 'linear-gradient(135deg, #3b82f6, #0891b2)' :
    data.percentage >= 55 ? 'linear-gradient(135deg, #f59e0b, #d97706)' :
    'linear-gradient(135deg, #ef4444, #e11d48)';

  const formattedDate = new Date(data.submittedAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const printDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePrint = () => window.print();

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:overflow-visible print:block"
      style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {/* ── Print Styles ─────────────────────────────────────────────── */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 6mm;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }
          body * {
            visibility: hidden;
          }
          .pro-report,
          .pro-report * {
            visibility: visible !important;
          }
          .pro-report {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
          .pro-report .rpt-header {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            padding: 6px 14px !important;
          }
          .pro-report .rpt-student-bar {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            padding: 6px 14px !important;
          }
          .pro-report .rpt-body {
            padding: 8px 14px !important;
            gap: 10px !important;
          }
          .pro-report .rpt-footer {
            padding: 4px 14px !important;
          }
          .pro-report .skill-fill {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .pro-report .grade-badge {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .pro-report .watermark {
            opacity: 0.03 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* ── Report Card ──────────────────────────────────────────────── */}
      <div
        className="pro-report bg-white rounded-xl max-w-5xl w-full shadow-2xl print:rounded-none print:shadow-none print:max-w-none relative overflow-hidden"
        style={{ fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif" }}
      >
        {/* Watermark */}
        <div
          className="watermark absolute inset-0 flex items-center justify-center pointer-events-none select-none"
          style={{ zIndex: 0, opacity: 0.03 }}
        >
          <span style={{ fontSize: '120px', fontWeight: 900, color: '#1e1b4b', transform: 'rotate(-30deg)', letterSpacing: '8px' }}>
            BRAINS HEIST
          </span>
        </div>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="rpt-header relative" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4f46e5 100%)', color: '#fff', padding: '10px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '42px', height: '42px', background: '#fff', borderRadius: '10px', padding: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                <img src="/logo.png" alt="Brains Heist" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: '17px', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Brains Heist</h1>
                <p style={{ margin: 0, fontSize: '10px', color: '#c7d2fe', letterSpacing: '0.5px' }}>Cambridge Assessment Performance Report</p>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '9px', color: '#a5b4fc', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '2px' }}>Report Serial No.</div>
              <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: "'Courier New', Courier, monospace", letterSpacing: '1px', color: '#e0e7ff' }}>
                {serial}
              </div>
            </div>
          </div>
        </div>

        {/* ── Student Info Bar ────────────────────────────────────────── */}
        <div className="rpt-student-bar" style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#fff',
          padding: '8px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `3px solid ${gradeColor}`,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>{data.studentName}</h2>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>
              <span style={{ fontWeight: 600, color: '#cbd5e1' }}>Test:</span> {data.quizName}
              <span style={{ margin: '0 8px', color: '#475569' }}>|</span>
              <span style={{ fontWeight: 600, color: '#cbd5e1' }}>Class:</span> {data.studentClass || 'N/A'}
              <span style={{ margin: '0 8px', color: '#475569' }}>|</span>
              <span style={{ fontWeight: 600, color: '#cbd5e1' }}>Date:</span> {formattedDate}
              <span style={{ margin: '0 8px', color: '#475569' }}>|</span>
              <span style={{ fontWeight: 600, color: '#cbd5e1' }}>Duration:</span> {formatTime(data.timeTakenSeconds)}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>Score</div>
              <div style={{ fontSize: '20px', fontWeight: 800 }}>{data.score}<span style={{ fontSize: '13px', fontWeight: 400, color: '#94a3b8' }}>/{data.totalQuestions}</span></div>
            </div>
            <div className="grade-badge" style={{
              width: '52px',
              height: '52px',
              borderRadius: '12px',
              background: gradeBg,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }}>
              <span style={{ fontSize: '20px', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{data.grade}</span>
              <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>{data.percentage}%</span>
            </div>
          </div>
        </div>

        {/* ── Body: Two-column layout ─────────────────────────────────── */}
        <div className="rpt-body" style={{ position: 'relative', zIndex: 1, padding: '12px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {/* Left Column – Skills Performance */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '14px' }}>📊</span> Skills Breakdown
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {sortedSkills.map(([skill, d]) => (
                  <div key={skill} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '110px', fontSize: '10px', fontWeight: 500, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.icon} {skill}
                    </span>
                    <div style={{ flex: 1, height: '16px', background: '#e2e8f0', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
                      <div
                        className="skill-fill"
                        style={{
                          height: '100%',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          paddingRight: '4px',
                          width: `${Math.max(d.percentage, 15)}%`,
                          background:
                            d.percentage >= 80 ? 'linear-gradient(90deg, #22c55e, #059669)' :
                            d.percentage >= 65 ? 'linear-gradient(90deg, #3b82f6, #0891b2)' :
                            d.percentage >= 50 ? 'linear-gradient(90deg, #f59e0b, #d97706)' :
                            'linear-gradient(90deg, #ef4444, #dc2626)',
                          transition: 'width 0.4s ease',
                        }}
                      >
                        <span style={{ fontSize: '8px', fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{d.percentage}%</span>
                      </div>
                    </div>
                    <span style={{ width: '32px', fontSize: '9px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>{d.correct}/{d.total}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#16a34a' }}>{data.correctCount}</div>
                <div style={{ fontSize: '9px', color: '#166534', fontWeight: 600 }}>Correct</div>
              </div>
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#dc2626' }}>{data.wrongCount}</div>
                <div style={{ fontSize: '9px', color: '#991b1b', fontWeight: 600 }}>Incorrect</div>
              </div>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#d97706' }}>{data.unansweredCount}</div>
                <div style={{ fontSize: '9px', color: '#92400e', fontWeight: 600 }}>Unanswered</div>
              </div>
            </div>

            {/* Focus Areas */}
            {weakAreas.length > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px' }}>
                <h4 style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: 700, color: '#92400e' }}>⚠️ Areas Requiring Attention</h4>
                <ul style={{ margin: 0, paddingLeft: '14px', fontSize: '10px', color: '#78350f', lineHeight: 1.5 }}>
                  {weakAreas.slice(0, 3).map(([skill, d]) => (
                    <li key={skill}><strong>{skill}</strong> — {d.percentage}% ({d.correct}/{d.total} correct)</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Right Column – Action Plan & Encouragement */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '10px', padding: '12px' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 700, color: '#581c87', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '14px' }}>📋</span> Recommended Action Plan
              </h3>
              {data.actionPlanItems.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {data.actionPlanItems.slice(0, 3).map((item, idx) => (
                    <div key={item.skill} style={{ display: 'flex', gap: '8px', padding: '8px', background: '#fff', borderRadius: '8px', border: '1px solid #f3e8ff' }}>
                      <div style={{
                        width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', fontWeight: 700,
                      }}>{idx + 1}</div>
                      <div style={{ minWidth: 0 }}>
                        <h4 style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: '#1e293b' }}>{item.title} ({item.percentage}%)</h4>
                        <p style={{ margin: '2px 0 0', fontSize: '9px', color: '#64748b', lineHeight: 1.4 }}>{item.tips.slice(0, 2).join(' • ')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : data.fallbackPlan ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', gap: '8px', padding: '8px', background: '#fff', borderRadius: '8px', border: '1px solid #f3e8ff' }}>
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '10px', fontWeight: 700,
                    }}>1</div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: '#1e293b' }}>{data.fallbackPlan.title}</h4>
                      <p style={{ margin: '2px 0 0', fontSize: '9px', color: '#64748b', lineHeight: 1.4 }}>{data.fallbackPlan.tips[0]}</p>
                    </div>
                  </div>
                  {data.fallbackPlan.tips.slice(1).map((tip, idx) => (
                    <div key={tip} style={{ display: 'flex', gap: '8px', padding: '8px', background: '#fff', borderRadius: '8px', border: '1px solid #f3e8ff' }}>
                      <div style={{
                        width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                        background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', fontWeight: 700,
                      }}>{idx + 2}</div>
                      <div>
                        <p style={{ margin: 0, fontSize: '9px', color: '#64748b', lineHeight: 1.4 }}>{tip}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Personal Coaching Note */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px' }}>
              <h3 style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#1e40af', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '14px' }}>🎯</span> Personal Coaching Note
              </h3>
              <p style={{ margin: 0, fontSize: '10px', color: '#1e3a5f', lineHeight: 1.5 }}>
                {data.personalizedNote}
              </p>
            </div>

            {/* Encouragement Banner */}
            <div style={{
              borderRadius: '10px',
              padding: '12px',
              textAlign: 'center',
              background: gradeBg,
              color: '#fff',
            }}>
              <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>{data.encouragement.title}</h3>
              <p style={{ margin: '3px 0 0', fontSize: '10px', opacity: 0.95, lineHeight: 1.4 }}>{data.encouragement.message}</p>
            </div>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="rpt-footer" style={{
          padding: '6px 20px',
          borderTop: '2px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8fafc',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <div style={{ fontSize: '9px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700, color: '#1e293b' }}>Serial:</span>
              <span style={{ fontFamily: "'Courier New', Courier, monospace", fontWeight: 600, color: '#4f46e5', letterSpacing: '0.5px' }}>{serial}</span>
              <span style={{ color: '#cbd5e1' }}>|</span>
              <span>This serial number can be used to verify and reprint this report at any time.</span>
            </div>
            <div style={{ fontSize: '8px', color: '#94a3b8' }}>
              Generated: {printDate} • Brains Heist Learning Platform • Confidential
            </div>
          </div>
          <div className="no-print" style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handlePrint}
              style={{
                padding: '6px 14px',
                background: 'linear-gradient(135deg, #22c55e, #059669)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                boxShadow: '0 2px 6px rgba(22,163,74,0.3)',
              }}
            >
              🖨️ Print / Save PDF
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '6px 14px',
                background: '#fee2e2',
                color: '#dc2626',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
              }}
              title="Close (Press Esc)"
            >
              ✕ Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ProfessionalCambridgeReport;
export { generateSerialNumber };
