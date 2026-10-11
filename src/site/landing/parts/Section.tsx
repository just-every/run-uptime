import type { ReactNode } from 'react';
import { useReveal } from './useReveal';

type SectionProps = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  /** Which side the card takes on a wide screen; the copy takes the other. Phones stack copy first. */
  artSide?: 'left' | 'right';
  /** Anything under the paragraph, such as a short list. */
  extras?: ReactNode;
  /** The section's product card. */
  children: ReactNode;
};

/** One idea: an eyebrow, a heading, a sentence or two, and one small product card beside them. */
export function Section({ id, eyebrow, title, body, artSide = 'right', extras, children }: SectionProps) {
  const reveal = useReveal<HTMLDivElement>();
  return (
    <section className={`ut-sec ut-sec--art-${artSide}`} id={id} aria-labelledby={`${id}-title`}>
      <div className="ut-sec-copy">
        <p className="ut-eyebrow">{eyebrow}</p>
        <h2 id={`${id}-title`}>{title}</h2>
        <p className="ut-sec-body">{body}</p>
        {extras}
      </div>
      <div className="ut-sec-art" ref={reveal}>{children}</div>
    </section>
  );
}
