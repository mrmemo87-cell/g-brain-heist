import React from 'react';

/**
 * Compatibility wrapper kept for portal imports added before localization became global.
 * Language selection and DOM localization now live once in LanguageProvider -> AppLocalizationLayer.
 */
export function PortalLocalizationBoundary({ children }: { children: React.ReactNode; portalName?: string }) {
  return <>{children}</>;
}

export function withPortalLocalization<P extends object>(Component: React.ComponentType<P>, portalName: string) {
  const WrappedPortal: React.FC<P> = (props) => <Component {...props} />;
  WrappedPortal.displayName = `withPortalLocalization(${portalName || Component.displayName || Component.name || 'Portal'})`;
  return WrappedPortal;
}

export default PortalLocalizationBoundary;
