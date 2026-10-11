import { incidents as c } from '../copy';
import { Strip } from './Strip';

const first = (state: string) => c.checks.findIndex(check => check.state === state) + 1;
const last = (state: string) => c.checks.length - [...c.checks].reverse().findIndex(check => check.state === state);

/** Seven checks: three failures in a row open an incident, two passes close it, and each keeps what it returned. */
export function IncidentCard() {
  return (
    <figure className="ut-card ut-incident" role="img" aria-label={c.label}>
      <Strip
        checks={c.checks}
        marks={[
          { from: first('fail'), to: last('fail'), tone: 'rose', text: c.opened, band: true },
          { from: first('recovered'), to: last('recovered'), tone: 'green', text: c.recovered, band: true },
        ]}
      />
    </figure>
  );
}
