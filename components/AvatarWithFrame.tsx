import React from 'react';

const sizeClassMap = {
  xs: 'w-6 h-6',
  sm: 'w-8 h-8',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
  xl: 'w-20 h-20',
} as const;

type AvatarSize = keyof typeof sizeClassMap;

const framePaddingMap: Record<AvatarSize, string | null> = {
  xs: 'neon-frame-xs',
  sm: 'neon-frame-sm',
  md: 'neon-frame-md',
  lg: 'neon-frame-lg',
  xl: 'neon-frame-xl',
};

interface AvatarWithFrameProps {
  src?: string | null;
  fallbackSrc?: string;
  alt?: string;
  size?: AvatarSize;
  hasNeonFrame?: boolean;
  hasGlitchTheme?: boolean;
  className?: string;
  imgClassName?: string;
  fallbackFrameClassName?: string;
  onClick?: () => void;
  title?: string;
  tabIndex?: number;
}

const combineClasses = (...classes: Array<string | false | null | undefined>): string => {
  return classes.filter(Boolean).join(' ');
};

const AvatarWithFrame: React.FC<AvatarWithFrameProps> = ({
  src,
  fallbackSrc,
  alt = 'Player avatar',
  size = 'md',
  hasNeonFrame = false,
  hasGlitchTheme = false,
  className,
  imgClassName,
  fallbackFrameClassName = 'border-2 border-slate-700',
  onClick,
  title,
  tabIndex,
}) => {
  const resolvedSrc = src || fallbackSrc || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Agent';
  const sizeClasses = sizeClassMap[size];
  const neonPaddingClass = framePaddingMap[size];
  
  const wrapperClass = combineClasses(
    'inline-flex rounded-full items-center justify-center transition-transform duration-150',
    hasNeonFrame ? combineClasses('neon-frame', neonPaddingClass ?? undefined) : undefined,
    hasGlitchTheme ? 'glitch-frame' : undefined,
    !hasNeonFrame && !hasGlitchTheme ? fallbackFrameClassName : undefined,
    onClick ? 'cursor-pointer' : undefined,
    className,
  );

  const imgClasses = combineClasses(
    'rounded-full object-cover',
    sizeClasses,
    hasNeonFrame ? 'neon-frame-avatar' : undefined,
    hasGlitchTheme ? 'glitch-frame-avatar' : undefined,
    imgClassName,
  );

  return (
    <div
      className={wrapperClass}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? tabIndex ?? 0 : undefined}
      title={title}
    >
      <img src={resolvedSrc} alt={alt} className={imgClasses} />
    </div>
  );
};

export default AvatarWithFrame;
