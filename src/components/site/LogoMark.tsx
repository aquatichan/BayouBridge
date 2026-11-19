// The BayouBridge mark: a bridge arch over the bayou, with a small sun.
// Simple enough to read at 16 px; also served as the browser-tab icon (src/app/icon.svg).
export default function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#0B2A4A" />
      <circle cx="24.5" cy="8.5" r="2.2" fill="#F5B544" />
      <path d="M6 19.5 Q16 6.5 26 19.5" stroke="#F2EEE6" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M5.5 19.5 H26.5" stroke="#F2EEE6" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11 19.5 V14.6 M16 19.5 V12.6 M21 19.5 V14.6" stroke="#F2EEE6" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M5.5 24.5 q2.6 -2 5.25 0 t5.25 0 t5.25 0 t5.25 0" stroke="#7DD3FC" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
