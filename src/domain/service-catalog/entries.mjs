// DEPENDENCY-002: the versioned third-party service catalog. Data only, reviewed by people: each entry names the
// provider's official status source, its kind, and the components and regions an owner can follow.
// A release that moves, adds or retires a source raises CATALOG_VERSION; every followed service records the version it was
// followed under, and one older than this is shown as needing review.
//   kind 'statuspage'  Statuspage-compatible JSON API: <base>/api/v2/status.json (whole) and components.json (a component, found by name)
//   kind 'json'        the provider's own JSON status document; each followable part names the path it reads
//   kind 'feed'        an RSS or Atom feed; `signal` names how the newest entry is read
//   kind 'page'        a provider not yet supported by this catalog reader; it is named, searchable and linked, never followed
// Sources and provider documentation were reviewed on 22 October 2026; ACCEPTANCE.md records the reader’s remaining coverage gaps.
export const CATALOG_VERSION = 1;
export const CATALOG_REVIEWED = '2026-10-22';

const statuspage = (id, name, base, {aliases = [], summary, components = [], whole = true, note, page = `${base}/`, hosts = []} = {}) => ({
  id, name, aliases, summary, note, hosts,
  source: {kind: 'statuspage', base, url: `${base}/api/v2/status.json`, page},
  whole, components: components.map(component => ({key: component.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name: component})),
});
// `published` is the name AWS gives the feed (its channel title, less " Service Status"), which other products copy.
const awsComponent = ([service, slug, published], [region, place]) => ({key: `${slug}-${region}`, name: service, region, published: `${published} (${place})`, url: `https://status.aws.amazon.com/rss/${slug}-${region}.rss`});
const AWS_SERVICES = [['Amazon EC2', 'ec2', 'Amazon Elastic Compute Cloud'], ['Amazon S3', 's3', 'Amazon Simple Storage Service'], ['Amazon RDS', 'rds', 'Amazon Relational Database Service'], ['AWS Lambda', 'lambda', 'AWS Lambda'], ['Amazon DynamoDB', 'dynamodb', 'Amazon DynamoDB']];
const AWS_REGIONS = [['us-east-1', 'N. Virginia'], ['us-east-2', 'Ohio'], ['us-west-2', 'Oregon'], ['eu-west-1', 'Ireland'], ['eu-central-1', 'Frankfurt']];

export const ENTRIES = [
  {id: 'aws', name: 'AWS', hosts: ['health.aws.amazon.com'], aliases: ['Amazon Web Services', 'amazon'], summary: 'Cloud infrastructure: servers, storage, databases, functions.',
    note: 'The all-services feed is larger than a check can read, so follow a service in a region.',
    source: {kind: 'feed', url: 'https://status.aws.amazon.com/rss/all.rss', page: 'https://status.aws.amazon.com/', signal: 'rss-newest-item'},
    whole: false, components: [...AWS_REGIONS.flatMap(region => AWS_SERVICES.map(service => awsComponent(service, region))), {key: 'route53', name: 'Amazon Route 53', region: 'global', published: 'Amazon Route 53', url: 'https://status.aws.amazon.com/rss/route53.rss'}, {key: 'cloudfront', name: 'Amazon CloudFront', region: 'global', published: 'Amazon CloudFront', url: 'https://status.aws.amazon.com/rss/cloudfront.rss'}]},
  {id: 'google-cloud', name: 'Google Cloud', aliases: ['GCP', 'google'], summary: 'Cloud infrastructure and developer platform.', note: 'The feed does not separate products; the newest entry decides.',
    source: {kind: 'feed', url: 'https://status.cloud.google.com/en/feed.atom', page: 'https://status.cloud.google.com/', signal: 'atom-newest-entry'}, whole: true, components: []},
  {id: 'azure', name: 'Microsoft Azure', aliases: ['azure'], summary: 'Cloud infrastructure and developer platform.', note: 'The feed lists active events only and does not separate services.',
    source: {kind: 'feed', url: 'https://azure.status.microsoft/en-us/status/feed/', page: 'https://azure.status.microsoft/en-us/status/', signal: 'rss-no-items'}, whole: true, components: []},
  {id: 'microsoft-365', name: 'Microsoft 365', aliases: ['office 365', 'm365', 'outlook', 'teams', 'sharepoint'], summary: 'Email, documents and Teams.',
    note: 'Microsoft posts here when a widespread issue keeps tenants from their admin center’s service health; your tenant’s own service health stays in the admin center.',
    source: {kind: 'json', url: 'https://status.cloud.microsoft/api/posts/mac', page: 'https://status.cloud.microsoft/'}, whole: {path: 'Status', equals: 'Available'}, components: []},
  statuspage('cloudflare', 'Cloudflare', 'https://www.cloudflarestatus.com', {aliases: ['cdn', 'dns', 'workers'], summary: 'CDN, DNS and edge network.', note: 'Its component list is larger than a check can read, so only the whole provider is followed.'}),
  {id: 'stripe', name: 'Stripe', aliases: ['payments', 'card payments'], summary: 'Payments API, webhooks and dashboard.',
    source: {kind: 'json', url: 'https://status.stripe.com/current', page: 'https://status.stripe.com/'},
    whole: {path: 'largestatus', equals: 'up'},
    components: [['api', 'API'], ['webhooks', 'Webhooks'], ['dashboard', 'Dashboard'], ['stripejs', 'Stripe.js and Elements'], ['checkout', 'Checkout'], ['supportsite', 'Support site']].map(([key, name]) => ({key, name, path: `statuses.${key}`, equals: 'up'}))},
  {id: 'paypal', name: 'PayPal', aliases: ['venmo', 'braintree'], summary: 'Payments and checkout.', note: 'Publishes per-component production and sandbox status JSON at paypal-status.com/api/v1/components; this catalog reader does not yet support it.',
    source: {kind: 'page', url: 'https://www.paypal-status.com/', page: 'https://www.paypal-status.com/'}, whole: false, components: []},
  statuspage('square', 'Square', 'https://issquareup.com', {aliases: ['squareup', 'point of sale'], summary: 'Payments and point of sale.', page: 'https://issquareup.com/', note: 'Publishes one overall status.'}),
  statuspage('shopify', 'Shopify', 'https://www.shopifystatus.com', {aliases: ['store', 'ecommerce'], summary: 'Online store, checkout and point of sale.', components: ['Admin', 'Checkout', 'Storefront', 'API & Mobile', 'Point of Sale', 'Support']}),
  statuspage('github', 'GitHub', 'https://www.githubstatus.com', {aliases: ['git', 'actions', 'copilot'], summary: 'Source hosting, Actions and Pages.', components: ['Git Operations', 'API Requests', 'Webhooks', 'Issues', 'Pull Requests', 'Actions', 'Packages', 'Pages', 'Codespaces', 'Copilot']}),
  statuspage('vercel', 'Vercel', 'https://www.vercel-status.com', {aliases: ['next.js', 'hosting'], summary: 'Web hosting and functions.', components: ['API', 'DNS', 'Functions', 'Firewall', 'Image Optimization', 'Cron Jobs', 'Domain Registration', 'TLS Certificates']}),
  statuspage('netlify', 'Netlify', 'https://www.netlifystatus.com', {aliases: ['jamstack', 'hosting'], summary: 'Web hosting, builds and functions.', components: ['Build Pipeline', 'Netlify Functions', 'Edge Functions', 'Hosted DNS', 'Identity', 'Netlify Forms', 'API']}),
  statuspage('twilio', 'Twilio', 'https://status.twilio.com', {aliases: ['sms', 'voice', 'messaging'], summary: 'SMS, voice and messaging APIs.', note: 'Its component list is larger than a check can read, so only the whole provider is followed.'}),
  statuspage('sendgrid', 'SendGrid', 'https://status.twilio.com', {aliases: ['email', 'twilio sendgrid'], summary: 'Transactional and marketing email.', page: 'https://status.sendgrid.com/', hosts: ['status.sendgrid.com'], note: 'SendGrid publishes on Twilio’s status page, so the whole-provider status covers every Twilio product.'}),
  statuspage('mailgun', 'Mailgun', 'https://status.mailgun.com', {aliases: ['email', 'smtp'], summary: 'Transactional email API and SMTP.', components: ['Email Services', 'Deliverability Services', 'Customer Tools']}),
  {id: 'slack', name: 'Slack', aliases: ['chat', 'messaging'], summary: 'Team chat.', note: 'Publishes one overall status.',
    source: {kind: 'json', url: 'https://slack-status.com/api/v2.0.0/current', page: 'https://slack-status.com/'}, whole: {path: 'status', equals: 'ok'}, components: []},
  statuspage('zoom', 'Zoom', 'https://www.zoomstatus.com', {hosts: ['status.zoom.us'], aliases: ['meetings', 'video'], summary: 'Video meetings and phone.', note: 'Its component list is larger than a check can read, so only the whole provider is followed.'}),
  statuspage('atlassian', 'Atlassian', 'https://status.atlassian.com', {aliases: ['jira', 'confluence', 'bitbucket', 'trello'], summary: 'Jira, Confluence, Bitbucket and Trello.', note: 'Publishes one overall status.'}),
  statuspage('openai', 'OpenAI', 'https://status.openai.com', {aliases: ['chatgpt', 'gpt', 'api'], summary: 'ChatGPT and the OpenAI API.', components: ['Chat Completions', 'Responses', 'Embeddings', 'Images', 'Audio', 'Files', 'Realtime', 'Batch']}),
  statuspage('anthropic', 'Anthropic', 'https://status.claude.com', {aliases: ['claude'], summary: 'Claude and the Claude API.', components: ['claude.ai', 'Claude Console (platform.claude.com)', 'Claude API (api.anthropic.com)', 'Claude Code'], note: 'status.anthropic.com moved to status.claude.com; catalog version 1 names the new address.', hosts: ['status.anthropic.com']}),
  {id: 'okta', name: 'Okta', aliases: ['sso', 'single sign-on', 'identity'], summary: 'Single sign-on and identity.', note: 'Publishes the official OktaStatusRSS feed through FeedBurner; this catalog reader does not yet support it.',
    source: {kind: 'page', url: 'https://status.okta.com/', page: 'https://status.okta.com/'}, whole: false, components: []},
  {id: 'auth0', name: 'Auth0', aliases: ['login', 'identity'], summary: 'Sign-in and identity.', note: 'Publishes regional Atom and RSS feeds selected by tenant domain; this catalog reader does not yet support them.',
    source: {kind: 'page', url: 'https://status.auth0.com/', page: 'https://status.auth0.com/'}, whole: false, components: []},
  statuspage('digitalocean', 'DigitalOcean', 'https://status.digitalocean.com', {aliases: ['droplets', 'hosting'], summary: 'Cloud servers and managed databases.', note: 'Its component list is larger than a check can read, so only the whole provider is followed.'}),
  {id: 'fastly', name: 'Fastly', aliases: ['cdn', 'edge'], summary: 'CDN and edge cloud.', hosts: ['status.fastly.com'],
    note: 'Fastly no longer publishes a Statuspage-compatible API, and its status feed is larger than a check can read.',
    source: {kind: 'page', url: 'https://www.fastlystatus.com/', page: 'https://www.fastlystatus.com/'}, whole: false, components: []},
];
