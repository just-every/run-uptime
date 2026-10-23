// This preload configures the test browser's certificate trust, never the app
// or the user's keychain. Only the generated fixture certificate's SPKI matches.
import {chromium} from 'playwright';
const fingerprint=process.env.UPTIME_TEST_TRUST_SPKI;
if(!/^[A-Za-z0-9+/]{43}=$/.test(fingerprint??''))throw Error('Missing fixture certificate trust');
const launch=chromium.launch.bind(chromium);
chromium.launch=options=>launch({...options,args:[...(options.args??[]),'--ignore-certificate-errors-spki-list='+fingerprint]});
