import { Icon } from '../../shell/Icon';
import { links } from '../../shell/links';
import { hero as c } from '../copy';
import { DawnScene } from '../hero/DawnScene';
import { Headline } from '../parts/Headline';

/** The companies the product replaces, each in a strong element, joined as "A, B and C" so the commas and the "and" stay regular weight. */
function AltNames({ names }: { names: readonly string[] }) {
  return (
    <>
      {names.map((name, i) => (
        <span key={name}>
          {i === 0 ? '' : i === names.length - 1 ? ' and ' : ', '}
          <strong>{name}</strong>
        </span>
      ))}
    </>
  );
}

/**
 * The first view: the one headline, centred over the dawn scene, whose watched night runs along the horizon below it. The
 * section reaches up under the header, so the sky runs behind the header too.
 */
export function Hero() {
  return (
    <section className="ut-hero" aria-labelledby="hero-title">
      <div className="ut-hero-scene"><DawnScene /></div>
      <div className="ut-wrap ut-hero-copy">
        <h1 id="hero-title"><Headline text={c.title} /></h1>
        <p className="ut-hero-sub">{c.sub}</p>
        <p className="ut-fine ut-hero-alt">{c.alt} <AltNames names={c.altNames} /></p>
        <div className="ut-actions">
          <a className="ut-pill ut-pill--large" href={links.run}>{c.primary}<Icon name="arrow" /></a>
          <a className="ut-link ut-link--large" href={links.demo}>{c.demo}</a>
          <a className="ut-link ut-link--large" href={links.docs}>{c.secondary}</a>
        </div>
      </div>
    </section>
  );
}
