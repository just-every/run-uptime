import { included as c } from '../copy';
import { Icon } from '../../shell/Icon';
import { useReveal } from '../parts/useReveal';

/** The six smaller things Uptime takes care of, each a line icon, a name and one line. */
export function Included() {
  const reveal = useReveal<HTMLUListElement>();
  return (
    <section className="ut-included" id="included" aria-labelledby="included-title">
      <div className="ut-included-head">
        <p className="ut-eyebrow">{c.eyebrow}</p>
        <h2 id="included-title">{c.title}</h2>
      </div>
      <ul className="ut-included-grid" ref={reveal}>
        {c.items.map(item => (
          <li key={item.title} className="ut-card">
            <span className={`ut-included-icon ut-included-icon--${item.icon}`}><Icon name={item.icon} /></span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
