declare module 'react/jsx-runtime' {
  export const Fragment: unique symbol;
  const jsx: (...args: unknown[]) => unknown;
  const jsxs: (...args: unknown[]) => unknown;
  const jsxDEV: (...args: unknown[]) => unknown;
  export { jsx, jsxs, jsxDEV };
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.css';
declare module '*.svg?raw' {
  const content: string;
  export default content;
}

declare namespace React {
  type AnyFunction = (...args: any[]) => any;
  type Dispatch<A> = (value: A) => void;
  type SetStateAction<S> = S | ((prev: S) => S);
  interface Attributes {
    key?: string | number;
  }
  type ReactNode = unknown;
  interface ReactElement<P = unknown> {
    type: unknown;
    props: P;
    key: string | number | null;
  }
  interface FC<P = Record<string, unknown>> {
    (props: P & { children?: ReactNode }): ReactElement | null;
  }
  interface Context<T> {
    Provider: FC<{ value: T }>;
    Consumer: FC<{ children: (value: T) => ReactNode }>;
  }
  interface MutableRefObject<T> {
    current: T;
  }
  interface ErrorInfo {
    componentStack: string;
  }
  interface Component<P = Record<string, unknown>, S = Record<string, unknown>> {
    props: P;
    state: S;
    setState(state: Partial<S>): void;
    componentDidCatch?(error: Error, info: ErrorInfo): void;
    render(): ReactNode;
  }
  interface ComponentClass<P = Record<string, unknown>, S = Record<string, unknown>> {
    new (props: P): Component<P, S>;
    prototype: Component<P, S>;
  }
  interface SVGProps<T> extends Record<string, unknown> {}
  interface SetStateHook<S> {
    (value: SetStateAction<S>): void;
  }
  interface HTMLAttributes<T> extends Record<string, unknown> {}
  interface DetailedHTMLProps<E, T> extends E {}
  interface BaseSyntheticEvent<E = object, C = any, T = any> {
    nativeEvent: E;
    currentTarget: C;
    target: T;
    bubbles: boolean;
    cancelable: boolean;
    defaultPrevented: boolean;
    eventPhase: number;
    isTrusted: boolean;
    preventDefault(): void;
    stopPropagation(): void;
    type: string;
  }
  interface MouseEvent<T = Element, E = globalThis.MouseEvent> extends BaseSyntheticEvent<E, EventTarget & T, EventTarget> {
    altKey: boolean;
    button: number;
    buttons: number;
    clientX: number;
    clientY: number;
    movementX: number;
    movementY: number;
    pageX: number;
    pageY: number;
    screenX: number;
    screenY: number;
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
  }
}

declare module 'react' {
  export type ReactNode = React.ReactNode;
  export type ReactElement<P = unknown> = React.ReactElement<P>;
  export type FC<P = Record<string, unknown>> = React.FC<P>;
  export type Context<T> = React.Context<T>;
  export type MutableRefObject<T> = React.MutableRefObject<T>;
  export type SVGProps<T> = React.SVGProps<T>;
  export type HTMLAttributes<T> = React.HTMLAttributes<T>;
  export type DetailedHTMLProps<E, T> = React.DetailedHTMLProps<E, T>;

  export function createContext<T>(defaultValue: T): Context<T>;
  export function useContext<T>(context: Context<T>): T;
  export function useState<S>(initialState: S | (() => S)): [S, (value: React.SetStateAction<S>) => void];
  export function useReducer<R extends (state: any, action: any) => any, I>(
    reducer: R,
    initialState: I
  ): [ReturnType<R>, (action: Parameters<R>[1]) => void];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useLayoutEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly unknown[]): T;
  export function useRef<T>(initialValue: T | null): MutableRefObject<T | null>;
  export function useTransition(): [boolean, (callback: () => void) => void];
  export function useId(): string;
  export function memo<T extends FC<any>>(component: T): T;
  export type Dispatch<A> = React.Dispatch<A>;
  export type SetStateAction<S> = React.SetStateAction<S>;
  export function forwardRef<T, P = Record<string, unknown>>(
    render: (props: P, ref: MutableRefObject<T | null>) => ReactElement | null
  ): FC<P>;

  interface StrictModeProps {
    children?: ReactNode;
  }
  export const Fragment: unique symbol;
  export const StrictMode: FC<StrictModeProps>;

  class Component<P = Record<string, unknown>, S = Record<string, unknown>> implements React.Component<P, S> {
    constructor(props: P);
    props: P;
    state: S;
    setState(state: Partial<S>): void;
    componentDidCatch?(error: Error, info: React.ErrorInfo): void;
    render(): React.ReactNode;
  }
  export { Component };
  export type ErrorInfo = React.ErrorInfo;

  const ReactDefault: {
    createElement: (...args: unknown[]) => ReactElement;
    Fragment: typeof Fragment;
    StrictMode: typeof StrictMode;
    Component: typeof Component;
  };

  export default ReactDefault;
}

declare module 'react-dom/client' {
  import type { ReactElement } from 'react';
  export interface Root {
    render(children: ReactElement | null): void;
    unmount(): void;
  }
  export function createRoot(container: Element | DocumentFragment): Root;
}


declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: React.HTMLAttributes<unknown>;
  }
  interface Element extends React.ReactElement {}
}

declare global {
  interface Window {
    profile?: unknown;
  }
}
