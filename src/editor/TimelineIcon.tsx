const paths = {
  add: 'M3 4h14v12H3z M7 10h6 M10 7v6',
  trash: 'M4 5h12 M8 3h4 M6 5l1 12h6l1-12 M9 8v6 M11 8v6',
  up: 'M10 16V4 M5 9l5-5 5 5',
  down: 'M10 4v12 M5 11l5 5 5-5',
  left: 'M16 10H4 M9 5l-5 5 5 5',
  right: 'M4 10h12 M11 5l5 5-5 5',
  split: 'M10 2v16 M3 5h4v10H3z M13 5h4v10h-4z',
  merge: 'M2 5h6v10H2z M12 5h6v10h-6z M7 10h6 M9 8l2 2-2 2',
  auto: 'M10 2l2.2 5.8L18 10l-5.8 2.2L10 18l-2.2-5.8L2 10l5.8-2.2z',
  mute: 'M3 8h3l4-4v12l-4-4H3z M13 7l5 6 M18 7l-5 6',
  volume: 'M3 8h3l4-4v12l-4-4H3z M13 7q3 3 0 6 M15 4q6 6 0 12',
};
export function TimelineIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      className="timeline-icon"
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
