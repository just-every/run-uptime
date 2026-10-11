import { links } from '../../shell/links';
import { plainly as c } from '../copy';
import { Icon } from '../../shell/Icon';
import { MoonChip } from '../atmosphere/MoonChip';

/** A small, quiet note of what Uptime leaves out, linking to the full list, under a crescent moon: the night still to come. */
export function Plainly() {
  return (
    <aside className="ut-plainly" aria-labelledby="plainly-title">
      <div className="ut-card ut-plainly-card">
        <MoonChip />
        <div>
          <h2 id="plainly-title">{c.title}</h2>
          <p>{c.text}</p>
        </div>
        <a className="ut-link ut-plainly-link" href={links.limits}>{c.link}<Icon name="arrow" /></a>
      </div>
    </aside>
  );
}
