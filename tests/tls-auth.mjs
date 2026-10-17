import {test} from 'node:test';
import {tlsTrustJourney} from './tls-trust-journey.mjs';
import {apiAuthJourney} from './api-auth-journey.mjs';
test('owner-reviewed TLS trust is socket-bound, labelled, portable and never grants request authority',tlsTrustJourney);
test('claimed authenticated checks support Digest, OAuth, signed JWT and mTLS with local lifecycle custody',apiAuthJourney);
