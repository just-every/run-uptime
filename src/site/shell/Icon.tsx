// Line icons for the landing, drawn on a 24px grid in the current colour. Always decorative: the words beside them carry
// the meaning.
const paths = {
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  cloud: 'M7 18.5h10.5a4.5 4.5 0 0 0 .7-8.95A6 6 0 0 0 6.6 10.3 4.1 4.1 0 0 0 7 18.5Z',
  server: 'M5 4h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM5 13h14a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2ZM7 7.5h.01M7 16.5h.01',
  export: 'M12 4v10.5M7.5 10 12 14.5 16.5 10M4 15.5V19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3.5',
  calendar: 'M6 5h12a2.5 2.5 0 0 1 2.5 2.5v10.5a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V7.5A2.5 2.5 0 0 1 6 5ZM3.5 10h17M8 3v4M16 3v4M10.5 13.5V17M13.5 13.5V17',
  play: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18ZM10 8.6l5.4 3.4-5.4 3.4Z',
  pulse: 'M3 12.5h4l2.2-5.5 4.2 10.5 2.2-5h5.4',
  pin: 'M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11ZM12 7.7a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6Z',
  seal: 'M12 3 5 6v5.5c0 4.6 3 7.8 7 9.5 4-1.7 7-4.9 7-9.5V6ZM9 12l2.2 2.2L15.3 10',
  restore: 'M4.2 13.5A8 8 0 1 0 6.3 6.4M4 4v4.5h4.5M12 8v4.2l2.8 1.8',
  mail: 'M5.5 5.5h13A2.5 2.5 0 0 1 21 8v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16V8a2.5 2.5 0 0 1 2.5-2.5ZM4 7.5l8 6 8-6',
  chat: 'M5.5 4.5h13A2.5 2.5 0 0 1 21 7v7.5a2.5 2.5 0 0 1-2.5 2.5H12l-4.5 3.5V17h-2A2.5 2.5 0 0 1 3 14.5V7a2.5 2.5 0 0 1 2.5-2.5Z',
  braces: 'M9 4H8a2 2 0 0 0-2 2v3.5A2.5 2.5 0 0 1 3.5 12 2.5 2.5 0 0 1 6 14.5V18a2 2 0 0 0 2 2h1M15 4h1a2 2 0 0 1 2 2v3.5a2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0-2.5 2.5V18a2 2 0 0 1-2 2h-1',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className ? `ut-icon ${className}` : 'ut-icon'} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={paths[name]} />
    </svg>
  );
}
