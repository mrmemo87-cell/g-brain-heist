import React from 'react';
import { resolveRivalryAssetSrc, scheduleRivalryAssetProbe } from './rivalryAssets';

interface RivalryImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  lowPriority?: boolean;
  eager?: boolean;
}

const RivalryImage: React.FC<RivalryImageProps> = ({ src = '', lowPriority = false, eager = false, loading, decoding, fetchPriority, ...rest }) => {
  const [resolvedSrc, setResolvedSrc] = React.useState(src);

  React.useEffect(() => {
    let cancelled = false;
    setResolvedSrc(src);

    if (!src) return;

    if (lowPriority) {
      scheduleRivalryAssetProbe(src);
    }

    void resolveRivalryAssetSrc(src).then((nextSrc) => {
      if (!cancelled) setResolvedSrc(nextSrc);
    });

    return () => {
      cancelled = true;
    };
  }, [lowPriority, src]);

  return (
    <img
      src={resolvedSrc}
      loading={loading || (eager ? 'eager' : 'lazy')}
      decoding={decoding || 'async'}
      fetchPriority={fetchPriority || (eager ? 'high' : 'low')}
      {...rest}
    />
  );
};

export default RivalryImage;
