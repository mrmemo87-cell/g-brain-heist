import React from 'react';
import { PROGRAM_ARTWORK, type ProgramArtworkKey } from '../lib/programArtwork';
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
  const artwork = PROGRAM_ARTWORK[program];

  return (
    <section
      className={`program-identity-banner overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950/90 shadow-[0_18px_55px_rgba(2,6,23,0.28)] ${className}`}
      aria-label={`${title} programme`}
    >
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(15rem,34%)] md:items-stretch">
        <div className={`program-identity-banner__copy ${compact ? 'p-4 sm:p-5' : 'p-5 sm:p-6'}`}>
          <p className="m-0 text-[0.68rem] font-black uppercase tracking-[0.14em] text-cyan-300">{eyebrow}</p>
          <h2 className={`mt-1 font-heading font-black tracking-[-0.035em] text-white ${compact ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-3xl'}`}>{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{description}</p>
        </div>
        <div
          className={`program-identity-banner__art grid place-items-center overflow-hidden bg-slate-900 ${compact ? 'min-h-[8.5rem] md:min-h-[9.5rem]' : 'min-h-[10rem] md:min-h-[11.5rem]'}`}
          style={{
            backgroundImage: `linear-gradient(135deg, rgba(239,248,255,.98), rgba(219,238,255,.92)), url("${artwork.src}")`,
            backgroundPosition: 'center, center',
            backgroundRepeat: 'no-repeat, no-repeat',
            backgroundSize: 'cover, contain',
          }}
        >
          <img
            src={artwork.src}
            alt={artwork.alt}
            loading="eager"
            decoding="async"
            className="program-identity-banner__image block h-full w-full max-h-full max-w-full object-contain"
            style={{ objectPosition: artwork.objectPosition }}
          />
        </div>
      </div>
    </section>
  );
};

export default ProgramIdentityBanner;
