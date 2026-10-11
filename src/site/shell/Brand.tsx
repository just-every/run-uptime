import { Mark } from './Mark';
import { links } from './links';

/** The lockup: the mark and the "Uptime" wordmark, linking home. */
export function Brand() {
  return (
    <a className="ut-brand" href={links.home}>
      <Mark className="ut-brand-mark" />
      <span className="ut-brand-name">Uptime</span>
    </a>
  );
}
