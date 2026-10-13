import { SiteFooter } from '../shell/SiteFooter';
import { SiteFrame } from '../shell/SiteFrame';
import { SiteHeader } from '../shell/SiteHeader';
import { Horizon } from './atmosphere/Horizon';
import { Closing } from './sections/Closing';
import { Hero } from './sections/Hero';
import { Included } from './sections/Included';
import { Plainly } from './sections/Plainly';
import { Checks, Evidence, Incidents, Notifications, Ownership } from './sections/Stories';
import './styles';

/**
 * The approved homepage, served at `/` of the run site (src/site/pages.tsx); an installed instance serves the Lobby there.
 * A watched night turning into a quiet dawn. It reads no installation data, loads only same-origin files and sets no
 * cookies.
 */
export function Landing() {
  return (
    <SiteFrame className="ut-home">
      <SiteHeader variant="site" />
      <main id="main">
        <Hero />
        <div className="ut-wrap ut-home-sections">
          <Evidence />
          <Incidents />
          <Checks />
          <Horizon />
          <Notifications />
          <Ownership />
          <Included />
          <Plainly />
        </div>
        <Closing />
      </main>
      <SiteFooter variant="site" />
    </SiteFrame>
  );
}
