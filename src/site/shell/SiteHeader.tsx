import { Brand } from './Brand';
import { links, type SiteVariant } from './links';

/**
 * The header on every public page: the lockup on the left; Docs, Source and Sign in on the right, in one row on phones too.
 * The run site has no Sign in.
 */
export function SiteHeader({ current, variant = 'instance' }: { current?: 'docs'; variant?: SiteVariant }) {
  return (
    <header className="ut-header">
      <div className="ut-wrap ut-header-row">
        <Brand />
        <nav aria-label="Main">
          <a href={links.docs} aria-current={current === 'docs' ? 'true' : undefined}>Docs</a>
          <a href={links.source}>Source</a>
          {variant === 'instance' && <a className="ut-pill" href={links.signIn}>Sign in</a>}
        </nav>
      </div>
    </header>
  );
}
