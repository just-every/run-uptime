import type { CSSProperties } from 'react';

export type StripCheck = { time: string; state: 'pass' | 'fail' | 'recovered' | 'unknown'; result?: string };

/**
 * A callout over a run of checks, by 1-based position: an optional tinted band behind them and a stem to the callout.
 * `reach` widens the callout by that many columns on each side, so a callout over one check has room for its words.
 */
export type StripMark = { from: number; to: number; tone: 'unknown' | 'rose' | 'green'; title?: string; text: string; band?: boolean; reach?: number };

/**
 * A row of scheduled checks on a thin rail: one dot per check, its time under it and, when given, what it returned.
 * Drawn with a grid, so every callout, stem and band lines up with its checks at any width. Decorative markup: the card
 * that holds it carries the description.
 */
export function Strip({ checks, marks }: { checks: readonly StripCheck[]; marks: readonly StripMark[] }) {
  const results = checks.some(check => check.result);
  return (
    <div className={`ut-strip${results ? ' ut-strip--results' : ''}`} style={{ '--n': checks.length } as CSSProperties}>
      {marks.map(mark => {
        const span = { gridColumn: `${mark.from} / ${mark.to + 1}` };
        const reach = mark.reach ?? 0;
        const wide = { gridColumn: `${Math.max(1, mark.from - reach)} / ${Math.min(checks.length, mark.to + reach) + 1}` };
        return [
          <p key={`callout-${mark.from}`} className={`ut-callout ut-callout--${mark.tone}`} style={wide}>
            {mark.title ? <strong>{mark.title}</strong> : null}
            <span>{mark.text.replace(/ \u2192 /g, '\u00a0\u2192 ')}</span>
          </p>,
          <i key={`stem-${mark.from}`} className={`ut-stem ut-stem--${mark.tone}`} style={span} />,
          mark.band ? <i key={`band-${mark.from}`} className={`ut-band ut-band--${mark.tone}`} style={span} /> : null,
        ];
      })}
      <i className="ut-rail" />
      {checks.map((check, index) => {
        const column = { gridColumn: index + 1 };
        // On a narrow card a long strip labels every other check; the Unknown or failing ones always keep their time.
        const minor = checks.length > 8 && index % 2 === 1 && check.state === 'pass' ? ' is-minor' : '';
        return [
          <i key={`dot-${check.time}`} className={`ut-dot ut-dot--${check.state}`} style={{ ...column, '--i': index } as CSSProperties} />,
          <span key={`time-${check.time}`} className={`ut-strip-time ut-strip-time--${check.state}${minor}`} style={column}>{check.time}</span>,
          check.result ? <span key={`result-${check.time}`} className={`ut-strip-result ut-strip-result--${check.state}`} style={column}>{check.result}</span> : null,
        ];
      })}
    </div>
  );
}
