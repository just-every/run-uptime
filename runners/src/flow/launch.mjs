// All engines use the same authenticated filtering proxy. Engine-specific
// settings prevent direct DNS, speculative requests and UDP peer connections.
export function flowLaunchOptions(engine, {home, proxy} = {}) {
  const env = {HOME: process.env.HOME, ...(home ? {TMPDIR: home} : {}), LANG: 'C.UTF-8',
    ...(process.env.PLAYWRIGHT_BROWSERS_PATH ? {PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH} : {})};
  const options = {headless: true, timeout: 20000, env,
    ...(proxy ? {proxy: {server: `http://127.0.0.1:${proxy.port}`, username: proxy.username, password: proxy.password, bypass: ''}} : {})};
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
