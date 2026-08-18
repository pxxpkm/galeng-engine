import type { ReactNode } from "react";

function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconUndo = () => (
  <Icon>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Icon>
);

export const IconRedo = () => (
  <Icon>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h3" />
  </Icon>
);

export const IconSave = () => (
  <Icon>
    <path d="M5 3h11l3 3v15H5z" />
    <path d="M8 3v5h7V3" />
    <path d="M8 21v-8h8v8" />
  </Icon>
);

export const IconPlay = () => (
  <Icon>
    <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconPlus = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const IconCopy = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <rect x="8" y="8" width="12" height="12" rx="1.5" />
    <path d="M4 16V5.5A1.5 1.5 0 0 1 5.5 4H16" />
  </Icon>
);

export const IconTrash = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="m6 7 1 14h10l1-14" />
    <path d="M10 11v6M14 11v6" />
  </Icon>
);

export const IconX = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const IconChevronL = () => (
  <Icon>
    <path d="m15 6-6 6 6 6" />
  </Icon>
);

export const IconChevronR = () => (
  <Icon>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

export const IconChevronDown = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const IconSearch = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Icon>
);

export const IconSettings = () => (
  <Icon>
    <path d="M4 8h10M18 8h2" />
    <circle cx="16" cy="8" r="2" />
    <path d="M4 16h4M12 16h8" />
    <circle cx="10" cy="16" r="2" />
  </Icon>
);

export const IconImage = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m5 18 5-5 3 3 3-3 3 3" />
  </Icon>
);

export const IconChar = () => (
  <Icon>
    <circle cx="12" cy="8" r="4" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Icon>
);

export const IconText = () => (
  <Icon>
    <path d="M5 6h14M5 12h10M5 18h14" />
  </Icon>
);

export const IconMusic = () => (
  <Icon>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </Icon>
);

export const IconMic = () => (
  <Icon>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </Icon>
);

export const IconSe = () => (
  <Icon>
    <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 3h-15L6 16z" />
    <path d="M10 21a2 2 0 0 0 4 0" />
  </Icon>
);

export const IconAmb = () => (
  <Icon>
    <path d="M4 14c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
    <path d="M4 18c2-3 4-3 6 0s4 3 6 0 4-3 6 0" />
  </Icon>
);

export const IconCg = () => (
  <Icon>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
  </Icon>
);

export const IconFilm = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 5v14M17 5v14M3 10h4M3 14h4M17 10h4M17 14h4" />
  </Icon>
);

export const IconFile = () => (
  <Icon>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4" />
  </Icon>
);

export const IconScene = () => (
  <Icon>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="M4 9h16" />
    <path d="m7 5 3 4M12 5l3 4M17 5l3 4" />
  </Icon>
);

export const IconRoute = () => (
  <Icon>
    <path d="M7 4v16" />
    <path d="M7 8h8" />
    <path d="M7 16h8" />
    <circle cx="17" cy="8" r="2" />
    <circle cx="17" cy="16" r="2" />
  </Icon>
);

export const IconExport = () => (
  <Icon>
    <path d="M12 15V3" />
    <path d="m7 8 5-5 5 5" />
    <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </Icon>
);

export const IconNewScene = () => (
  <Icon>
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="M4 9h16" />
    <path d="M12 12v5M9.5 14.5h5" />
  </Icon>
);

export const IconWarning = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M12 3 22 20H2z" />
    <path d="M12 9.5v4.5" />
    <path d="M12 17v.2" />
  </Icon>
);

export const IconQuestion = () => (
  <Icon>
    <path d="M9 9a3 3 0 1 1 4.6 2.5c-1 .6-1.6 1.1-1.6 2.3" />
    <path d="M12 17.5v.2" />
  </Icon>
);
