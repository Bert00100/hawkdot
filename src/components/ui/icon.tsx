import type { ReactNode } from "react";

export type IconName =
    | "grid"
    | "pulse"
    | "server"
    | "bell"
    | "team"
    | "settings"
    | "help"
    | "search"
    | "plus"
    | "more"
    | "globe"
    | "lock"
    | "wifi"
    | "check"
    | "warning"
    | "clock"
    | "arrow"
    | "refresh"
    | "chevron"
    | "trash"
    | "pause"
    | "play"
    | "logout"
    | "close"
    | "eye";

const paths: Record<IconName, ReactNode> = {
    grid: (
        <>
            <rect x="3" y="3" width="7" height="7" rx="2" />
            <rect x="14" y="3" width="7" height="7" rx="2" />
            <rect x="3" y="14" width="7" height="7" rx="2" />
            <rect x="14" y="14" width="7" height="7" rx="2" />
        </>
    ),
    pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
    server: (
        <>
            <rect x="3" y="4" width="18" height="6" rx="2" />
            <rect x="3" y="14" width="18" height="6" rx="2" />
            <path d="M7 7h.01M7 17h.01" />
        </>
    ),
    bell: (
        <>
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M10 21h4" />
        </>
    ),
    team: (
        <>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
        </>
    ),
    settings: (
        <>
            <circle cx="12" cy="12" r="3" />
            <path d="M19 13.5V10l-2-.7-.8-1.8.9-2-2.6-1.5-1.4 1.6h-2L9.5 4 7 5.5l.8 2-.9 1.8L5 10v4l2 .7.8 1.8-.8 2 2.5 1.5 1.5-1.6h2l1.5 1.6 2.5-1.5-.8-2 .8-1.8Z" />
        </>
    ),
    help: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.8 9a2.4 2.4 0 1 1 3.6 2c-.9.6-1.4 1-1.4 2M12 17h.01" />
        </>
    ),
    search: (
        <>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
        </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    more: (
        <>
            <circle cx="5" cy="12" r="1" fill="currentColor" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
            <circle cx="19" cy="12" r="1" fill="currentColor" />
        </>
    ),
    globe: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </>
    ),
    lock: (
        <>
            <rect x="5" y="10" width="14" height="10" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>
    ),
    wifi: (
        <>
            <path d="M5 12a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />
            <circle cx="12" cy="20" r=".7" fill="currentColor" />
        </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    warning: (
        <>
            <path d="M10.3 3.7 2.2 18A2 2 0 0 0 4 21h16a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4M12 17h.01" />
        </>
    ),
    clock: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
        </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    refresh: (
        <>
            <path d="M20 6v5h-5M4 18v-5h5M18 9a7 7 0 0 0-12-2L4 11M6 15a7 7 0 0 0 12 2l2-4" />
        </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    trash: (
        <>
            <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-8 0 1 13a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-13" />
        </>
    ),
    pause: (
        <>
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
        </>
    ),
    play: <path d="M6 4.5v15l13-7.5Z" />,
    logout: (
        <>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5M21 12H9" />
        </>
    ),
    close: <path d="M18 6 6 18M6 6l12 12" />,
    eye: (
        <>
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
        </>
    ),
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
    return (
        <svg
            aria-hidden="true"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {paths[name]}
        </svg>
    );
}
