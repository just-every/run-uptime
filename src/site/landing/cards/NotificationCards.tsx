import { notifications as c } from '../copy';
import { Mark } from '../../shell/Mark';
import { Icon } from '../../shell/Icon';

/** One line of the JSON body, its keys and string values tinted. */
function JsonLine({ line, last }: { line: string; last: boolean }) {
  const pair = /^(\s*)("[^"]*")(: )("[^"]*")(,?)$/.exec(line);
  const end = last ? '' : '\n';
  if (!pair) return <>{line}{end}</>;
  const [, indent, key, colon, value, comma] = pair;
  return <>{indent}<span className="ut-json-key">{key}</span>{colon}<span className="ut-json-string">{value}</span>{comma}{end}</>;
}

/** The same incident told three ways: an email, a chat message and a signed JSON body. No product logos. */
export function NotificationCards() {
  return (
    <figure className="ut-notify" role="img" aria-label={c.label}>
      <div className="ut-card ut-notify-card ut-notify-email">
        <p className="ut-notify-kind"><Icon name="mail" />{c.email.kind}</p>
        <p className="ut-notify-subject"><i className="ut-dot ut-dot--fail" />{c.email.subject}</p>
        <p className="ut-notify-text">{c.email.text}</p>
      </div>
      <div className="ut-card ut-notify-card ut-notify-chat">
        <p className="ut-notify-kind ut-notify-kind--channel"><Icon name="chat" />{c.chat.channel}</p>
        <div className="ut-notify-message">
          <span className="ut-notify-avatar"><Mark /></span>
          <div>
            <p className="ut-notify-sender">{c.chat.sender}</p>
            <p className="ut-notify-subject"><i className="ut-dot ut-dot--pass" />{c.chat.text}</p>
          </div>
        </div>
      </div>
      <div className="ut-notify-card ut-notify-json">
        <p className="ut-notify-kind"><Icon name="braces" />{c.json.kind}</p>
        <pre>{c.json.lines.map((line, index) => <JsonLine key={index} line={line} last={index === c.json.lines.length - 1} />)}</pre>
      </div>
    </figure>
  );
}
