import { ownership as c } from '../copy';

/**
 * A command that wraps only between words (never at a hyphen, as in "run-" / "uptime"), keeps the installer's
 * `install.sh | sh` together, and may break after the installer's host on a phone.
 */
function Command({ text }: { text: string }) {
  return <>{text.split(/(\S*install\.sh \| sh|\S+)/).map((part, index) => {
    const pipe = /^(.*\/)(install\.sh \| sh)$/.exec(part);
    if (pipe) return <span key={index}><span className="ut-terminal-word">{pipe[1]}</span><wbr /><span className="ut-terminal-word">{pipe[2]}</span></span>;
    return part.trim() ? <span key={index} className="ut-terminal-word">{part}</span> : part;
  })}</>;
}

/** The command that starts your own installation, and the alternative for people who already have Node. */
export function TerminalCard() {
  return (
    <figure className="ut-terminal" role="img" aria-label={c.label}>
      <div className="ut-terminal-bar"><i /><i /><i /></div>
      <pre>
        {c.commands.map(command => <span key={command} className="ut-terminal-line"><span className="ut-terminal-prompt">$</span><Command text={command} /></span>)}
        <span className="ut-terminal-line ut-terminal-comment"><span className="ut-terminal-prompt">#</span><Command text={c.alternative} /></span>
      </pre>
    </figure>
  );
}
