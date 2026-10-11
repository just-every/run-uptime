import { checks as c } from '../copy';
import { Icon } from '../../shell/Icon';

/** A health check with its three passing assertions, and a heartbeat that reported in. */
export function AssertionCard() {
  return (
    <figure className="ut-assert" role="img" aria-label={c.label}>
      <div className="ut-card ut-assert-card">
        <p className="ut-assert-request"><span className="ut-assert-method">{c.method}</span><span className="ut-assert-url">{c.url}</span></p>
        <ul className="ut-assert-list">
          {c.assertions.map(assertion => (
            <li key={assertion}><span className="ut-assert-pass"><Icon name="check" /></span>{assertion}</li>
          ))}
        </ul>
      </div>
      <div className="ut-card ut-heartbeat">
        <span className="ut-heartbeat-icon"><Icon name="pulse" /></span>
        <p><strong>{c.heartbeat.name}</strong>{' · '}<span>{c.heartbeat.text}</span></p>
        <i className="ut-dot ut-dot--pass" />
      </div>
    </figure>
  );
}
