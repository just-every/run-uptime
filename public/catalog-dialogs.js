import { escape } from './console-format.js';
const metadata = ['project', 'environment', 'service', 'group', 'tags', 'owner', 'outcome', 'dependencies'];
const labels = { project: 'Project', environment: 'Environment', service: 'Service', group: 'Group', tags: 'Tags (comma-separated)', owner: 'Accountable owner', outcome: 'Intended customer outcome', dependencies: 'Dependency monitor IDs (comma-separated)' };
const list = value => value.split(',').map(part => part.trim()).filter(Boolean);
function metadataMarkup(edit = false) {
    return `<fieldset class="catalog-metadata"><legend>Organization and ownership</legend><p class="ui-helper">Owner is an accountability label. It does not grant permissions.</p>${edit ? '<p class="ui-helper">Choose the fields to replace. A chosen empty field clears that label on every selected monitor.</p>' : ''}<div class="catalog-grid">${metadata.map(name => `<div>${edit ? `<label><input type="checkbox" name="set-${name}">Replace ${escape(labels[name])}</label>` : ''}<label>${escape(labels[name])}<input name="${name}"${name === 'outcome' ? ' maxlength="500"' : ['tags', 'dependencies'].includes(name) ? '' : ' maxlength="' + (name === 'environment' ? 80 : 100) + '"'}></label></div>`).join('')}</div></fieldset>`;
}
function readMetadata(form, edit) {
    return Object.fromEntries(metadata.filter(name => edit ? form.elements.namedItem('set-' + name).checked : form.elements.namedItem(name).value.trim()).map(name => {
        const value = form.elements.namedItem(name).value.trim();
        return [name, ['tags', 'dependencies'].includes(name) ? list(value) : value];
    }));
}
function trafficMarkup(plan) {
    const q = plan.quota, cost = plan.cost, t = plan.traffic;
    return `<dl class="catalog-estimates"><div><dt>Scheduled checks / day after apply</dt><dd>${escape(t.scheduledChecksPerDay.toLocaleString(undefined, { maximumFractionDigits: 2 }))}</dd></div><div><dt>Configured checks / day (including paused)</dt><dd>${escape(t.configuredChecksPerDay.toLocaleString(undefined, { maximumFractionDigits: 2 }))}</dd></div><div><dt>Monitor quota remaining after apply</dt><dd>${escape(Math.max(0, q.limit - q.after))} of ${escape(q.limit)} (${escape(q.available)} available now)</dd></div><div><dt>Estimated cost (${escape(cost.currency)})</dt><dd>${cost.status === 'unpriced' ? 'Unavailable' : escape(cost.amount)}</dd></div></dl><p class="ui-helper">${escape(t.note)}</p><p>${escape(cost.reason)}</p>`;
}
const display = value => Array.isArray(value) ? value.join(', ') : value === null ? 'None' : typeof value === 'object' ? JSON.stringify(value) : String(value);
function entryMarkup(entry, selectable) {
    const accepted = ['create', 'change'].includes(entry.action), d = entry.target;
    return `<tr><td data-label="Row">${escape(entry.label)}</td><td data-label="Monitor">${escape(entry.name ?? entry.monitorId ?? '—')}${d?.url ? `<small>${escape(d.url)}</small>` : ''}</td><td data-label="Result">${accepted && selectable ? `<label><input type="checkbox" data-plan-index="${entry.index}"${entry.selected === false ? '' : ' checked'}>Select ${escape(entry.label)} to ${escape(entry.action)}</label>` : escape(entry.action)}${entry.reason ? `<p>${escape(entry.reason)}</p>` : ''}</td><td data-label="Review">${d ? `<p>${entry.selected === false ? (d.enabled ? 'Enabled if selected' : 'Paused if selected') : (d.enabled ? 'Enabled after apply' : 'Paused after apply')} · ${escape(d.intervalMs / 1000)} seconds · ${escape(d.probes.join(', '))}</p><p>Type: ${escape(d.type)}${d.assertions?.bodyIncludes ? ` · Required text: ${escape(d.assertions.bodyIncludes)}` : ''}</p>${!entry.changes ? metadata.filter(name => d[name]?.length).map(name => `<p>${escape(labels[name])}: ${escape(display(d[name]))}</p>`).join('') : ''}` : ''}${(entry.changes ?? []).map(change => `<p>${escape(change.field)}: ${escape(display(change.from))} → ${escape(display(change.to))}</p>`).join('')}${(entry.differences ?? []).map(text => `<p>${escape(text)}</p>`).join('')}</td></tr>`;
}
function previewMarkup(plan) {
    return `<h3 tabindex="-1">Review the plan</h3><p>${Object.entries(plan.counts).map(([key, n]) => `${escape(n)} ${escape(key)}`).join(' · ')}</p>${trafficMarkup(plan)}${(plan.unsupported ?? []).map(text => `<p class="ui-callout">${escape(text)}</p>`).join('')}<div class="catalog-plan-table"><table class="ui-table ui-table--stack-md"><thead><tr><th scope="col">Row</th><th scope="col">Monitor</th><th scope="col">Result</th><th scope="col">Review</th></tr></thead><tbody>${plan.entries.map(entry => entryMarkup(entry, plan.source.startsWith('catalog.add.'))).join('')}</tbody></table></div>`;
}
export function openCatalogDialog({ api, action, kind, monitors = [], onApplied }) {
    const add = kind === 'add', edit = kind === 'edit', clone = kind === 'clone', creating = add || clone, title = add ? 'Bulk add monitors' : edit ? 'Edit monitor labels' : `${kind[0].toUpperCase() + kind.slice(1)} selected monitors`, opener = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'catalog-dialog';
    dialog.setAttribute('aria-labelledby', 'catalog-dialog-heading');
    dialog.innerHTML = `<form><h2 id="catalog-dialog-heading">${escape(title)}</h2>${add ? `<p>Paste public URLs, one per line, or upload a CSV with up to 500 rows. Review the results before applying.</p><div class="catalog-grid"><label>Input format<select name="format"><option value="urls">URLs, one per line</option><option value="csv">CSV</option></select></label><label>Upload CSV (2 MiB max)<input type="file" name="file" accept=".csv,text/csv"></label></div><label>URLs or CSV<textarea name="text" rows="6" required spellcheck="false"></textarea></label><p class="ui-helper">CSV needs a url column. Optional columns: name, type, keyword, interval (seconds), tags and group. Rows can override the shared settings.</p><fieldset><legend>Shared settings</legend><div class="catalog-grid"><label>Type<select name="type"><option value="http">HTTP</option><option value="keyword">HTTP with keyword</option></select></label><label>Required keyword<input name="keyword" maxlength="200"></label><label>Check every (seconds)<input name="interval" type="number" min="5" max="86400" step="0.001" value="60" required></label></div><fieldset class="catalog-locations"><legend>Locations / checks</legend>${['local-a', 'local-b', 'local-c'].map((id, i) => `<label><input name="locations" type="checkbox" value="${id}"${i === 0 ? ' checked' : ''}>Check ${i + 1} (${id})</label>`).join('')}</fieldset><p class="ui-helper">Each check uses its assigned runner network. Check labels alone do not establish geographic independence.</p><p class="ui-helper">New monitors inherit their service, group or installation alert route. Open a monitor’s Alert recipients panel to review or change the contacts. A named route request in an API batch is still reported as unsupported.</p></fieldset>` : `<p>${monitors.length} selected monitors:</p><ul class="catalog-selection">${monitors.map(m => `<li>${escape(m.definition.name)} <small>${escape(m.id)}</small></li>`).join('')}</ul>`}${add || edit || clone ? metadataMarkup(edit || clone) : ''}${creating ? '<label><input name="enableAfterCreate" type="checkbox">Enable after create — start scheduled checks when this batch is applied</label>' : ''}<p class="catalog-dialog-error ui-callout error" role="alert" hidden></p><div class="catalog-preview" aria-live="polite"></div><p class="catalog-plan-status" role="status">Nothing has changed. Preview first.</p><div class="catalog-dialog-actions"><button type="button" data-close>Cancel</button><button type="submit" class="primary">Preview</button><button type="button" data-apply disabled>Apply selected accepted rows</button></div></form>`;
    document.body.append(dialog);
    const form = dialog.querySelector('form'), resultHost = dialog.querySelector('.catalog-preview'), status = dialog.querySelector('.catalog-plan-status'), errorHost = dialog.querySelector('[role=alert]'), apply = dialog.querySelector('[data-apply]'), previewButton = form.querySelector('[type=submit]');
    let plan = null, payload = null, selectedIndexes, working = false;
    function close() {
        if (working)
            return;
        dialog.close();
        dialog.remove();
        opener?.focus({ preventScroll: true });
    }
    dialog.querySelector('[data-close]').onclick = close;
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        close();
    });
    function invalidate() {
        plan = null;
        apply.disabled = true;
        status.textContent = 'Settings or row selection changed. Preview again before applying.';
    }
    form.addEventListener('input', event => {
        if (event.target.closest('.catalog-preview'))
            return;
        selectedIndexes = undefined;
        invalidate();
    });
    form.addEventListener('change', event => {
        if (!event.target.matches('[data-plan-index]'))
            return;
        selectedIndexes = [...resultHost.querySelectorAll('[data-plan-index]:checked')].map(input => Number(input.dataset.planIndex));
        invalidate();
    });
    if (add)
        form.elements.file.onchange = async () => {
            const file = form.elements.file.files[0];
            if (!file)
                return;
            selectedIndexes = undefined;
            form.elements.text.value = "";
            invalidate();
            try {
                if (file.size > 2 * 1024 * 1024)
                    throw Error('The CSV exceeds 2 MiB.');
                const bytes=await file.arrayBuffer();
                try{form.elements.text.value=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)}catch{throw Error('The CSV must use valid UTF-8 text.')}

                form.elements.format.value = 'csv';
                selectedIndexes = undefined;
                invalidate();
                errorHost.hidden = true;
            }
            catch (error) {
                errorHost.textContent = error.message;
                errorHost.hidden = false;
                errorHost.tabIndex=-1;errorHost.focus();errorHost.scrollIntoView({block:'nearest'});
            }
        };
    function input() {
        const body = add ? { format: form.elements.format.value, text: form.elements.text.value, defaults: { ...readMetadata(form, false), type: form.elements.type.value, intervalMs: Number(form.elements.interval.value) * 1000, locations: [...form.querySelectorAll('[name=locations]:checked')].map(box => box.value), ...(form.elements.keyword.value ? { keyword: form.elements.keyword.value } : {}) } } : { monitorIds: monitors.map(m => m.id), action: kind, ...(edit || clone ? { changes: readMetadata(form, true) } : {}) };
        if (creating)
            body.enableAfterCreate = form.elements.enableAfterCreate.checked;
        if (selectedIndexes !== undefined)
            body.selectedIndexes = selectedIndexes;
        return body;
    }
    async function run(fn, options) {
        errorHost.hidden = true;
        working = true;
        const result = await action(async () => {
            try {
                return await fn();
            }
            catch (error) {
                errorHost.textContent = error.message;
                errorHost.hidden = false;
                errorHost.tabIndex=-1;errorHost.focus();errorHost.scrollIntoView({block:'nearest'});
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
        const response = await run(() => api(`/api/catalog/${add ? 'add/' : ''}preview`, 'POST', body), { pending: 'Previewing catalog changes…', success: 'Preview ready. Review the rows and estimates before applying.' });
        if (!response.ok)
            return;
        plan = response.result;
        payload = body;
        resultHost.innerHTML = previewMarkup(plan);
        status.textContent = 'This is the server plan. Apply changes only the selected accepted rows shown here.';
        apply.disabled = !(plan.counts.create + plan.counts.change);
        resultHost.querySelector('h3').focus({ preventScroll: true });
    };
    apply.onclick = async () => {
        if (working || !plan || !payload)
            return;
        const reviewed = plan;
        const response = await run(() => api(`/api/catalog/${add ? 'add/' : ''}apply`, 'POST', { ...payload, digest: reviewed.digest }), { pending: 'Applying reviewed catalog changes…', success: 'Catalog batch applied. Review or undo it in Definitions.' });
        if (!response.ok) {
            plan = null;
            apply.disabled = true;
            status.textContent = 'Apply did not complete. Preview again to review the current installation.';
            return;
        }
        plan = null;
        apply.disabled = true;
        previewButton.disabled = true;
        form.querySelectorAll('input,select,textarea').forEach(control => control.disabled = true);
        status.replaceChildren(document.createTextNode('Batch applied. '));
        const link = document.createElement('a');
        link.href = '/app#definitions';
        link.textContent = 'Review or undo this batch in Definitions';
        link.addEventListener('click',close);
        status.append(link);
        dialog.querySelector('[data-close]').textContent = 'Done';
        onApplied?.(response.result);
    };
    dialog.showModal();
    (form.querySelector('[name=text]') ?? dialog.querySelector('input,button'))?.focus();
}
