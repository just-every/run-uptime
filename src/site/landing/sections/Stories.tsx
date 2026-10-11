import { AssertionCard } from '../cards/AssertionCard';
import { EvidenceCard } from '../cards/EvidenceCard';
import { IncidentCard } from '../cards/IncidentCard';
import { NotificationCards } from '../cards/NotificationCards';
import { TerminalCard } from '../cards/TerminalCard';
import { Cabin } from '../atmosphere/Cabin';
import { checks, evidence, incidents, notifications, ownership } from '../copy';
import { Icon } from '../../shell/Icon';
import { Section } from '../parts/Section';

// The five alternating sections, one idea each, the card switching sides as the page goes down.

export function Evidence() {
  return <Section id="evidence" eyebrow={evidence.eyebrow} title={evidence.title} body={evidence.body}><EvidenceCard /></Section>;
}

export function Incidents() {
  return <Section id="incidents" eyebrow={incidents.eyebrow} title={incidents.title} body={incidents.body} artSide="left"><IncidentCard /></Section>;
}

export function Checks() {
  return <Section id="checks" eyebrow={checks.eyebrow} title={checks.title} body={checks.body}><AssertionCard /></Section>;
}

export function Notifications() {
  return <Section id="notifications" eyebrow={notifications.eyebrow} title={notifications.title} body={notifications.body} artSide="left"><NotificationCards /></Section>;
}

export function Ownership() {
  const points = (
    <ul className="ut-points">
      {ownership.points.map(point => <li key={point.text}><span className="ut-points-icon"><Icon name={point.icon} /></span>{point.text}</li>)}
    </ul>
  );
  return <Section id="ownership" eyebrow={ownership.eyebrow} title={ownership.title} body={ownership.body} extras={points}><Cabin /><TerminalCard /></Section>;
}
