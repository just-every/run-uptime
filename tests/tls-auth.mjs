import {tlsTrustJourney} from './tls-trust-journey.mjs';
import {apiAuthJourney} from './api-auth-journey.mjs';
import {keywordMonitorJourney} from './keyword-monitor-journey.mjs';
// Choose trust, rotate and revoke local credentials, then retain scheduled keyword evidence.
await tlsTrustJourney();
await apiAuthJourney();
await keywordMonitorJourney();
