/** A headline's words with its closing full stop in a span of its own, so hero.css can tuck it in against the last letter. It reads exactly as the text. */
export function Headline({ text }: { text: string }) {
  return text.endsWith('.') ? <>{text.slice(0, -1)}<span className="ut-stop">.</span></> : <>{text}</>;
}
