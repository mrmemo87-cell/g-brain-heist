import React from 'react';
import { type ProgramArtworkKey } from '../lib/programArtwork';
import ProgramMark from './ProgramMark';
import '../../components/school-admin/schoolAdminContrastSurfaces.css';

type ProgramIdentityBannerProps = {
  program: ProgramArtworkKey;
  eyebrow: string;
  title: string;
  description: string;
  compact?: boolean;
  className?: string;
};

const ProgramIdentityBanner: React.FC<ProgramIdentityBannerProps> = ({
  program,
  eyebrow,
  title,
  description,
  compact = false,
  className = '',
}) => {
  return (
    <section
      className={`program-identity-banner overflow-hidden rounded-2xl border border-slate-200 bg-white ${className}`}
      aria-label={`${title} programme`}
    >
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(15rem,34%)] md:items-stretch">
        <div className={`program-identity-banner__copy ${compact ? 'p-4 sm:p-5' : 'p-5 sm:p-6'}`}>
          <p className="m-0 text-[0.68rem] font-black uppercase tracking-[0.14em] text-slate-500">{eyebrow}</p>
          <h2 className={`mt-1 font-heading font-black tracking-[-0.02em] text-slate-900 ${compact ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'}`}>{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <ProgramMark program={program} className="program-identity-banner__art" style={{ minHeight: compact ? '6rem' : '7rem', justifyContent: 'center' }} />
      </div>
    </section>
  );
};

export default ProgramIdentityBanner;
