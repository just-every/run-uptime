import { evidence as c } from '../copy';
import { Strip } from './Strip';

const checks = c.times.map(time => ({ time, state: time === c.unknownAt ? 'unknown' as const : 'pass' as const }));
const unknown = c.times.indexOf(c.unknownAt) + 1;

/** One monitor's last ten scheduled checks: green where a check ran and passed, a hollow ring where none arrived. */
export function EvidenceCard() {
  return (
    <figure className="ut-card ut-evidence" role="img" aria-label={c.label}>
      <div className="ut-monitor">
        <span className="ut-monitor-name">{c.monitor}</span>
        <span className="ut-monitor-meta">{c.schedule}</span>
      </div>
      <Strip checks={checks} marks={[{ from: unknown, to: unknown, reach: 2, tone: 'unknown', title: c.unknownTitle, text: c.unknownText }]} />
    </figure>
  );
}
