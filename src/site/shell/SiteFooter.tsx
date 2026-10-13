import { Brand } from './Brand';
import { links, type SiteVariant } from './links';

/** The slim footer on every public page. The run site has no Sign in. */
export function SiteFooter({ variant = 'instance' }: { variant?: SiteVariant }) {
  return (
    <footer className="ut-footer">
      <div className="ut-wrap">
        <div className="ut-footer-row">
          <Brand />
          <p className="ut-footer-tagline">Self-hosted uptime and API monitoring.</p>
          <nav aria-label="Footer">
            <a href={links.docs}>Docs</a>
            <a href={links.source}>Source</a>
            {variant === 'instance' && <a href={links.signIn}>Sign in</a>}
            <span className="ut-footer-licence">MIT licensed</span>
          </nav>
        </div>
      </div>
    </footer>
  );
}
