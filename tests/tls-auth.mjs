import {tlsTrustJourney} from './tls-trust-journey.mjs';
import {apiAuthJourney} from './api-auth-journey.mjs';
import {keywordMonitorJourney} from './keyword-monitor-journey.mjs';
import {proveResponseBodyLimit} from './network-response-body-limit-support.mjs';
// Choose trust, rotate and revoke local credentials, then retain scheduled keyword evidence.
await tlsTrustJourney();
await apiAuthJourney();
await keywordMonitorJourney();
await proveResponseBodyLimit();
