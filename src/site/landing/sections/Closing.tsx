import { links } from '../../shell/links';
import { closing as c } from '../copy';
import { DawnScene } from '../hero/DawnScene';
import { Headline } from '../parts/Headline';
import { Icon } from '../../shell/Icon';

/** The close: the same lake with the sun fully risen, and one last invitation. */
export function Closing() {
  return (
    <section className="ut-closing" aria-labelledby="closing-title">
      <div className="ut-closing-scene"><DawnScene variant="risen" /></div>
      <div className="ut-wrap ut-closing-copy">
        <h2 id="closing-title"><Headline text={c.title} /></h2>
        <p className="ut-closing-sub">{c.sub}</p>
        <div className="ut-actions">
          <a className="ut-pill ut-pill--large" href={links.run}>{c.primary}<Icon name="arrow" /></a>
          <a className="ut-link ut-link--large" href={links.docs}>{c.secondary}</a>
        </div>
        <p className="ut-fine">{c.fine}</p>
      </div>
    </section>
  );
}
