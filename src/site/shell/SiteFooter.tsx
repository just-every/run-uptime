import { Brand } from './Brand';
import { links } from './links';

/** The slim footer on every public page. */
export function SiteFooter() {
  return (
    <footer className="ut-footer">
      <div className="ut-wrap">
        <div className="ut-footer-row">
          <Brand />
          <p className="ut-footer-tagline">Self-hosted uptime and API monitoring.</p>
          <nav aria-label="Footer">
            <a href={links.docs}>Docs</a>
            <a href={links.source}>Source</a>
            <a href={links.signIn}>Sign in</a>
            <span className="ut-footer-licence">MIT licensed</span>
          </nav>
        </div>
      </div>
    </footer>
  );
}
