import React, { useState } from 'react';

interface VisualFallbackImageProps {
  src: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  imgClassName?: string;
}

const VisualFallbackImage: React.FC<VisualFallbackImageProps> = ({
  src,
  alt,
  className,
  fallback,
  imgClassName,
}) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <>{fallback ?? null}</>;
  }

  return (
    <div className={className}>
      <img
        src={src}
        alt={alt}
        className={imgClassName ?? 'h-full w-full object-cover'}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
};

export default VisualFallbackImage;

