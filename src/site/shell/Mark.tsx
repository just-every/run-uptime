/**
 * Uptime's mark: a dial open at the top, with the marked stretch at 12 o'clock peach, the hours you slept through
 * and the honest gap Uptime never paints green. Decorative wherever it sits beside the "Uptime" word.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" width="32" height="32" fill="none" aria-hidden="true" focusable="false">
      <path d="M24.49 9.83A10.5 10.5 0 1 1 7.51 9.83" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M11.73 6.41A10.5 10.5 0 0 1 20.27 6.41" stroke="#e8894f" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
