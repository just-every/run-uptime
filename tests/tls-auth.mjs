import {tlsTrustJourney} from './tls-trust-journey.mjs';
import {apiAuthJourney} from './api-auth-journey.mjs';
// One authenticated-target lifecycle: choose trust, run, rotate and revoke local credentials.
await tlsTrustJourney();
await apiAuthJourney();
