import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}

export function ArrowLeft(props: IconProps) { return <Icon {...props}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></Icon>; }
export function CalendarDays(props: IconProps) { return <Icon {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></Icon>; }
export function Check(props: IconProps) { return <Icon {...props}><path d="m5 12 4 4L19 6" /></Icon>; }
export function ChevronRight(props: IconProps) { return <Icon {...props}><path d="m9 18 6-6-6-6" /></Icon>; }
export function Clock3(props: IconProps) { return <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>; }
export function GraduationCap(props: IconProps) { return <Icon {...props}><path d="m3 10 9-5 9 5-9 5-9-5Z" /><path d="M7 12.5V17c3 2.2 7 2.2 10 0v-4.5M21 10v6" /></Icon>; }
export function Loader2(props: IconProps) { return <Icon {...props}><path d="M21 12a9 9 0 1 1-2.6-6.4" /></Icon>; }
export function Plus(props: IconProps) { return <Icon {...props}><path d="M12 5v14M5 12h14" /></Icon>; }
export function RefreshCw(props: IconProps) { return <Icon {...props}><path d="M20 6v5h-5M4 18v-5h5" /><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5" /></Icon>; }
export function Search(props: IconProps) { return <Icon {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></Icon>; }
export function Settings2(props: IconProps) { return <Icon {...props}><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4" /></Icon>; }
export function Sparkles(props: IconProps) { return <Icon {...props}><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3ZM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" /></Icon>; }
export function UserRoundCheck(props: IconProps) { return <Icon {...props}><circle cx="9" cy="8" r="4" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 13l2 2 4-4" /></Icon>; }
export function UsersRound(props: IconProps) { return <Icon {...props}><circle cx="9" cy="8" r="4" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 4.5a3.5 3.5 0 0 1 0 7M18 14.5a5 5 0 0 1 4 4.9" /></Icon>; }
export function X(props: IconProps) { return <Icon {...props}><path d="m6 6 12 12M18 6 6 18" /></Icon>; }
