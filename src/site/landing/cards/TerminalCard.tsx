import { Fragment } from 'react';
import { ownership as c } from '../copy';

/** A command, allowed to wrap after each slash so a long address breaks at a sensible place on a phone. */
function Command({ text }: { text: string }) {
  return <>{text.split('/').map((part, index, parts) => <Fragment key={index}>{part}{index < parts.length - 1 ? <>/<wbr /></> : null}</Fragment>)}</>;
}

/** The commands that start your own installation. */
export function TerminalCard() {
  return (
    <figure className="ut-terminal" role="img" aria-label={c.label}>
      <div className="ut-terminal-bar"><i /><i /><i /></div>
      <pre>{c.commands.map(command => <span key={command} className="ut-terminal-line"><span className="ut-terminal-prompt">$</span><Command text={command} /></span>)}</pre>
    </figure>
  );
}
