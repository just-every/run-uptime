// DEPENDENCY-002: the versioned third-party service catalog. Data only, reviewed by people: each entry names the
// provider's official status source, its kind, and the components and regions an owner can follow.
// A release that moves, adds or retires a source raises CATALOG_VERSION; every followed service records the version it was
// followed under, and one older than this is shown as needing review.
//   kind 'statuspage'  Statuspage-compatible JSON API: <base>/api/v2/status.json (whole) and components.json (a component, found
//                      by its published name, and by its group's name where the provider repeats names across groups)
//   kind 'json'        the provider's own JSON status document; each followable part names the path it reads
//   kind 'feed'        an RSS or Atom feed; `signal` names how its entries state the provider's status (parts.mjs)
//   kind 'paypal'      PayPal's components API: one component in its production or sandbox environment
//   kind 'gcp'         Google Cloud's incidents.json, with products.json naming each product's id: a product in one location
//   kind 'page'        a provider whose official source the catalog reader cannot follow; it is named, searchable and linked
// `region` is the second dimension of a part: a region, an environment (PayPal) or a location (Google Cloud), named by `dimension`.
// Sources and provider documentation were reviewed on 22 October 2026; ACCEPTANCE.md records the reader’s remaining coverage gaps.
export const CATALOG_VERSION = 2;
export const CATALOG_REVIEWED = '2026-10-22';

const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const part = item => typeof item === 'string' ? {key: slug(item), name: item} : {key: slug(`${item.name} ${item.region ?? ''}`), ...item};
const statuspage = (id, name, base, {aliases = [], summary, components = [], whole = true, note, page = `${base}/`, hosts = [], dimension} = {}) => ({
  id, name, aliases, summary, note, hosts, ...(dimension ? {dimension} : {}),
  source: {kind: 'statuspage', base, url: `${base}/api/v2/status.json`, page},
  whole, components: components.map(part),
});
// A published group whose components are its places (DigitalOcean): the group's part in each region.
const grouped = (group, regions) => regions.map(region => ({name: group, region, match: {group, name: region}}));
// `published` is the name AWS gives the feed (its channel title, less " Service Status"), which other products copy.
const awsComponent = ([service, slug, published], [region, place]) => ({key: `${slug}-${region}`, name: service, region, published: `${published} (${place})`, url: `https://status.aws.amazon.com/rss/${slug}-${region}.rss`});
const AWS_SERVICES = [['Amazon EC2', 'ec2', 'Amazon Elastic Compute Cloud'], ['Amazon S3', 's3', 'Amazon Simple Storage Service'], ['Amazon RDS', 'rds', 'Amazon Relational Database Service'], ['AWS Lambda', 'lambda', 'AWS Lambda'], ['Amazon DynamoDB', 'dynamodb', 'Amazon DynamoDB']];
const AWS_REGIONS = [['us-east-1', 'N. Virginia'], ['us-east-2', 'Ohio'], ['us-west-2', 'Oregon'], ['eu-west-1', 'Ireland'], ['eu-central-1', 'Frankfurt']];
// Google Cloud products by the title products.json publishes, in the locations incidents.json names.
const GCP_PRODUCTS = ['Google Compute Engine', 'Google Cloud Storage', 'Google Cloud SQL', 'Google BigQuery', 'Cloud Run', 'Google Kubernetes Engine'];
const GCP_LOCATIONS = ['global', 'us-central1', 'us-east1', 'us-east4', 'us-west1', 'europe-west1'];
const PAYPAL_COMPONENTS = ['Online Checkout', 'REST APIs', 'SOAP & NVP APIs', 'Login', 'Notifications', 'Venmo'];

export const ENTRIES = [
  {id: 'aws', name: 'AWS', hosts: ['health.aws.amazon.com'], aliases: ['Amazon Web Services', 'amazon'], summary: 'Cloud infrastructure: servers, storage, databases, functions.',
    note: 'The all-services feed mixes every service and region, so follow a service in a region.',
    source: {kind: 'feed', url: 'https://status.aws.amazon.com/rss/all.rss', page: 'https://status.aws.amazon.com/', signal: 'rss-newest-item'},
    whole: false, components: [...AWS_REGIONS.flatMap(region => AWS_SERVICES.map(service => awsComponent(service, region))), {key: 'route53', name: 'Amazon Route 53', region: 'global', published: 'Amazon Route 53', url: 'https://status.aws.amazon.com/rss/route53.rss'}, {key: 'cloudfront', name: 'Amazon CloudFront', region: 'global', published: 'Amazon CloudFront', url: 'https://status.aws.amazon.com/rss/cloudfront.rss'}]},
  {id: 'google-cloud', name: 'Google Cloud', aliases: ['GCP', 'google'], summary: 'Cloud infrastructure and developer platform.', dimension: 'Location',
    note: 'Follow the whole provider, or a product in a location: an open incident states an issue for each product it lists in each location it currently affects.',
    source: {kind: 'gcp', url: 'https://status.cloud.google.com/incidents.json', products: 'https://status.cloud.google.com/products.json', page: 'https://status.cloud.google.com/'},
    whole: true, components: GCP_PRODUCTS.flatMap(name => GCP_LOCATIONS.map(region => part({name, region})))},
  {id: 'azure', name: 'Microsoft Azure', aliases: ['azure'], summary: 'Cloud infrastructure and developer platform.', note: 'The feed lists active events only and does not separate services.',
    source: {kind: 'feed', url: 'https://azure.status.microsoft/en-us/status/feed/', page: 'https://azure.status.microsoft/en-us/status/', signal: 'rss-no-items'}, whole: true, components: []},
  {id: 'microsoft-365', name: 'Microsoft 365', aliases: ['office 365', 'm365', 'outlook', 'teams', 'sharepoint'], summary: 'Email, documents and Teams.',
    note: 'Microsoft posts here when a widespread issue keeps tenants from their admin center’s service health; your tenant’s own service health stays in the admin center.',
    source: {kind: 'json', url: 'https://status.cloud.microsoft/api/posts/mac', page: 'https://status.cloud.microsoft/'}, whole: {path: 'Status', equals: 'Available'}, components: []},
  statuspage('cloudflare', 'Cloudflare', 'https://www.cloudflarestatus.com', {aliases: ['cdn', 'dns', 'workers'], summary: 'CDN, DNS and edge network.',
    components: ['API', 'Dashboard', 'CDN/Cache', 'Authoritative DNS', 'Recursive DNS', 'Workers', 'Pages', 'R2', 'Access', 'WARP', 'SSL Certificate Provisioning', 'Load Balancing and Monitoring',
      ...[['Ashburn, VA, United States - (IAD)', 'North America'], ['Chicago, IL, United States - (ORD)', 'North America'], ['Los Angeles, CA, United States - (LAX)', 'North America'], ['Frankfurt, Germany - (FRA)', 'Europe'], ['London, United Kingdom - (LHR)', 'Europe'], ['Singapore, Singapore - (SIN)', 'Asia']].map(([name, region]) => ({name, region}))]}),
  {id: 'stripe', name: 'Stripe', aliases: ['payments', 'card payments'], summary: 'Payments API, webhooks and dashboard.',
    source: {kind: 'json', url: 'https://status.stripe.com/current', page: 'https://status.stripe.com/'},
    whole: {path: 'largestatus', equals: 'up'},
    components: [['api', 'API'], ['webhooks', 'Webhooks'], ['dashboard', 'Dashboard'], ['stripejs', 'Stripe.js and Elements'], ['checkout', 'Checkout'], ['supportsite', 'Support site']].map(([key, name]) => ({key, name, path: `statuses.${key}`, equals: 'up'}))},
  {id: 'paypal', name: 'PayPal', aliases: ['venmo', 'braintree'], summary: 'Payments and checkout.', dimension: 'Environment',
    note: 'PayPal states each component’s production and sandbox status separately; follow a component in one environment.',
    source: {kind: 'paypal', url: 'https://www.paypal-status.com/api/v1/components', page: 'https://www.paypal-status.com/'},
    whole: false, components: PAYPAL_COMPONENTS.flatMap(name => ['production', 'sandbox'].map(region => part({name, region})))},
  statuspage('square', 'Square', 'https://issquareup.com', {aliases: ['squareup', 'point of sale'], summary: 'Payments and point of sale.', page: 'https://issquareup.com/', note: 'Publishes one overall status.'}),
  statuspage('shopify', 'Shopify', 'https://www.shopifystatus.com', {aliases: ['store', 'ecommerce'], summary: 'Online store, checkout and point of sale.', components: ['Admin', 'Checkout', 'Storefront', 'API & Mobile', 'Point of Sale', 'Support']}),
  statuspage('github', 'GitHub', 'https://www.githubstatus.com', {aliases: ['git', 'actions', 'copilot'], summary: 'Source hosting, Actions and Pages.', components: ['Git Operations', 'API Requests', 'Webhooks', 'Issues', 'Pull Requests', 'Actions', 'Packages', 'Pages', 'Codespaces', 'Copilot']}),
  statuspage('vercel', 'Vercel', 'https://www.vercel-status.com', {aliases: ['next.js', 'hosting'], summary: 'Web hosting and functions.', components: ['API', 'DNS', 'Functions', 'Firewall', 'Image Optimization', 'Cron Jobs', 'Domain Registration', 'TLS Certificates']}),
  statuspage('netlify', 'Netlify', 'https://www.netlifystatus.com', {aliases: ['jamstack', 'hosting'], summary: 'Web hosting, builds and functions.', components: ['Build Pipeline', 'Netlify Functions', 'Edge Functions', 'Hosted DNS', 'Identity', 'Netlify Forms', 'API']}),
  statuspage('twilio', 'Twilio', 'https://status.twilio.com', {aliases: ['sms', 'voice', 'messaging'], summary: 'SMS, voice and messaging APIs.',
    components: ['Programmable Messaging API', 'SMS', 'MMS', 'WhatsApp Messaging', 'Verify', 'REST API', 'Console', 'Studio', 'Functions',
      ...['US1', 'IE1', 'AU1'].map(region => ({name: 'Programmable Voice PSTN', region, match: {name: `PSTN ${region}`}}))]}),
  statuspage('sendgrid', 'SendGrid', 'https://status.twilio.com', {aliases: ['email', 'twilio sendgrid'], summary: 'Transactional and marketing email.', page: 'https://status.sendgrid.com/', hosts: ['status.sendgrid.com'],
    note: 'SendGrid publishes on Twilio’s status page, so its whole-provider status covers every Twilio product; its components are SendGrid’s own.',
    components: [...['API v3', 'SMTP'].map(name => ({name: `Mail Sending ${name}`, match: {group: 'SendGrid Mail Sending', name}})), ...['Event Webhooks', 'Parse API'].map(name => ({name, match: {group: 'SendGrid Webhooks', name}})),
      'SendGrid API', 'SendGrid Website', 'SendGrid Marketing Campaigns', 'SendGrid Email Activity', 'SendGrid Statistics']}),
  statuspage('mailgun', 'Mailgun', 'https://status.mailgun.com', {aliases: ['email', 'smtp'], summary: 'Transactional email API and SMTP.', components: ['Email Services', 'Deliverability Services', 'Customer Tools']}),
  {id: 'slack', name: 'Slack', aliases: ['chat', 'messaging'], summary: 'Team chat.', note: 'Publishes one overall status.',
    source: {kind: 'json', url: 'https://slack-status.com/api/v2.0.0/current', page: 'https://slack-status.com/'}, whole: {path: 'status', equals: 'ok'}, components: []},
  statuspage('zoom', 'Zoom', 'https://www.zoomstatus.com', {hosts: ['status.zoom.us'], aliases: ['meetings', 'video'], summary: 'Video meetings and phone.',
    components: [...['Zoom Meetings', 'Zoom Webinars'].map(name => ({name, match: {group: 'Zoom Meetings', name}})), {name: 'Zoom Chat', match: {group: 'Zoom Chat', name: 'Zoom Chat'}}, {name: 'Zoom Rooms', match: {group: 'Zoom Rooms', name: 'Zoom Rooms'}},
      ...[['NORTH AMERICA', 'North America'], ['EMEA', 'EMEA'], ['APAC', 'APAC']].map(([group, region]) => ({name: 'Zoom Phone', region, match: {group: `Zoom Phone - ${group}`, name: 'Zoom Phone'}})),
      {name: 'Web Client', match: {group: 'Zoom Website', name: 'Web Client'}}, ...['REST API', 'Webhooks'].map(name => ({name: `Developer ${name}`, match: {group: 'Zoom Developer Platform', name}})), 'Zoom Whiteboard']}),
  statuspage('atlassian', 'Atlassian', 'https://status.atlassian.com', {aliases: ['jira', 'confluence', 'bitbucket', 'trello'], summary: 'Jira, Confluence, Bitbucket and Trello.', note: 'Publishes one overall status.'}),
  statuspage('openai', 'OpenAI', 'https://status.openai.com', {aliases: ['chatgpt', 'gpt', 'api'], summary: 'ChatGPT and the OpenAI API.', components: ['Chat Completions', 'Responses', 'Embeddings', 'Images', 'Audio', 'Files', 'Realtime', 'Batch']}),
  statuspage('anthropic', 'Anthropic', 'https://status.claude.com', {aliases: ['claude'], summary: 'Claude and the Claude API.', components: ['claude.ai', 'Claude Console (platform.claude.com)', 'Claude API (api.anthropic.com)', 'Claude Code'], note: 'status.anthropic.com moved to status.claude.com; the catalog names the new address.', hosts: ['status.anthropic.com']}),
  {id: 'okta', name: 'Okta', aliases: ['sso', 'single sign-on', 'identity'], summary: 'Single sign-on and identity.', hosts: ['status.okta.com'],
    note: 'Okta’s official status feed names no service or cell in a field, so Okta is followed as a whole: it states an issue while any listed incident is not resolved.',
    source: {kind: 'feed', url: 'https://feeds.feedburner.com/OktaStatusRSS', page: 'https://status.okta.com/', signal: 'atom-unresolved'}, whole: true, components: []},
  {id: 'auth0', name: 'Auth0', aliases: ['login', 'identity'], summary: 'Sign-in and identity.',
    note: 'Auth0 publishes its regional status feeds by tenant domain (status.auth0.com/rss?domain=<your tenant domain>), and the catalog sends no owner data, so it does not follow Auth0 yet.',
    source: {kind: 'page', url: 'https://status.auth0.com/', page: 'https://status.auth0.com/'}, whole: false, components: []},
  statuspage('digitalocean', 'DigitalOcean', 'https://status.digitalocean.com', {aliases: ['droplets', 'hosting'], summary: 'Cloud servers and managed databases.',
    components: ['API', 'Cloud Control Panel', 'DNS', 'Billing', ...grouped('Droplets', ['NYC1', 'NYC3', 'SFO3', 'AMS3', 'FRA1', 'SGP1']), ...grouped('Managed Databases', ['NYC1', 'NYC3', 'FRA1']),
      ...grouped('Kubernetes', ['NYC1', 'NYC3', 'FRA1']), ...grouped('Spaces', ['NYC3', 'FRA1', 'AMS3'])]}),
  {id: 'fastly', name: 'Fastly', aliases: ['cdn', 'edge'], summary: 'CDN and edge cloud.', hosts: ['status.fastly.com'],
    note: 'Fastly’s official feed (www.fastlystatus.com/rss) is a history of free-text postings with no status, component or region field, so the catalog cannot read a stated status from it yet.',
    source: {kind: 'page', url: 'https://www.fastlystatus.com/', page: 'https://www.fastlystatus.com/'}, whole: false, components: []},
];
