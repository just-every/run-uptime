/** The docs' signature under a title: a short row of green checks on a rail, one of them a hollow Unknown ring. */
export function TitleDots() {
  const dots = [0, 1, 2, 3, 4, 5, 6];
  return (
    <svg className="docs-title-dots" viewBox="0 0 116 12" width="116" height="12" aria-hidden="true" focusable="false">
      <line x1="6" y1="6" x2="110" y2="6" stroke="#d6d8ec" strokeWidth="1.5" />
      {dots.map(index => index === 4
        ? <circle key={index} cx={6 + index * 17.33} cy="6" r="4.1" fill="#fff" stroke="#8a8fa8" strokeWidth="1.6" />
        : <circle key={index} cx={6 + index * 17.33} cy="6" r="4.6" fill="#3fae7a" />)}
    </svg>
  );
}
