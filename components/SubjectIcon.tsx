import React from 'react';
import { getSubjectIconPath } from '../src/lib/subjectIcons';

interface SubjectIconProps {
  subject?: string | null;
  size?: number;
  className?: string;
  fallback?: React.ReactNode;
  alt?: string;
}

const SubjectIcon: React.FC<SubjectIconProps> = ({
  subject,
  size = 44,
  className = '',
  fallback = null,
  alt,
}) => {
  const src = getSubjectIconPath(subject);

  if (!src) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <img
      src={src}
      width={size}
      height={size}
      className={className}
      alt={alt ?? ''}
      aria-hidden={alt ? undefined : true}
      loading="lazy"
      draggable={false}
    />
  );
};

export default SubjectIcon;
