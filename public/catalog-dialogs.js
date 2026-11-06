import { escape } from './console-format.js';
const metadata = ['project', 'environment', 'service', 'group', 'tags', 'owner', 'outcome', 'dependencies'];
const labels = { project: 'Project', environment: 'Environment', service: 'Service', group: 'Group', tags: 'Tags (comma-separated)', owner: 'Accountable owner', outcome: 'Intended customer outcome', dependencies: 'Dependency monitor IDs (comma-separated)' };
// Check from: the live locations, in the console's order (see public/locations.js), the first three ticked: a monitor checks
// from up to three. Each ticked location is sent as one check's runner, so the new monitors check from exactly those.
const PROBES = ['local-a', 'local-b', 'local-c'];
function locations(runners) {
    const active = runners.filter(row => !row.revokedAt), joined = active.filter(row => row.lastContactAt !== null);
    return (joined.length ? joined : active.slice(0, 1)).map(row => ({ id: row.runnerId, name: row.networkLabel }));
}
function chosenLocations(form) {
    const ids = [...form.querySelectorAll('[name=locations]:checked')].map(box => box.value), probes = PROBES.slice(0, ids.length);
    return { probes, assignments: Object.fromEntries(probes.map((probe, i) => [probe, ids[i]])) };
}
function limitLocations(form) {
    const boxes = [...form.querySelectorAll('[name=locations]')], full = boxes.filter(box => box.checked).length >= PROBES.length;
    for (const box of boxes) box.disabled = !box.checked && full;
}
const list = value => value.split(',').map(part => part.trim()).filter(Boolean);
// New monitors take labels as an optional fold (and no dependencies: a list of new monitors has none yet); editing labels shows them all.
const fieldsFor = edit => edit ? metadata : metadata.filter(name => name !== 'dependencies');
function metadataGrid(edit = false) {
    return `<div class="catalog-grid">${fieldsFor(edit).map(name => `<div>${edit ? `<label><input type="checkbox" name="set-${name}">Replace ${escape(labels[name])}</label>` : ''}<label>${escape(labels[name])}<input name="${name}"${name === 'outcome' ? ' maxlength="500"' : ['tags', 'dependencies'].includes(name) ? '' : ' maxlength="' + (name === 'environment' ? 80 : 100) + '"'}></label>${name === 'owner' ? '<p class="ui-helper">A label only; it grants no access.</p>' : ''}</div>`).join('')}</div>`;
}
function metadataMarkup(edit = false) {
    const grid = metadataGrid(edit);
    if (!edit)
        return `<details class="catalog-metadata"><summary>Labels (optional)</summary>${grid}</details>`;
    return `<fieldset class="catalog-metadata"><legend>Labels</legend><p class="ui-helper">Choose the fields to replace. A chosen empty field clears that label on every selected monitor.</p>${grid}</fieldset>`;
}
function readMetadata(form, edit) {
    return Object.fromEntries(fieldsFor(edit).filter(name => edit ? form.elements.namedItem('set-' + name).checked : form.elements.namedItem(name).value.trim()).map(name => {
        const value = form.elements.namedItem(name).value.trim();
        return [name, ['tags', 'dependencies'].includes(name) ? list(value) : value];
    }));
}
function trafficMarkup(plan) {
    const q = plan.quota, cost = plan.cost, t = plan.traffic;
    return `<dl class="catalog-estimates"><div><dt>Scheduled checks / day after apply</dt><dd>${escape(t.scheduledChecksPerDay.toLocaleString(undefined, { maximumFractionDigits: 2 }))}</dd></div><div><dt>Configured checks / day (including paused)</dt><dd>${escape(t.configuredChecksPerDay.toLocaleString(undefined, { maximumFractionDigits: 2 }))}</dd></div><div><dt>Monitor quota remaining after apply</dt><dd>${escape(Math.max(0, q.limit - q.after))} of ${escape(q.limit)} (${escape(q.available)} available now)</dd></div><div><dt>Estimated cost (${escape(cost.currency)})</dt><dd>${cost.status === 'unpriced' ? 'Unavailable' : escape(cost.amount)}</dd></div></dl><p class="ui-helper">${escape(t.note)}</p><p>${escape(cost.reason)}</p>`;
}
const display = value => Array.isArray(value) ? value.join(', ') : value === null ? 'None' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const every = ms => ms % 60000 === 0 ? `${ms / 60000} min` : `${ms / 1000} s`;
function entryMarkup(entry, selectable, runners) {
    const accepted = ['create', 'change'].includes(entry.action), d = entry.target;
    return `<tr><td data-label="Row">${escape(entry.label)}</td><td data-label="Monitor">${escape(entry.name ?? entry.monitorId ?? '—')}${d?.url ? `<small>${escape(d.url)}</small>` : ''}</td><td data-label="Result">${accepted && selectable ? `<label><input type="checkbox" data-plan-index="${entry.index}"${entry.selected === false ? '' : ' checked'}>Select ${escape(entry.label)} to ${escape(entry.action)}</label>` : escape(entry.action)}${entry.reason ? `<p>${escape(entry.reason)}</p>` : ''}</td><td data-label="Review">${d ? `<p>${entry.selected === false ? (d.enabled ? 'Enabled if selected' : 'Paused if selected') : (d.enabled ? 'Enabled after apply' : 'Paused after apply')} · every ${escape(every(d.intervalMs))} · ${escape(d.probes.map(probe => locations(runners).find(place => place.id === probe)?.name ?? probe).join(', '))}</p><p>Type: ${escape(d.type)}${d.assertions?.bodyIncludes ? ` · Required text: ${escape(d.assertions.bodyIncludes)}` : ''}</p>${!entry.changes ? metadata.filter(name => d[name]?.length).map(name => `<p>${escape(labels[name])}: ${escape(display(d[name]))}</p>`).join('') : ''}` : ''}${(entry.changes ?? []).map(change => `<p>${escape(change.field)}: ${escape(display(change.from))} → ${escape(display(change.to))}</p>`).join('')}${(entry.differences ?? []).map(text => `<p>${escape(text)}</p>`).join('')}</td></tr>`;
}
function previewMarkup(plan, runners) {
    return `<h3 tabindex="-1">Review the plan</h3><p>${Object.entries(plan.counts).map(([key, n]) => `${escape(n)} ${escape(key)}`).join(' · ')}</p>${trafficMarkup(plan)}${(plan.unsupported ?? []).map(text => `<p class="ui-callout">${escape(text)}</p>`).join('')}<div class="catalog-plan-table"><table class="ui-table ui-table--stack-md"><thead><tr><th scope="col">Row</th><th scope="col">Monitor</th><th scope="col">Result</th><th scope="col">Review</th></tr></thead><tbody>${plan.entries.map(entry => entryMarkup(entry, plan.source.startsWith('catalog.add.'), runners)).join('')}</tbody></table></div>`;
}
// The preview-then-apply flow every catalog form shares: Bulk add's panel (mountBulkAdd) and the dialog's edit, pause,
// resume and clone. The server plans and the form shows exactly that plan; apply sends the plan's digest. `input` builds the
// request body, `show` reports a refused request on the form itself, and `applied` draws what happens after the batch lands.
function planFlow({ api, form, resultHost, status, apply, action, runners, input, base, show, applied }) {
    let plan = null, payload = null, selectedIndexes, working = false;
    const invalidate = () => {
        plan = null;
        apply.disabled = true;
        status.textContent = 'Settings or row selection changed. Preview again before applying.';
    };
    form.addEventListener('input', event => {
        if (event.target.closest('.catalog-preview'))
            return;
        selectedIndexes = undefined;
        invalidate();
    });
    form.addEventListener('change', event => {
        if (event.target.matches('[name=locations]'))
            limitLocations(form);
        if (!event.target.matches('[data-plan-index]'))
            return;
        selectedIndexes = [...resultHost.querySelectorAll('[data-plan-index]:checked')].map(input => Number(input.dataset.planIndex));
        invalidate();
    });
    async function run(fn, options) {
        working = true;
        const result = await action(async () => {
            try {
                return await fn();
            }
            catch (error) {
                show?.(error);
                throw error;
            }
        }, options);
        working = false;
        return result;
    }
    form.onsubmit = async (event) => {
        event.preventDefault();
        if (working || !form.reportValidity())
            return;
        invalidate();
        const body = input();
        if (selectedIndexes !== undefined)
            body.selectedIndexes = selectedIndexes;
        const response = await run(() => api(`${base}preview`, 'POST', body), { pending: 'Previewing catalog changes…', success: 'Preview ready. Review the rows and estimates before applying.' });
        if (!response.ok)
            return;
        plan = response.result;
        payload = body;
        resultHost.innerHTML = previewMarkup(plan, runners);
        status.textContent = 'This is the server plan. Apply changes only the selected accepted rows shown here.';
        apply.disabled = !(plan.counts.create + plan.counts.change);
        resultHost.querySelector('h3').focus({ preventScroll: true });
    };
    apply.onclick = async () => {
        if (working || !plan || !payload)
            return;
        const reviewed = plan;
        const response = await run(() => api(`${base}apply`, 'POST', { ...payload, digest: reviewed.digest }), { pending: 'Applying reviewed catalog changes…', success: 'Catalog batch applied. Review or undo it in Settings › Backup and files.' });
        plan = null;
        apply.disabled = true;
        if (!response.ok) {
            status.textContent = 'Apply did not complete. Preview again to review the current installation.';
            return;
        }
        applied(response.result);
    };
    return { reset() { selectedIndexes = undefined; invalidate(); } };
}
const undoLink = (status, text, onClick) => {
    const link = document.createElement('a');
    link.href = '/app/settings/backup';
    link.textContent = text;
    if (onClick)
        link.addEventListener('click', onClick);
    status.append(link);
};
export function openCatalogDialog({ api, action, kind, monitors = [], runners = [], onApplied }) {
    const edit = kind === 'edit', clone = kind === 'clone', title = edit ? 'Edit monitor labels' : `${kind[0].toUpperCase() + kind.slice(1)} selected monitors`, opener = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'catalog-dialog';
    dialog.setAttribute('aria-labelledby', 'catalog-dialog-heading');
    dialog.innerHTML = `<form><h2 id="catalog-dialog-heading">${escape(title)}</h2><p>${monitors.length} selected monitors:</p><ul class="catalog-selection">${monitors.map(m => `<li>${escape(m.definition.name)} <small>${escape(m.id)}</small></li>`).join('')}</ul>${edit || clone ? metadataMarkup(edit) : ''}${clone ? '<label><input name="enableAfterCreate" type="checkbox">Enable after create — start scheduled checks when this batch is applied</label>' : ''}<p class="catalog-dialog-error ui-callout error" role="alert" hidden></p><div class="catalog-preview" aria-live="polite"></div><p class="catalog-plan-status" role="status">Nothing has changed. Preview first.</p><div class="catalog-dialog-actions"><button type="button" data-close>Cancel</button><button type="submit" class="primary">Preview</button><button type="button" data-apply disabled>Apply selected accepted rows</button></div></form>`;
    document.body.append(dialog);
    const form = dialog.querySelector('form'), resultHost = dialog.querySelector('.catalog-preview'), status = dialog.querySelector('.catalog-plan-status'), errorHost = dialog.querySelector('[role=alert]'), apply = dialog.querySelector('[data-apply]'), previewButton = form.querySelector('[type=submit]');
    function close() {
        dialog.close();
        dialog.remove();
        opener?.focus({ preventScroll: true });
    }
    dialog.querySelector('[data-close]').onclick = close;
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        close();
    });
    planFlow({ api, form, resultHost, status, apply, action, runners, base: '/api/catalog/',
        input: () => ({ monitorIds: monitors.map(m => m.id), action: kind, ...(edit || clone ? { changes: readMetadata(form, edit) } : {}), ...(clone ? { enableAfterCreate: form.elements.enableAfterCreate.checked } : {}) }),
        show: error => {
            errorHost.textContent = error.message;
            errorHost.hidden = false;
            errorHost.tabIndex = -1;
            errorHost.focus();
            errorHost.scrollIntoView({ block: 'nearest' });
        },
        applied: result => {
            previewButton.disabled = true;
            form.querySelectorAll('input,select,textarea').forEach(control => control.disabled = true);
            status.replaceChildren(document.createTextNode('Batch applied. '));
            undoLink(status, 'Review or undo this batch in Settings › Backup and files', close);
            dialog.querySelector('[data-close]').textContent = 'Done';
            onApplied?.(result);
        } });
    dialog.showModal();
    (dialog.querySelector('input,button'))?.focus();
}
// Bulk add, as the panel "Paste many URLs or a CSV" under New monitor's Other ways to add (src/editor/monitor/ways.mjs): pasted
// URLs or a CSV, previewed (nothing is written), then applied as the plan the server returned. The shared settings sit in one
// closed fold; a refused request is shown in the panel's own live status line by `action`.
const addMarkup = runners => `<h2 id="bulk-add-heading">Paste many URLs or a CSV</h2><form class="catalog-add" aria-labelledby="bulk-add-heading"><label>URLs or CSV<textarea name="text" rows="6" required spellcheck="false"></textarea></label>
 <div class="catalog-add-row"><label class="file-pill"><span class="ui-icon" data-icon="upload" aria-hidden="true"></span>Upload a CSV<input type="file" name="file" accept=".csv,text/csv"></label><label class="check-row"><input name="enableAfterCreate" type="checkbox">Start checking now</label><button type="submit" class="primary">Preview</button></div>
  <details class="catalog-shared"><summary>Shared settings</summary><p class="ui-helper">A CSV needs a url column; up to 500 rows, 2 MiB.</p><div class="catalog-grid"><label>Input format<select name="format"><option value="urls">URLs, one per line</option><option value="csv">CSV</option></select></label><label>Type<select name="type"><option value="http">HTTP</option><option value="keyword">HTTP with keyword</option></select></label><label>Required keyword<input name="keyword" maxlength="200"></label><label>Check every (minutes)<input name="interval" type="number" min="0.0834" max="1440" step="any" value="1" required></label></div>
  <fieldset class="catalog-locations"><legend>Check from</legend>${locations(runners).map(({ id, name }, i) => `<label class="check-row"><input name="locations" type="checkbox" value="${escape(id)}"${i < PROBES.length ? ' checked' : ''}>${escape(name)}</label>`).join('')}</fieldset>
  <fieldset class="catalog-metadata"><legend>Labels (optional)</legend>${metadataGrid(false)}</fieldset></details>
 <p class="catalog-dialog-error ui-callout error" role="alert" hidden></p><div class="catalog-preview" aria-live="polite"></div><p class="catalog-plan-status" role="status">Nothing has changed. Preview first.</p><div class="catalog-add-apply"><button type="button" data-apply disabled>Apply selected accepted rows</button></div></form>`;
export function mountBulkAdd(host, { api, action, runners = [], onApplied }) {
    host.innerHTML = addMarkup(runners);
    const form = host.querySelector('form'), resultHost = host.querySelector('.catalog-preview'), status = host.querySelector('.catalog-plan-status'), errorHost = host.querySelector('[role=alert]'), apply = host.querySelector('[data-apply]');
    limitLocations(form);
    const flow = planFlow({ api, form, resultHost, status, apply, action, runners, base: '/api/catalog/add/',
        input: () => ({ format: form.elements.format.value, text: form.elements.text.value, enableAfterCreate: form.elements.enableAfterCreate.checked, defaults: { ...readMetadata(form, false), type: form.elements.type.value, intervalMs: Math.round(Number(form.elements.interval.value) * 60000), ...chosenLocations(form), ...(form.elements.keyword.value ? { keyword: form.elements.keyword.value } : {}) } }),
        applied: result => {
            status.replaceChildren(document.createTextNode('Batch applied. '));
            undoLink(status, 'Review or undo this batch in Settings › Backup and files');
            status.append(document.createTextNode(' · '));
            const list = Object.assign(document.createElement('a'), { href: '/app/monitors', textContent: 'Open the monitors' });
            status.append(list);
            onApplied?.(result);
        } });
    const refuse = message => {
        errorHost.textContent = message;
        errorHost.hidden = false;
        errorHost.tabIndex = -1;
        errorHost.focus();
        errorHost.scrollIntoView({ block: 'nearest' });
    };
    form.elements.file.onchange = async () => {
        const file = form.elements.file.files[0];
        if (!file)
            return;
        flow.reset();
        form.elements.text.value = "";
        try {
            if (file.size > 2 * 1024 * 1024)
                throw Error('The CSV exceeds 2 MiB.');
            const bytes = await file.arrayBuffer();
            try {
                form.elements.text.value = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
            }
            catch {
                throw Error('The CSV must use valid UTF-8 text.');
            }
            form.elements.format.value = 'csv';
            flow.reset();
            errorHost.hidden = true;
        }
        catch (error) {
            refuse(error.message);
        }
    };
}
