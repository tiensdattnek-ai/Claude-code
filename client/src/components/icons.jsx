/* Inline SVG icon set — crisp, stroke-based, currentColor. */
const S = (props) => ({
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  viewBox: '0 0 24 24',
  'aria-hidden': true,
  ...props,
});

const I = {
  spark: (p) => (
    <svg {...S(p)}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </svg>
  ),
  plus: (p) => (
    <svg {...S(p)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  search: (p) => (
    <svg {...S(p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  ),
  trash: (p) => (
    <svg {...S(p)}>
      <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  ),
  send: (p) => (
    <svg {...S(p)}>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  ),
  stop: (p) => (
    <svg {...S(p)}>
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
    </svg>
  ),
  close: (p) => (
    <svg {...S(p)}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  ),
  menu: (p) => (
    <svg {...S(p)}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  ),
  moon: (p) => (
    <svg {...S(p)}>
      <path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />
    </svg>
  ),
  sun: (p) => (
    <svg {...S(p)}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  lock: (p) => (
    <svg {...S(p)}>
      <rect x="4" y="11" width="16" height="10" rx="2.5" />
      <path d="M8 11V7a4 4 0 018 0v4" />
      <circle cx="12" cy="16" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  ),
  user: (p) => (
    <svg {...S(p)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  ),
  logout: (p) => (
    <svg {...S(p)}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
  copy: (p) => (
    <svg {...S(p)}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  ),
  check: (p) => (
    <svg {...S(p)}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  download: (p) => (
    <svg {...S(p)}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  ),
  term: (p) => (
    <svg {...S(p)}>
      <rect x="2" y="4" width="20" height="16" rx="3" />
      <path d="M6 9l3 3-3 3M11 15h7" />
    </svg>
  ),
  pencil: (p) => (
    <svg {...S(p)}>
      <path d="M17 3a2.8 2.8 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  ),
  chat: (p) => (
    <svg {...S(p)}>
      <path d="M21 11.5a8.4 8.4 0 01-8.5 8.3c-1.5 0-2.9-.4-4.2-1L3 20l1.2-5.3A8.3 8.3 0 1111.5 3 8.4 8.4 0 0121 11.5z" />
    </svg>
  ),
  bolt: (p) => (
    <svg {...S(p)}>
      <path d="M13 2L3 14h8l-1 8 11-13h-8l0-7z" />
    </svg>
  ),
  arrowDown: (p) => (
    <svg {...S(p)}>
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  ),
  mic: (p) => (
    <svg {...S(p)}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0014 0M12 17v4M8 21h8" />
    </svg>
  ),
  warn: (p) => (
    <svg {...S(p)}>
      <path d="M12 3L2 20h20L12 3z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  ),
  refresh: (p) => (
    <svg {...S(p)}>
      <path d="M21 12a9 9 0 11-2.6-6.3M21 3v6h-6" />
    </svg>
  ),
  clock: (p) => (
    <svg {...S(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  ),
  bot: (p) => (
    <svg {...S(p)}>
      <rect x="5" y="8" width="14" height="12" rx="3" />
      <path d="M12 4v4M9 1h6M9 13h.01M15 13h.01M9 17h6" />
    </svg>
  ),
  chevronL: (p) => (
    <svg {...S(p)}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
  gear: (p) => (
    <svg {...S(p)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.6 1.6 0 00.3 1.7l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.7-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.7.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.7 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.7l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.7.3h0a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5h0a1.6 1.6 0 001.7-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.7v0a1.6 1.6 0 001.5 1h.1a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" />
    </svg>
  ),
};

const Ico = ({ name, size = 18, ...rest }) => {
  const C = I[name] || I.spark;
  return <span className="ico" style={{ width: size, height: size, fontSize: size }}>{C({ width: size, height: size, ...rest })}</span>;
};

export default Ico;
