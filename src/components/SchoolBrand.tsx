import React, { useState } from 'react';
import type { SchoolBrand as SchoolBrandValue } from '../lib/schoolBranding';

interface SchoolBrandProps {
  brand: SchoolBrandValue;
  className?: string;
  imageClassName?: string;
  showName?: boolean;
}

/** Compact, failure-safe identity for school-owned application surfaces. */
export const SchoolBrand: React.FC<SchoolBrandProps> = ({ brand, className = '', imageClassName = '', showName = true }) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const logoUrl = brand.logoUrl !== failedUrl ? brand.logoUrl : null;

  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
      {logoUrl ? (
        <img src={logoUrl} alt={`${brand.name} logo`} className={imageClassName} onError={() => setFailedUrl(logoUrl)} />
      ) : (
        <span aria-hidden="true" className={`inline-grid place-items-center rounded-lg bg-slate-700 font-bold text-white ${imageClassName}`}>
          {brand.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      {showName && <span className="truncate">{brand.name}</span>}
    </span>
  );
};
