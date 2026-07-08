const I = ({ children, size = 20, ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {children}
  </svg>
);

export const IconDashboard = (p) => (
  <I {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></I>
);
export const IconPOS = (p) => (
  <I {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2" /></I>
);
export const IconMembers = (p) => (
  <I {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 15.2c2.6.3 4.6 1.9 5.3 4.8" /></I>
);
export const IconTiers = (p) => (
  <I {...p}><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="m3 13 9 5 9-5" /><path d="m3 18 9 5 9-5" strokeOpacity=".4" /></I>
);
export const IconRules = (p) => (
  <I {...p}><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /><path d="M19 5 5 19" /></I>
);
export const IconStore = (p) => (
  <I {...p}><path d="M4 10v10h16V10" /><path d="M2 7l2-4h16l2 4c0 1.5-1.2 3-3 3s-3-1.5-3-3c0 1.5-1.2 3-3 3s-3-1.5-3-3c0 1.5-1.2 3-3 3S2 8.5 2 7Z" /><path d="M9 20v-6h6v6" /></I>
);
export const IconTeam = (p) => (
  <I {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.9-3.4 3.7-5.2 7-5.2s6.1 1.8 7 5.2" /><path d="M19 8h4M21 6v4" strokeWidth="1.6" /></I>
);
export const IconShield = (p) => (
  <I {...p}><path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z" /><path d="m9.5 12 2 2 3.5-4" /></I>
);
export const IconGlobe = (p) => (
  <I {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" /></I>
);
export const IconLogout = (p) => (
  <I {...p}><path d="M14 4h-8a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8" /><path d="M10 12h11" /><path d="m17 8 4 4-4 4" /></I>
);
export const IconPlus = (p) => (
  <I {...p}><path d="M12 5v14M5 12h14" /></I>
);
export const IconSearch = (p) => (
  <I {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></I>
);
export const IconX = (p) => (
  <I {...p}><path d="M6 6l12 12M18 6 6 18" /></I>
);
export const IconChevronRight = (p) => (
  <I {...p}><path d="m9 6 6 6-6 6" /></I>
);
export const IconArrowLeft = (p) => (
  <I {...p}><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></I>
);
export const IconWallet = (p) => (
  <I {...p}><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18" strokeOpacity="0" /><path d="M16 13h.01" strokeWidth="3" /><path d="M17 6V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3" /></I>
);
export const IconCoin = (p) => (
  <I {...p}><circle cx="12" cy="12" r="8.5" /><path d="M9.5 8.5h5.4M9.5 11.5h5.4M10.5 8.5c2 1.6 2.6 4 .8 7l4-.1" /></I>
);
export const IconCheck = (p) => (
  <I {...p}><path d="m5 13 4 4L19 7" /></I>
);
export const IconAlert = (p) => (
  <I {...p}><path d="M12 4 2.5 20h19L12 4Z" /><path d="M12 10v4M12 17h.01" /></I>
);
