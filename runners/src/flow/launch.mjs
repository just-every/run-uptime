import {join} from 'node:path';
// All engines use the same authenticated filtering proxy. Engine-specific
// settings prevent direct DNS, speculative requests and UDP peer connections.
export function flowLaunchOptions(engine, {home, proxy} = {}) {
  // Gecko keeps app bookkeeping apart from -profile. Keep both roots in
  // this run's private folder; never consult the owner's Firefox app data.
  // https://github.com/mozilla-firefox/firefox/blob/main/toolkit/xre/nsXREDirProvider.cpp
  if(engine==='firefox'&&!home)throw Error('Firefox requires a private application-data folder');
  const env = {...(engine==='firefox'?{MOZ_APP_DATA:join(home,'firefox-app'),MOZ_LOCAL_APP_DATA:join(home,'firefox-cache')}:{}),HOME: process.env.HOME, ...(home ? {TMPDIR: home} : {}), LANG: 'C.UTF-8',
    ...(process.env.PLAYWRIGHT_BROWSERS_PATH ? {PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH} : {})};
  const options = {headless: true, timeout: 20000, env,
    // WebKit on macOS bypasses loopback if a bypass list is supplied, even
    // an empty one. Omit it entirely; Chromium needs its explicit override.
    ...(proxy ? {proxy: {server: `http://127.0.0.1:${proxy.port}`, username: proxy.username, password: proxy.password, ...(engine==='chromium'?{bypass:'<-loopback>'}:{})}} : {})};
  if (engine === 'chromium') options.args = [
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--disable-quic', '--disable-background-networking', '--disable-component-update', '--no-pings', '--disable-sync', '--no-first-run', '--no-default-browser-check',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--webrtc-ip-handling-policy=disable_non_proxied_udp',
    '--disable-default-apps', '--disable-domain-reliability', '--disable-client-side-phishing-detection', '--safebrowsing-disable-auto-update', '--metrics-recording-only', '--password-store=basic', '--use-mock-keychain',
    '--disable-features=Translate,MediaRouter,OptimizationHints,InterestFeedContentSuggestions,AutofillServerCommunication,PasswordLeakDetection,SafeBrowsing,CertificateTransparencyComponentUpdater'];
  if (engine === 'firefox') options.firefoxUserPrefs = {
    'media.peerconnection.enabled': false, 'media.peerconnection.ice.proxy_only': true,
    'network.proxy.allow_hijacking_localhost': true, 'network.proxy.no_proxies_on': '',
    'network.trr.mode': 5, 'network.dns.disablePrefetch': true, 'network.prefetch-next': false,
    'network.http.speculative-parallel-limit': 0, 'network.http.http3.enable': false,
    'network.captive-portal-service.enabled': false, 'network.connectivity-service.enabled': false,
  };
  return options;
}

// WebRTC and WebTransport are outside the monitored HTTP(S)/WebSocket path.
// Disable their page entry points before scripts run, including child frames.
export function disableDirectTransports() {
  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'mozRTCPeerConnection', 'WebTransport']) {
    Object.defineProperty(globalThis, name, {value: undefined, writable: false, configurable: false});
  }
}
