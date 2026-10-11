import { activityStatus } from './activity.js';
import { workspaceArt } from './workspace-art.js';
import { addressResolver } from './address-client.mjs';
import { product, branding, features, summaryDefaults, readySummary, fields, normalizeWebsite, initialDraft, setupModel, safeDraft, installInput, displayValue, summaryKeys, failureDetails, mergeAgentDraft, secretReady, hostingModel, normalizeAutomaticDraft, derivePrefix, setupGroups, setupProgress, fieldVisible, fieldDefinition, groupDefinition, groupKeys, secretScopes, nameKey } from './model.mjs';
const $ = selector => document.querySelector(selector);
document.title = 'Install ' + product.name;
$('.brand').textContent = branding.name || product.name;
$('.panel').setAttribute('aria-label', 'Install ' + product.name);
$('#open').textContent = 'Open ' + product.name + ' →';
const updateActivity = activityStatus($('#activity'), { request });
const tokenMeta = $('meta[name="installer-token"]'), token = tokenMeta?.content || '';
tokenMeta?.remove();
let draft = {}, state = {}, initialized = false, busy = false, stopping = false, timer, saveTimer, activeGroup = null, agentRevision = 0, tokenEditing = false;
const resolver = features.hosting ? addressResolver({ model: {fields,derivePrefix,secretReady,nameKey}, read: () => ({ draft, known: state.known || {} }), request, answer: setAnswer, changed: () => { if (initialized) renderPreservingFocus(); } }) : null;
const art = features.artwork ? workspaceArt({ model: {fields}, request, read: () => draft, save }) : null;
const changed = new Set(), pendingSave = new Set(), history = [], visitedGroups = [], reviewedDefaultGroups = new Set();
let editingGroup = false;
let visibleKeys = new Set(), editingSecrets = new Set(), hostingAccountShown = false;
let followLogs = true;
$('#logs').addEventListener('scroll', () => {
  const logs = $('#logs');
  followLogs = logs.scrollHeight - logs.clientHeight - logs.scrollTop <= 2;
});
function selectGroup(id, edit = false, editing = edit) {
  editingGroup = editing;
  if (id && !editing && !visitedGroups.includes(id)) visitedGroups.push(id);
  activeGroup = id; editingSecrets.clear(); hostingAccountShown = false;
  const group = setupGroups.find(group => group.id === id), missing = setupModel(draft, state.known).missing;
  visibleKeys = new Set((group ? groupKeys(group,draft).filter(key => edit || fieldDefinition(key,draft).optional || missing.includes(key)) : []) || []);
}
function hasAnswered(key) {
  return changed.has(key) || state.answered?.includes(key) || ['agent', 'browser', 'saved'].includes(state.sources?.[key]);
}
function hasAnswers() {
  return Boolean(state.answered?.length || Object.keys(state.sources || {}).length || changed.size || reviewedDefaultGroups.size);
}
function groupNeedsOwnerReview(group) {
  return features.localTrialWithoutEmail === true && features.hosting && group?.kind === 'hosting' && !hasAnswered('target');
}
function nextSetupGroup() {
  return setupGroups.find(group => !group.complete(draft, state.known) || (groupNeedsOwnerReview(group) && !reviewedDefaultGroups.has(group.id)))?.id || null;
}
function node(tag, className, text) { const result = document.createElement(tag); if (className) result.className = className; if (text !== undefined) result.textContent = text; return result; }
function error(message = '') { $('#error').textContent = message; $('#error').hidden = !message; }
async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...options.headers, 'X-Installer-Token': token }, credentials: 'same-origin', cache: 'no-store' });
  const body = await response.json(); if (!response.ok) throw Error(body.error || `Installer request failed (${response.status}).`); return body;
}
async function save() {
  clearTimeout(saveTimer); const values = safeDraft(Object.fromEntries([...pendingSave].map(key => [key, draft[key]]))); if (!Object.keys(values).length) return;
  await request('/api/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
  for (const [key, value] of Object.entries(values)) if (draft[key] === value) pendingSave.delete(key);
}
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { save().catch(cause => error(cause.message)); }, 600); }
function inputFor(key, value) {
  const definition = fieldDefinition(key,draft), accounts = state.known?.providers?.cloudflare?.accounts || [];
  const options = key === 'accountId' && accounts.length ? accounts.map(account => [account.id, account.name || account.id]) : definition.options;
  const input = node(options ? 'select' : definition.type === 'textarea' ? 'textarea' : 'input', 'input'); input.id = key; input.name = key;
  if (options) { const placeholder = node('option', '', 'Choose…'); placeholder.value = ''; input.append(placeholder); for (const [value, title] of options) { const option = node('option', '', title); option.value = value; input.append(option); } }
  else if (definition.type === 'textarea') { input.rows = 3; }
  else { input.type = definition.type || 'text'; input.autocomplete = definition.autocomplete || 'off'; if (definition.inputMode) input.inputMode = definition.inputMode; if (['email', 'url', 'password'].includes(input.type)) { input.spellcheck = false; input.setAttribute('autocapitalize', 'none'); } }
  if (definition.placeholder) input.placeholder = definition.placeholder;
  if (definition.maxLength) input.maxLength = definition.maxLength;
  input.value = definition.type === 'color' ? (definition.valid(value) ? value : '#7c3aed') : value || ''; input.required = !definition.optional;
  if (input.type === 'email') input.maxLength = 320;
  return input;
}
function appendInput(container, key, input, value) {
  if (input.type === 'color') {
    const wrap = node('div', 'colour-control'), selected = fields[key].valid(value), caption = node('span', 'colour-caption', selected ? value : 'Choose a colour');
    wrap.append(input, caption); input.addEventListener('input', () => { caption.textContent = input.value; });
    container.append(wrap);
  } else if (input.tagName === 'SELECT') { const wrap = node('div', 'select-wrap'); wrap.append(input); container.append(wrap); }
  else container.append(input);
}
function setAnswer(key, value) {
  if (draft[key] !== value) art?.edited(key);
  if (key === 'accountId' && fields.accountId?.valid(draft.accountId) && draft.accountId !== value) draft.apiToken = '';
  for(const [secret,dependencies]of Object.entries(secretScopes))if(dependencies.includes(key)&&draft[key]!==value){draft[secret]='';const input=document.getElementById(secret);if(input)input.value='';}
  draft[key] = value; changed.add(key); pendingSave.add(key); scheduleSave();
  if ([nameKey, 'accountId', 'apiToken', 'target', 'prefixMode', 'addressMode'].includes(key) || (key === 'prefix' && draft.prefixMode === 'custom')) queueMicrotask(() => resolver?.schedule());
}
function missingField(key, container = $('#fields')) {
  const definition = fieldDefinition(key,draft), card = node('div', 'field'), label = node('label', '', definition.label), input = inputFor(key, draft[key]);
  label.htmlFor = key; card.dataset.field = key; if (definition.heading) card.append(node('h3', 'field-title', definition.heading)); card.append(label); appendInput(card, key, input, draft[key]);
  if (definition.help) { const help = node('p', 'help', definition.help); help.id = key + '-help'; card.append(help); input.setAttribute('aria-describedby', help.id); }
  input.addEventListener('input', () => { setAnswer(key, input.value); refreshStatus(); });
  if (definition.artwork || definition.type === 'url') input.addEventListener('blur', () => {
    if (definition.type === 'url') {
      let value = normalizeWebsite(input.value);
      if (definition.valid(value)) value = new URL(value).origin;
      if (value !== input.value) { input.value = value; setAnswer(key, value); refreshStatus(); }
    }
    if (definition.artwork) void art?.commit()?.catch(cause => error(cause.message));
  });
  input.addEventListener('change', () => {
    if (definition.type === 'url') {
      input.value = normalizeWebsite(input.value);
      if (definition.valid(input.value)) input.value = new URL(input.value).origin;
    }
    setAnswer(key, input.value);
    if (definition.artwork) void art?.commit()?.catch(cause => error(cause.message));
    const dependency=Object.values(fields).some(field=>field.when?.field===key||field.presentations?.some(item=>item.when.field===key))||setupGroups.some(group=>group.presentations?.some(item=>item.when.field===key));
    if(dependency||['target','accountId','apiToken'].includes(key))renderPreservingFocus();else refreshStatus();
  });
  container.append(card);
}
function knownRow(container, key, value, source) {
  const row = node('div', 'known-row'), display = node('div', 'known-value');
  if (fields[key].type === 'color' && fields[key].valid(value)) {
    const swatch = node('span', 'colour-swatch'); swatch.style.backgroundColor = value; swatch.setAttribute('aria-hidden', 'true'); display.append(swatch);
  } else if (fields[key].type === 'email') {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    icon.classList.add('value-icon'); icon.setAttribute('aria-hidden', 'true'); use.setAttribute('href', '#group-email'); icon.append(use); display.append(icon);
  }
  display.append(node('span', 'known-value-text', value)); row.append(node('div', 'known-label', fields[key]?.summaryLabel || fields[key]?.label || key), display);
  if (source) { row.title = source; row.append(node('span', 'visually-hidden', source)); if (source === 'Edition default') row.append(node('span', 'known-source', source)); }
  container.append(row);
  return row;
}
function targetChoices(container) {
  const choices = node('fieldset', 'target-choices'); choices.append(node('legend', 'known-label', `Where should ${product.name} run?`));
  for (const [value, title] of fields.target.options) {
    const label = node('label', 'target-choice'), input = node('input'); input.type = 'radio'; input.name = 'installation-target'; input.value = value; input.checked = draft.target === value;
    input.onchange = () => { setAnswer('target', value); renderPreservingFocus(); $('#target-' + value)?.focus(); }; input.id = 'target-' + value;
    const tick = node('span', 'target-tick', '✓'); tick.setAttribute('aria-hidden', 'true'); label.append(input, tick);
    if (value === 'remote') {
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); icon.classList.add('value-icon'); icon.setAttribute('aria-hidden', 'true'); use.setAttribute('href', '#value-cloudflare'); icon.append(use); label.append(icon);
    }
    const copy = node('span', 'choice-copy', title); if (container.closest('#fields')) copy.append(node('small', 'help', value === 'local' ? 'Uses the machine running this installer, for testing. Keep its terminal open.' : `Publish ${product.name} online for your team.`)); label.append(copy); choices.append(label);
  }
  container.append(choices);
}
function openGroup(id) {
  if (activeGroup !== id) history.push({ id: activeGroup, editing: editingGroup });
  selectGroup(id, true); tokenEditing = false;
  render(); focusGroup();
}
function focusGroup() { $('#heading').focus(); }
function renderKnown() {
  const container = $('#known'); container.replaceChildren();
  const reviewedDefaults = setupGroups.filter(group => reviewedDefaultGroups.has(group.id)).flatMap(group => group.keys.filter(key => fields[key]?.valid(draft[key])));
  const answered = [...new Set([...(state.answered || []), ...changed, ...reviewedDefaults])];
  const visibleAnswers = new Set(summaryKeys(draft, { ...state, answered }));
  for (const baseDefinition of setupGroups) {
    const definition=groupDefinition(baseDefinition,draft);
    const keys = groupKeys(definition,draft).filter(key => visibleAnswers.has(key) && !(definition.id === activeGroup && (definition.kind === 'hosting' || visibleKeys.has(key))) && !['prefix', 'apiToken'].includes(key));
    const optionalAvailable=definition.kind!=='hosting'&&definition.id!==activeGroup&&groupKeys(definition,draft).some(key=>fieldDefinition(key,draft).optional);
    if (!keys.length && !optionalAvailable) continue;
    const group = node('section', 'known-group ' + definition.id); group.setAttribute('aria-label', definition.title);
    const header = node('header', 'known-group-header'), icon = node('span', 'category-icon'); icon.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '#group-' + definition.id); svg.append(use); icon.append(svg);
    const edit = node('button', 'edit', 'Edit'); edit.type = 'button'; edit.setAttribute('aria-label', 'Edit ' + definition.title); edit.onclick = () => openGroup(definition.id);
    header.append(icon, node('h3', 'known-group-title', definition.title), edit);
    const body = node('div', 'known-group-body'); group.append(header, body);
    for (const key of keys) {
      let value = displayValue(key, draft[key]);
      if (!value) continue;
      if (fields[key].type === 'password') continue;
      knownRow(body, key, value, !hasAnswered(key) && summaryDefaults.includes(key) ? 'Edition default' : '', false);
    }
    if (body.children.length || optionalAvailable) container.append(group);
  }
  const summary = $('#known-summary');
  const optionalGroupsAvailable=setupGroups.some(group=>group.kind!=='hosting'&&group.id!==activeGroup&&groupKeys(group,draft).some(key=>fieldDefinition(key,draft).optional));
  summary.hidden = state.phase !== 'ready' || (!hasAnswers()&&!optionalGroupsAvailable) || !container.children.length;
  if (summary.hidden) summary.open = false;
}
function refreshSetupChrome() {
  const ready = state.phase === 'ready';
  $('#progress').hidden = !ready;
  updateActivity(state.activity, state.agent, { showManual: hasAnswers() });
  if (!ready) $('#activity').hidden = true;
  renderKnown();
}

function providerCard(provider, container = $('#fields')) {
  const info = state.known?.providers?.[provider] || {}, connection = state.connection?.provider === provider ? state.connection : null;
  const card = node('div', 'field connection-row'), title = provider === 'github' ? (info.authenticated ? 'Change GitHub connection' : 'GitHub (optional)') : info.authenticated ? 'Change Cloudflare connection' : 'Connect Cloudflare'; card.dataset.provider = provider; card.append(node('h3', 'field-title', title));
  if (provider === 'github') {
    if (info.authenticated) card.append(node('p', 'help', 'This account comes from GitHub CLI sign-in. Sign in with the account you want to use; this updates the active GitHub CLI connection on this computer.'));
    else if (info.installed === true) card.append(node('p', 'help', 'You can connect GitHub later. Connecting lets this installer identify the GitHub account for setup.'));
    else {
      const help = node('p', 'help', 'You can connect GitHub later. Install GitHub CLI, then run gh auth login. ');
      const link = node('a', 'help-link', 'cli.github.com'); link.href = 'https://cli.github.com'; link.target = '_blank'; link.rel = 'noopener noreferrer'; help.append(link); card.append(help);
    }
  } else if (info.authenticated) card.append(node('p', 'help', 'Sign in with the Cloudflare account you want to use. This updates the Wrangler connection on this computer.'));
  else if (info.installed === false) card.append(node('p', 'help', 'Wrangler is not installed. Run npm install --global wrangler, then connect your Cloudflare account. For online setup, you can use an API token instead.'));
  else card.append(node('p', 'help', draft.target === 'local' ? 'For Cloudflare hosting. Not needed to run on this computer.' : draft.target === 'remote' ? 'Connect your account or supply an API token to install on Cloudflare.' : 'Required if you install on Cloudflare.'));
  const connecting = connection && ['starting', 'awaiting_browser', 'refreshing', 'running'].includes(connection.state), actions = node('div', 'connection-actions');
  const canConnect = provider === 'github' ? info.installed === true : info.installed !== false;
  if (canConnect) {
    const button = node('button', 'secondary', connecting ? 'Connecting…' : info.authenticated ? provider === 'github' ? 'Sign in to GitHub' : 'Sign in to Cloudflare' : 'Connect'); button.type = 'button'; button.id = 'connect-' + provider; button.disabled = Boolean(connecting);
    button.onclick = async () => { button.disabled = true; error(); try { await request('/api/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }) }); await poll(); } catch (cause) { error(cause.message); button.disabled = false; } }; actions.append(button);
  }
  if (provider === 'cloudflare' && draft.target === 'remote') { const alternative = node('button', 'edit', 'Use an API token'); alternative.type = 'button'; alternative.onclick = () => { tokenEditing = true; render(); $('#apiToken')?.focus(); }; actions.append(alternative); }
  card.append(actions);
  if (connection) {
    const text = { starting: 'Starting sign-in…', awaiting_browser: 'Complete sign-in in your browser.', refreshing: 'Checking the connection…', connected: 'Connection confirmed.', auth_required: 'Sign-in was not confirmed. Try connecting again.', failed: 'Connection failed. Check your installer terminal.' }[connection.state] || connection.state;
    card.append(node('p', 'status', text));
    if (connection.deviceCode) { card.append(node('p', '', `One-time code: ${connection.deviceCode}`)); if (connection.verificationUrl === 'https://github.com/login/device') { const link = node('a', 'edit', 'Open GitHub device sign-in ↗'); link.href = connection.verificationUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link); } }
  }
  if (provider === 'cloudflare' && tokenEditing) missingField('apiToken', card);
  container.append(card);
}
function renderHosting() {
  const hosting = hostingModel(draft, state.known);
  const unit = node('section', 'hosting-unit target-question'); unit.setAttribute('aria-label', 'Hosting & connections'); $('#fields').append(unit);
  {
    unit.dataset.editing = 'true'; targetChoices(unit);
    if (draft.target === 'remote') {
      if (!hosting.accessReady || tokenEditing) providerCard('cloudflare', unit);
      else { unit.append(node('p', 'status', 'Cloudflare connected')); const change = node('button', 'edit', 'Change Cloudflare connection'); change.type = 'button'; change.onclick = () => { tokenEditing = true; renderPreservingFocus(); }; unit.append(change); }
      if (hosting.accessReady) hostingAccountShown = true;
      if (hostingAccountShown) {
        missingField('accountId', unit);
        if (resolver.status.pending) { const progress = node('p', 'status', 'Finding your team workspace address…'); progress.setAttribute('role', 'status'); unit.append(progress); }
        if (resolver.status.error) {
          const notice = node('p', 'error', resolver.status.error); notice.setAttribute('role', 'alert'); unit.append(notice);
          const retry = node('button', 'edit', 'Try again'); retry.type = 'button'; retry.onclick = () => resolver?.schedule(true); unit.append(retry);
        }
        if (draft.appOrigin) unit.append(node('p', 'status', 'Team workspace address: ' + draft.appOrigin));
        const advanced = node('details', 'advanced'); advanced.append(node('summary', '', 'Advanced settings'));
        for (const [key, mode, title] of [['prefix', 'prefixMode', 'Use a custom resource name'], ['appOrigin', 'addressMode', 'Use a custom team workspace address']]) {
          const label = node('label', 'advanced-toggle'), toggle = node('input'); toggle.type = 'checkbox'; toggle.id = mode; toggle.checked = draft[mode] === 'custom';
          toggle.onchange = () => { setAnswer(mode, toggle.checked ? 'custom' : 'automatic'); if (!toggle.checked && key === 'appOrigin') setAnswer(key, ''); renderPreservingFocus(); resolver?.schedule(true); };
          label.append(toggle, node('span', '', title)); advanced.append(label);
          if (toggle.checked) missingField(key, advanced);
        }
        advanced.open = draft.prefixMode === 'custom' || draft.addressMode === 'custom'; unit.append(advanced);
      }
    }
  }
  if (features.github) providerCard('github', unit);
}
function choiceGroup(container, legend, options, selected, onChange) {
  const group = node('fieldset', 'target-choices'); group.append(node('legend', '', legend));
  for (const [value, text] of options) {
    const label = node('label', 'target-choice'), input = node('input'); input.type = 'radio'; input.name = legend; input.value = value; input.id = 'choice-' + value; input.checked = value === selected;
    input.onchange = () => { onChange(value); renderPreservingFocus(); }; const tick = node('span', 'target-tick', '✓'); tick.setAttribute('aria-hidden', 'true'); label.append(input, tick, node('span', '', text)); group.append(label);
  }
  container.append(group);
}
function refreshStatus() {
  const model = setupModel(draft, state.known), baseGroup = setupGroups.find(group => group.id === activeGroup), group = baseGroup && groupDefinition(baseGroup,draft);
  $('#continue').hidden = !group; $('#approve').hidden = Boolean(group);
  $('#continue').disabled = busy || !group?.complete(draft, state.known);
  $('#approve').disabled = busy || !model.ready;
  $('#fields .review-correction')?.remove();
  if (!activeGroup && !model.ready) { const fix = node('button', 'secondary review-correction', 'Complete missing details'); fix.type = 'button'; fix.onclick = () => { selectGroup(nextSetupGroup()); render(); focusGroup(); }; $('#fields').append(fix); }
  $('#back').hidden = !history.length;
  $('#progress').textContent = setupProgress(draft, state.known, { active: activeGroup, visited: visitedGroups, editing: editingGroup });
  refreshSetupChrome();
}
function render() {
  const container = $('#fields'); container.replaceChildren();
  const baseGroup = setupGroups.find(group => group.id === activeGroup), group = baseGroup && groupDefinition(baseGroup,draft);
  $('#heading').textContent = group?.title || 'Ready to install';
  if(group?.help)container.append(node('p','help',group.help));
  if (group && group.kind !== 'hosting') for (const key of groupKeys(group,draft)) {
    if (setupModel(draft, state.known).missing.includes(key)) { visibleKeys.add(key); if (fields[key].type === 'password') editingSecrets.add(key); }
    if (!visibleKeys.has(key)) continue;
    if (fields[key].type === 'password' && secretReady(key, draft, state.known) && !draft[key] && !editingSecrets.has(key)) {
      const row = node('div', 'status', fields[key].label + ' securely provided');
      const change = node('button', 'edit', 'Change ' + fields[key].label.toLowerCase()); change.type = 'button'; change.onclick = () => { editingSecrets.add(key); render(); document.getElementById(key).focus(); }; row.append(change); container.append(row);
    } else missingField(key);
  }
  if (group?.kind === 'hosting') { if (features.hosting) renderHosting(); }
  if (!group) container.append(node('p', 'ready-summary', readySummary(draft)));
  refreshStatus();
}
function renderPreservingFocus() {
  const active = document.activeElement, focused = active?.id, start = active?.selectionStart, end = active?.selectionEnd;
  render(); const next = focused && document.getElementById(focused);
  if (next) { next.focus(); if (start !== null && start !== undefined) { try { next.setSelectionRange(start, end); } catch {} } }
  else if (focused) ($('#accountId') || $('#fields input, #fields select, #fields button') || $('#approve'))?.focus();
}
function applyState(next) {
  art?.update(next);
  const changedProviders = JSON.stringify([state.known?.providers, state.connection, state.known?.secretReadiness]) !== JSON.stringify([next.known?.providers, next.connection, next.known?.secretReadiness]); state = next; $('#loading').hidden = true;
  const agentDraft = mergeAgentDraft(draft, next, agentRevision, pendingSave), agentChanged = initialized && agentDraft !== draft;
  if (Number.isFinite(next.lastUpdate?.revision)) agentRevision = Math.max(agentRevision, next.lastUpdate.revision);
  if (!initialized) { draft = initialDraft(next); for (const key of ['prefixMode', 'addressMode']) if (features.hosting && draft[key] !== next.draft?.[key]) pendingSave.add(key); if (pendingSave.size) scheduleSave(); initialized = true; selectGroup(nextSetupGroup()); render(); resolver?.schedule(); }
  else if (agentChanged && next.phase === 'ready') {
    const appliedKeys = Object.keys(agentDraft).filter(key => agentDraft[key] !== draft[key]);
    for(const [secret,dependencies]of Object.entries(secretScopes))if(dependencies.some(key=>agentDraft[key]!==draft[key])){
      agentDraft[secret]='';
      // Clearing the focused control also prevents its blur/change event from
      // restoring stale private bytes while render replaces the old form.
      const input=document.getElementById(secret);if(input)input.value='';
    }
    draft = normalizeAutomaticDraft(agentDraft); for (const key of appliedKeys) changed.delete(key); renderPreservingFocus();
  }
  else if (changedProviders && next.phase === 'ready') {
    const provider = next.known?.providers?.cloudflare, accounts = provider?.accounts || [];
    if (provider?.authenticated && accounts.length && draft.accountId && !accounts.some(account => account.id === draft.accountId)) setAnswer('accountId', '');
    if (features.hosting && !draft.accountId && accounts.length === 1) setAnswer('accountId', accounts[0].id);
    renderPreservingFocus();
  }
  resolver?.schedule();
  const active = next.phase !== 'ready'; $('#form').hidden = active; $('#installation').hidden = !active;
  refreshSetupChrome();
  if (!active) { error(next.error || ''); return; }
  busy = true; $('#heading').hidden = false;
  const stopped = next.phase === 'failed' && /\bcancelled\b/i.test(typeof next.error === 'string' ? next.error.split('\n', 1)[0] : '');
  $('#heading').textContent = next.phase === 'complete' ? 'Your workspace is ready' : stopped ? 'Stopped' : next.phase === 'failed' ? 'Installation needs attention' : 'Making a home for your team';
  const stillStarting = (next.logs || []).slice().reverse().find(line => line.startsWith(`${next.step}: `) && /\bStill starting \(\d+ s\)$/.test(line));
  $('#current-step').textContent = next.phase === 'running' && stillStarting ? stillStarting : next.step || (next.phase === 'running' ? 'Installation is running.' : next.phase === 'failed' ? 'Installation stopped.' : 'Installation complete.');
  const logLines = [...(next.logs || [])];
  const failure = failureDetails(next);
  if (failure.output && !logLines.join('\n').includes(failure.output)) logLines.push(failure.output);
  const logs = $('#logs'), scrollTop = logs.scrollTop;
  logs.textContent = logLines.join('\n');
  if (followLogs) logs.scrollTop = logs.scrollHeight;
  else logs.scrollTop = scrollTop;
  $('#failed-note').hidden = next.phase !== 'failed';
  $('#failure-log-path').hidden = next.phase !== 'failed' || !failure.logPath;
  $('#failure-log-path').textContent = failure.logPath ? `Installer log: ${failure.logPath}` : '';
  $('#retry-installation').hidden = next.phase !== 'failed';
  if (next.phase === 'failed') {
    const diagnostic = failure.output ? `Output from ${failure.step} is shown in the log above.` : `Installation stopped during ${failure.step}. Review the installation activity above.`;
    $('#failed-note').textContent = `${diagnostic} Choose Review saved answers to return to approval; after correcting the issue, choose Approve and install to try again.`;
  }
  $('#stop-installation').hidden = next.phase !== 'running';
  if (next.phase !== 'running') { stopping = false; $('#stop-installation').disabled = false; $('#stop-installation').textContent = 'Stop installation'; }
  if (stopped) error();
  else if (next.phase === 'failed') error(failureHeadline(next.error, failure.step));
  else error();
  if (next.phase === 'complete' && next.appUrl) { try { const url = new URL(next.appUrl); if (['http:', 'https:'].includes(url.protocol)) { $('#open').href = url.href; $('#open').hidden = false; } } catch { error('The application address is invalid. Check the installer terminal.'); } }
  // A dev-identity app's outbox opens through its key exchange; the key stays out of saved state.
  if (next.phase === 'complete' && next.devOpen && !$('#open').dataset.devOpen) { $('#open').dataset.devOpen = 'pending'; request('/api/open-app').then(({ url }) => { if (new URL(url).origin === new URL(next.appUrl).origin) { $('#open').href = url; $('#open').dataset.devOpen = 'ready'; } }).catch(() => { delete $('#open').dataset.devOpen; }); }
}
function failureHeadline(message, step) {
  const firstLine = typeof message === 'string' ? message.split('\n', 1)[0] : '';
  const label = typeof step === 'string' && step.trim() ? step.replace(/\s+/g, ' ').trim() : 'Installation';
  const conciseStep = label.length > 29 ? `${label.slice(0, 28).trimEnd()}…` : label;
  const exit = firstLine.match(/\bexit (\d+)\b/i);
  if (exit) return `${conciseStep}: exit ${exit[1]}.`;
  const signal = firstLine.match(/\bsignal (?!none\b)([A-Z0-9]+)\b/i);
  if (signal) return `${conciseStep}: signal ${signal[1]}.`;
  if (/could not start/i.test(firstLine)) return `${conciseStep}: command could not start.`;
  if (/readiness deadline exceeded/i.test(firstLine)) return `${conciseStep}: startup timed out.`;
  return `${conciseStep}: failed.`;
}
function reviewSavedAnswers() {
  if (state.phase !== 'failed') return;
  busy = false; stopping = false;
  state = { ...state, phase: 'ready', error: undefined };
  $('#installation').hidden = true; $('#form').hidden = false; $('#open').hidden = true;
  selectGroup(null); error();
  render(); focusGroup();
}
async function poll() { clearTimeout(timer); try { const next = await request('/api/state'); applyState(next); if (!['complete', 'failed'].includes(next.phase)) timer = setTimeout(poll, 1500); } catch (cause) { error(cause.message + ' Keep the installer terminal open.'); timer = setTimeout(poll, 3000); } }
$('#form').onsubmit = async event => {
  event.preventDefault(); if (busy) return; error();
  try { await art?.commit(); } catch (cause) { error(cause.message); return; }
  if (activeGroup) {
    const baseGroup = setupGroups.find(group => group.id === activeGroup), group = baseGroup && groupDefinition(baseGroup,draft);
    if (!group.complete(draft, state.known)) return;
    history.push({ id: activeGroup, editing: editingGroup }); reviewedDefaultGroups.add(activeGroup); selectGroup(nextSetupGroup()); tokenEditing = false; render(); focusGroup(); return;
  }
  const model = setupModel(draft, state.known); if (!model.ready) { selectGroup(nextSetupGroup()); render(); (model.missing[0] === 'target' ? $('#target-local') : $('#' + model.missing[0]))?.focus(); return; }
  busy = true; $('#approve').disabled = true; clearTimeout(saveTimer); const data = installInput(draft);
  try { await request('/api/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); for (const key of Object.keys(fields).filter(key => fields[key].type === 'password')) draft[key] = ''; await poll(); }
  catch (cause) { error(cause.message); busy = false; refreshStatus(); }
  finally { for (const key of Object.keys(fields).filter(key => fields[key].type === 'password')) { data[key] = ''; draft[key] = ''; }  }
};
poll();

$('#back').onclick = () => { const previous = history.pop(); selectGroup(previous.id, true, previous.editing); render(); focusGroup(); };
$('#retry-installation').onclick = reviewSavedAnswers;
$('#stop-installation').onclick = async () => {
  if (stopping) return;
  stopping = true; $('#stop-installation').disabled = true; $('#stop-installation').textContent = 'Stopping…'; error();
  try { await request('/api/stop', { method: 'POST' }); await poll(); }
  catch (cause) { error(cause.message); stopping = false; $('#stop-installation').disabled = false; $('#stop-installation').textContent = 'Stop installation'; }
};
