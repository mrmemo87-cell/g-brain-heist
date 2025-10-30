import React from 'react';

// FIX: Update all icon components to accept SVG props, allowing `className` and other attributes to be passed.
export const XPIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3.75H19.5M8.25 6.75H19.5M8.25 9.75H19.5M8.25 12.75H19.5m-11.25-9 3.75 3.75-3.75 3.75m-3.75-3.75h3.75" />
  </svg>
);

export const CoinIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182.553-.44 1.278-.659 2.003-.659s1.45.22 2.003.659l.879.659m7.5 6.446-2.121-2.121m2.121 2.121-2.121 2.121M3 10.446l2.121-2.121m-2.121 2.121 2.121 2.121" />
  </svg>
);

export const StreakIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.362-3.797A8.33 8.33 0 0 1 12 6c1.23 0 2.394.213 3.483.608" />
    <path strokeLinecap="round" strokeLinejoin="round" d="m16.5 8.25-3.75 3.75-1.5-1.5" />
  </svg>
);

export const APIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" />
    </svg>
);

export const ClockIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
);

export const MultiplierIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 4.5 15 15m0 0V8.25m0 11.25H8.25" />
    </svg>
);

export const QuestIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
    </svg>
);

export const HackIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.598.483-1.087 1.087-1.087h.001a1.087 1.087 0 0 1 1.087 1.087v11.826c0 .598-.483 1.087-1.087 1.087h-.001a1.087 1.087 0 0 1-1.087-1.087V6.087ZM6 6.087c0-.598.483-1.087 1.087-1.087h.001a1.087 1.087 0 0 1 1.087 1.087v11.826c0 .598-.483 1.087-1.087 1.087h-.001A1.087 1.087 0 0 1 6 17.913V6.087Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12h12" />
    </svg>
);

export const ShopIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.658-.463 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
);

export const BrainIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM12 12V3m0 9h9m-9 0-9 9" />
    </svg>
);

export const ShieldIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z" />
    </svg>
);

export const BoosterIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 12.75-7.5 7.5-7.5-7.5" />
    </svg>
);

export const CrackerIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M5.834 5.834 4.242 4.242M12 21.75V19.5m-5.834-.166 1.591-1.591M3.75 10.5H6M16.166 20.166l-1.591-1.591" />
    </svg>
);

export const ClanIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M3 6h18M5.25 9.75h13.5M3 13.5h18" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.42 6.262 12 11.25l8.58-4.988" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.58 17.738 12 12.75l-8.58 4.988" />
    </svg>
);

export const PromoteIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
);

export const DemoteIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
);

export const KickIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
);

export const ManageIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-1.007 1.11-1.227l.91-.342c.324-.121.672-.121.996 0l.91.342c.55.22.91.685.91 1.227l-.048.292c-.043.252.02.51.18.708l.62.62c.25.25.62.25.88 0l.43-.43c.25-.25.62-.25.88 0l.43.43c.25.25.62.25.88 0l.43-.43c.25-.25.62-.25.88 0l.43.43c.25.25.62.25.88 0l.62-.62c.16-.2.22-.45.18-.708l-.048-.292c-.09-.542.27-1.007.82-1.227l.91-.342c.324-.121.672-.121.996 0l.91.342c.55.22 1.02.685 1.11 1.227l.048.292c.043.252-.02.51-.18.708l-.62.62c-.25.25-.25.62 0 .88l.43.43c.25.25.25.62 0 .88l-.43.43c-.25.25-.25.62 0 .88l.43.43c-.25.25-.25.62 0 .88l.62.62c.16.2.22.45.18.708l.048.292c.09.542-.27 1.007-.82 1.227l-.91.342c-.324-.121-.672-.121-.996 0l-.91-.342c-.55-.22-1.02-.685-1.11-1.227l-.048-.292c-.043-.252.02-.51.18-.708l.62-.62c.25-.25.25-.62 0-.88l-.43-.43c-.25-.25-.25-.62 0-.88l.43-.43c.25-.25.25-.62 0-.88l-.43-.43c-.25-.25-.25-.62 0-.88l-.62-.62c-.16-.2-.22-.45-.18-.708l.048-.292Zm-7.043 4.06c.09-.542.56-1.007 1.11-1.227l.91-.342c.324-.121.672-.121.996 0l.91.342c.55.22.91.685.91 1.227l-.048.292c-.043.252.02.51.18.708l.62.62c.25.25.62.25.88 0l.43-.43c.25-.25.62-.25.88 0l.43.43c.25.25.62.25.88 0l.43-.43c.25-.25.62-.25.88 0l.43.43c.25.25.62.25.88 0l.62-.62c.16-.2.22-.45.18-.708l-.048-.292c-.09-.542.27-1.007.82-1.227l.91-.342c.324-.121.672-.121.996 0l.91.342c.55.22 1.02.685 1.11 1.227l.048.292c.043.252-.02.51-.18.708l-.62.62c-.25.25-.25.62 0 .88l.43.43c.25.25.25.62 0 .88l-.43.43c-.25.25-.25.62 0 .88l.43.43c-.25.25-.25-.62 0 .88l.62.62c.16.2.22.45.18.708l.048.292c.09.542-.27 1.007-.82 1.227l-.91.342c-.324-.121-.672-.121-.996 0l-.91-.342c-.55-.22-1.02-.685-1.11-1.227l-.048-.292c-.043-.252.02-.51.18-.708l.62-.62c.25-.25.25-.62 0-.88l-.43-.43c-.25-.25-.25-.62 0-.88l.43-.43c-.25-.25-.25-.62 0-.88l-.43-.43c-.25-.25-.25-.62 0-.88l-.62-.62c-.16-.2-.22-.45-.18-.708l.048-.292Z" />
    </svg>
);

export const LeaveIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
    </svg>
);


export const LevelUpIcon = StreakIcon;
export const PvpWinIcon = HackIcon;
export const PvpBlockedIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
);
export const QuestClearedIcon = QuestIcon;
export const PurchaseIcon = ShopIcon;