import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface RouteObject {
  path: string;
  element: React.ReactNode;
}

interface RouteMatch {
  element: React.ReactNode | null;
  params: Record<string, string>;
}

interface RouterContextValue {
  pathname: string;
  params: Record<string, string>;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

class SimpleBrowserRouter {
  routes: RouteObject[];

  constructor(routes: RouteObject[]) {
    this.routes = routes;
  }
}

const RouterContext = createContext<RouterContextValue | null>(null);

const normalizePath = (value: string) => {
  if (value === '/') return '/';
  return value.replace(/\/+$/, '').replace(/^\//, '') ? `/${value.replace(/\/+$/, '').replace(/^\//, '')}` : '/';
};

const splitSegments = (path: string) => {
  if (path === '/' || !path) return [];
  return path.replace(/^\//, '').replace(/\/+$/, '').split('/');
};

const matchRoute = (pathPattern: string, pathname: string): RouteMatch | null => {
  if (pathPattern === '*') {
    return { element: null, params: {} };
  }

  const normalizedPattern = normalizePath(pathPattern);
  const normalizedPath = normalizePath(pathname);

  const patternSegments = splitSegments(normalizedPattern);
  const pathSegments = splitSegments(normalizedPath);

  if (patternSegments.length !== pathSegments.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternSegments.length; i += 1) {
    const patternSegment = patternSegments[i];
    const pathSegment = pathSegments[i];

    if (patternSegment.startsWith(':')) {
      const paramName = patternSegment.slice(1);
      params[paramName] = decodeURIComponent(pathSegment);
      continue;
    }

    if (patternSegment !== pathSegment) {
      return null;
    }
  }

  return { element: null, params };
};

const resolveRoute = (routes: RouteObject[], pathname: string) => {
  for (const route of routes) {
    const match = matchRoute(route.path, pathname);
    if (match) {
      return { element: route.element, params: match.params };
    }
  }

  const wildcard = routes.find((route) => route.path === '*');
  if (wildcard) {
    return { element: wildcard.element, params: {} };
  }

  return { element: null, params: {} };
};

interface RouterProviderProps {
  router: SimpleBrowserRouter;
}

export const RouterProvider: React.FC<RouterProviderProps> = ({ router }) => {
  const [state, setState] = useState(() => {
    const currentPath = window.location.pathname || '/';
    return { pathname: currentPath, ...resolveRoute(router.routes, currentPath) };
  });

  const updatePath = useCallback(
    (nextPath: string, options?: { replace?: boolean }) => {
      const targetPath = nextPath.startsWith('/') ? nextPath : `/${nextPath}`;
      if (options?.replace) {
        window.history.replaceState(null, '', targetPath);
      } else {
        window.history.pushState(null, '', targetPath);
      }
      setState({ pathname: targetPath, ...resolveRoute(router.routes, targetPath) });
    },
    [router.routes]
  );

  useEffect(() => {
    const handlePopState = () => {
      const currentPath = window.location.pathname || '/';
      setState({ pathname: currentPath, ...resolveRoute(router.routes, currentPath) });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [router.routes]);

  const contextValue = useMemo<RouterContextValue>(
    () => ({ pathname: state.pathname, params: state.params, navigate: updatePath }),
    [state.pathname, state.params, updatePath]
  );

  return <RouterContext.Provider value={contextValue}>{state.element}</RouterContext.Provider>;
};

export const createBrowserRouter = (routes: RouteObject[]) => new SimpleBrowserRouter(routes);

export const useNavigate = () => {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error('useNavigate must be used within a RouterProvider');
  }
  return ctx.navigate;
};

export const useParams = <T extends Record<string, string> = Record<string, string>>() => {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error('useParams must be used within a RouterProvider');
  }
  return ctx.params as T;
};

interface NavigateProps {
  to: string;
  replace?: boolean;
}

export const Navigate: React.FC<NavigateProps> = ({ to, replace }) => {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace });
  }, [navigate, to, replace]);
  return null;
};

export const Link: React.FC<React.PropsWithChildren<{ to: string; className?: string }>> = ({ to, children, className }) => {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={className}
      onClick={(event) => {
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </button>
  );
};
