import React from 'react';

export type IconName =
  | 'dashboard' | 'today' | 'tasks' | 'habits' | 'goals' | 'projects' | 'routines'
  | 'calendar' | 'focus' | 'journal' | 'mood' | 'analytics' | 'achievements' | 'notes'
  | 'inbox' | 'search' | 'ai' | 'settings' | 'sun' | 'moon' | 'user' | 'plus' | 'check'
  | 'x' | 'trash' | 'edit' | 'refresh' | 'play' | 'pause' | 'stop' | 'clock' | 'bell'
  | 'menu' | 'chevron-right' | 'chevron-left' | 'chevron-down' | 'arrow-right' | 'arrow-left'
  | 'star' | 'flame' | 'trophy' | 'tag' | 'filter' | 'download' | 'upload' | 'more'
  | 'trend-up' | 'trend-down' | 'lock' | 'unlock' | 'globe' | 'sparkles' | 'target' | 'book'
  | 'zap' | 'shield' | 'layers' | 'clipboard' | 'check-circle' | 'x-circle' | 'mail'
  | 'folder' | 'doc' | 'eye' | 'eye-off' | 'camera' | 'grid' | 'list' | 'chart' | 'wifi' | 'minus'
  | 'monitor' | 'palette' | 'home' | 'sort' | 'chevron-up' | 'repeat' | 'sunrise' | 'compass'
  | 'flag' | 'archive' | 'arrow-up-right' | 'drag';

export const ICONS: Record<IconName, React.ReactNode> = {
  dashboard: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></>,
  today: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /><path d="M12 14l1.5 1.5L16 13" /></>,
  tasks: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /><path d="M3 8l1.5-1.5L6 8" /></>,
  habits: <><circle cx="12" cy="12" r="9" /><path d="M12 3v9l6 4" /></>,
  goals: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  projects: <><path d="M3 4h18v16H3z" /><path d="M8 4v16M3 10h5M8 17h13" /></>,
  routines: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 3" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  focus: <><circle cx="12" cy="12" r="8" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="2" /></>,
  journal: <><path d="M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M9 7h6M9 11h6" /></>,
  mood: <><circle cx="12" cy="12" r="9" /><path d="M8 15c1.5 2 6.5 2 8 0" /><path d="M9 9h.01M15 9h.01" /></>,
  analytics: <><path d="M3 3v18h18" /><rect x="7" y="13" width="3" height="5" /><rect x="12" y="9" width="3" height="9" /><rect x="17" y="5" width="3" height="13" /></>,
  achievements: <><circle cx="12" cy="9" r="5" /><path d="M9 13.5 8 21l4-2 4 2-1-7.5" /><path d="M8 7H4.5M16 7h3.5" /></>,
  notes: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></>,
  inbox: <><path d="M3 13h5l2 3h4l2-3h5v7H3z" /><path d="M3 13V4h18v9" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  ai: <><path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1-4-4 4 4 0 0 1 4-4 4 4 0 0 1 4-4z" /><path d="M12 6v12M6 12h12" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5h0a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  check: <><path d="m5 13 4 4L19 7" /></>,
  x: <><path d="M18 6 6 18M6 6l12 12" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  edit: <><path d="M4 20h4L20 8l-4-4L4 16z" /><path d="m14 6 4 4" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-1.5 6" /><path d="M20 4v7h-7" /></>,
  play: <><path d="M7 5v14l11-7z" /></>,
  pause: <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>,
  stop: <><rect x="6" y="6" width="12" height="12" rx="2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>,
  bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
  menu: <><path d="M3 6h18M3 12h18M3 18h18" /></>,
  'chevron-right': <><path d="m9 5 7 7-7 7" /></>,
  'chevron-left': <><path d="m15 5-7 7 7 7" /></>,
  'chevron-down': <><path d="m5 9 7 7 7-7" /></>,
  'arrow-right': <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  'arrow-left': <><path d="M19 12H5M11 6l-6 6 6 6" /></>,
  star: <><path d="m12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.1L12 17.8l-5.5 3.2 1-6.1L3 9.5l6.3-.9z" /></>,
  flame: <><path d="M12 2s5 4 5 9a5 5 0 1 1-10 0c0-2 1-4 1-4s1 1 2 1c0-3 2-6 2-6z" /></>,
  trophy: <><path d="M8 4h8v6a4 4 0 0 1-8 0z" /><path d="M8 5H4v2a3 3 0 0 0 4 3M16 5h4v2a3 3 0 0 1-4 3M8 16h8M9 20h6M12 14v6" /></>,
  tag: <><path d="M3 3h7l11 11-7 7L3 10z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  filter: <><path d="M3 5h18l-7 8v6l-4 2v-8z" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></>,
  upload: <><path d="M12 15V3M7 8l5-5 5 5M4 21h16" /></>,
  more: <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>,
  'trend-up': <><path d="M3 17l6-6 4 4 8-8M15 7h6v6" /></>,
  'trend-down': <><path d="m3 7 6 6 4-4 8 8M15 17h6v-6" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 1 1 8 0v4" /></>,
  unlock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.7-1.5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></>,
  sparkles: <><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  book: <><path d="M4 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4z" /><path d="M20 4h-7a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h7z" /></>,
  zap: <><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></>,
  shield: <><path d="M12 2 4 5v6c0 5 3.4 9 8 11 4.6-2 8-6 8-11V5z" /></>,
  layers: <><path d="m12 2 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><rect x="9" y="2" width="6" height="4" rx="1" /><path d="M9 11h6M9 15h4" /></>,
  'check-circle': <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  'x-circle': <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  folder: <><path d="M3 5h7l2 3h9v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /></>,
  doc: <><path d="M6 2h8l5 5v15H6z" /><path d="M14 2v5h5" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  'eye-off': <><path d="M3 3l18 18M10.6 6.2A10 10 0 0 1 12 6c6.5 0 10 7 10 7a19 19 0 0 1-3.4 4.4M6.4 8.6A19 19 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.7-1.9" /></>,
  camera: <><path d="M3 7h4l2-3h6l2 3h4v13H3z" /><circle cx="12" cy="13" r="3.5" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1" /></>,
  chart: <><path d="M6 20V10M11 20V5M16 20v-7M21 20H3" /></>,
  wifi: <><path d="M2 9a15 15 0 0 1 20 0M5 13a10 10 0 0 1 14 0M9 17a5 5 0 0 1 6 0" /><circle cx="12" cy="20" r="1" fill="currentColor" /></>,
  minus: <><path d="M5 12h14" /></>,
  monitor: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></>,

  // --- added by the redesign -------------------------------------------
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.3-.5-.7-.5-1.2 0-.8.7-1.5 1.5-1.5H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" /><circle cx="7.5" cy="11.5" r="1" fill="currentColor" /><circle cx="10.5" cy="7.5" r="1" fill="currentColor" /><circle cx="15" cy="8.5" r="1" fill="currentColor" /></>,
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9v11h14V9" /><path d="M9.5 20v-6h5v6" /></>,
  sort: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
  'chevron-up': <><path d="m5 15 7-7 7 7" /></>,
  repeat: <><path d="m17 2 3 3-3 3" /><path d="M20 5H8a4 4 0 0 0-4 4v1" /><path d="m7 22-3-3 3-3" /><path d="M4 19h12a4 4 0 0 0 4-4v-1" /></>,
  sunrise: <><path d="M12 3v5M5.6 9.6 7 11M18.4 9.6 17 11" /><path d="M2 17h20" /><path d="M8 17a4 4 0 0 1 8 0" /><path d="m9 21 3-2 3 2" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 5h11l-2 3 2 3H5" /></>,
  archive: <><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" /><path d="M10 12h4" /></>,
  'arrow-up-right': <><path d="M7 17 17 7M8 7h9v9" /></>,
  drag: <><circle cx="9" cy="6" r="1.3" fill="currentColor" /><circle cx="15" cy="6" r="1.3" fill="currentColor" /><circle cx="9" cy="12" r="1.3" fill="currentColor" /><circle cx="15" cy="12" r="1.3" fill="currentColor" /><circle cx="9" cy="18" r="1.3" fill="currentColor" /><circle cx="15" cy="18" r="1.3" fill="currentColor" /></>,
};

export function Icon({ name, size = 18, className, strokeWidth = 1.8 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}