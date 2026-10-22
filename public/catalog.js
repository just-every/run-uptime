import { escape, shownState } from './console-format.js';
import { openCatalogDialog } from './catalog-dialogs.js';
import { openMaintenanceDialog } from './planned-maintenance.js';
import { patch } from './dom-patch.js';
const filters = ['state', 'project', 'environment', 'service', 'group', 'tags', 'owner'];
const names = { state: 'State', project: 'Project', environment: 'Environment', service: 'Service', group: 'Group', tags: 'Tag', owner: 'Owner' };
export function catalogLabels(definition) {
    const parts = ['project', 'environment', 'service', 'group'].filter(key => definition[key]).map(key => `${names[key]}: ${definition[key]}`);
    if (definition.owner)
        parts.push(`Owner: ${definition.owner}`);
    if (definition.tags?.length)
        parts.push(`Tags: ${definition.tags.join(', ')}`);
    return parts.length ? `<span class="catalog-labels">${escape(parts.join(' · '))}</span>` : '';
}
// The toolbar stays mounted during the five-second refresh. Result rows are patched, so only changed cells change.
export function createCatalog({ api, action, monitorRow, coverageRule }) {
    const values = {}, selected = new Set();
    let current = null, host = null, visible = [], lastBatch = null;
    // The list's search, filters and selection live in its URL (catalog-*), so a copied, bookmarked or revisited list
    // opens as it was left. Reading them rebuilds the toolbar on the next render.
    function read() {
        const params = new URLSearchParams(location.search);
        for (const key of ['search', ...filters])
            values[key] = params.get('catalog-' + key) ?? '';
        selected.clear();
        for (const id of (params.get('catalog-selection') ?? '').split(',').filter(Boolean))
            selected.add(id);
        host = null;
    }
    read();
    function remember() {
        const url = new URL(location.href);
        for (const [key, value] of Object.entries({ ...values, selection: [...selected].join(',') })) {
            if (value)
                url.searchParams.set('catalog-' + key, value);
            else
                url.searchParams.delete('catalog-' + key);
        }
        history.replaceState(history.state, '', url);
    }
    function chosen() {
        return (current?.data.monitors ?? []).filter(m => selected.has(m.id));
    }
    function open(kind) {
        openCatalogDialog({ api, action, kind, monitors: chosen(), runners: current?.data.runner?.runners ?? [], onApplied: result => {
                lastBatch = result.batchId;
                showBatch();
            } });
    }
    function showBatch() {
        const note = host?.querySelector('.catalog-batch');
        if (!note)
            return;
        note.hidden = !lastBatch;
        note.innerHTML = lastBatch ? '<p>Catalog batch applied. <a href="/app/archive">Review or undo it in Archive</a></p>' : '';
    }
    function selection() {
        const count = chosen().length, visibleSelected = visible.filter(m => selected.has(m.id)).length, box = host.querySelector('#catalog-select-visible');
        box.checked = visible.length > 0 && visibleSelected === visible.length;
        box.indeterminate = visibleSelected > 0 && visibleSelected < visible.length;
        box.disabled = !visible.length;
        host.querySelector('.catalog-selected').textContent = `${count} selected${count > visibleSelected ? ` (${count - visibleSelected} outside these results)` : ''}`;
        for (const button of host.querySelectorAll('[data-bulk],#catalog-clear-selection'))
            button.disabled = !count;
        for (const box of host.querySelectorAll('[data-monitor-select]')) {
            box.checked = selected.has(box.dataset.monitorSelect);
            box.closest('tr').classList.toggle('is-selected', box.checked);
        }
    }
    function matches(m) {
        const d = m.definition, query = values.search.toLocaleLowerCase();
        if (query && ![m.id, d.name, d.url, d.type, ...Object.values(Object.fromEntries(['project', 'environment', 'service', 'group', 'tags', 'owner', 'outcome', 'dependencies'].map(key => [key, d[key]])))].flat().filter(Boolean).join(' ').toLocaleLowerCase().includes(query))
            return false;
        return filters.every(key => !values[key] || (key === 'state' ? shownState(m, current.readUnavailable) === values[key] : key === 'tags' ? d.tags?.includes(values[key]) : d[key] === values[key]));
    }
    function options() {
        for (const key of filters) {
            const select = host.querySelector(`[name="catalog-${key}"]`), available = [...new Set(current.data.monitors.flatMap(m => key === 'state' ? [shownState(m, current.readUnavailable)] : key === 'tags' ? m.definition.tags ?? [] : [m.definition[key]]).filter(Boolean))].sort();
            if (values[key] && !available.includes(values[key]))
                available.push(values[key]);
            const markup = `<option value="">All ${key === 'tags' ? 'tags' : key === 'state' ? 'states' : key === 'owner' ? 'owners' : key + 's'}</option>` + available.map(value => `<option value="${escape(value)}">${escape(value)}</option>`).join('');
            if (select.dataset.options !== markup) {
                select.innerHTML = markup;
                select.dataset.options = markup;
            }
            select.value = values[key];
        }
    }
    function rows() {
        const { data, readUnavailable } = current;
        visible = data.monitors.filter(matches);
        host.querySelector('.catalog-result-count').textContent = `${visible.length} of ${data.monitors.length} monitors`;
        host.querySelector('.catalog-warning').hidden = !data.monitors.some(m => m.configurationWarning);
        patch(host.querySelector('.catalog-rows'), visible.map(m => monitorRow(m, `<label class="catalog-row-select"><input type="checkbox" id="catalog-select-${escape(m.id)}" data-monitor-select="${escape(m.id)}" aria-label="Select ${escape(m.definition.name)}"${selected.has(m.id) ? ' checked' : ''}><span>Select</span></label>`)).join(''));
        host.querySelector('.catalog-no-results').hidden = visible.length > 0;
        host.querySelector('.catalog-no-results').textContent = data.monitors.length ? 'No monitors match these filters.' : 'No monitors yet. Add a monitor with New monitor or Bulk add. New monitors start Unknown until scheduled checks produce results.';
        host.querySelector('table').hidden = !visible.length;
        selection();
    }
    function mount(area) {
        area.innerHTML = `<section class="catalog-console" aria-label="Monitor catalog"><div class="catalog-toolbar"><label class="catalog-search">Search monitors<input id="catalog-search" name="catalog-search" type="search" placeholder="Name, URL, labels or monitor ID" value="${escape(values.search)}"></label><div class="catalog-filters">${filters.map(key => `<label>${names[key]}<select id="catalog-filter-${key}" name="catalog-${key}"></select></label>`).join('')}</div><p class="ui-helper">Owner is an accountability label. It does not grant permissions.</p><div class="catalog-tools"><button id="catalog-clear-filters">Clear filters</button><p class="catalog-result-count" role="status"></p></div></div><div class="catalog-bulk"><label><input id="catalog-select-visible" type="checkbox">Select visible monitors</label><span class="catalog-selected" role="status"></span><button id="catalog-clear-selection" disabled>Clear selection</button><div class="catalog-bulk-actions">${['edit', 'pause', 'resume', 'clone'].map(kind => `<button data-bulk="${kind}" disabled>${kind === 'edit' ? 'Edit labels' : kind[0].toUpperCase() + kind.slice(1)}</button>`).join('')}<button data-bulk="maintenance" disabled>Plan maintenance</button></div></div><div class="catalog-batch ui-callout" role="status" hidden></div><p class="catalog-warning ui-callout" role="status" hidden>Some monitors use their historical failure quorum. Add a second independent network or an external check URL and save their settings to enable independent failure agreement.</p><p class="metric-basis">${escape(coverageRule)}</p><div class="monitor-list"><table class="ui-table ui-table--stack-md" aria-label="Monitor status and uptime"><thead><tr><th scope="col">Select</th><th scope="col">State</th><th scope="col">Monitor</th><th scope="col">Up when</th><th scope="col">Locations</th><th scope="col">Last check</th><th scope="col">Last 24 hours</th><th scope="col">Last 7 days</th></tr></thead><tbody class="catalog-rows"></tbody></table></div><p class="catalog-no-results ui-empty" hidden></p></section>`;
        host = area.querySelector('.catalog-console');
        host.querySelector('#catalog-search').oninput = event => {
            values.search = event.target.value;
            remember();
            rows();
        };
        for (const key of filters)
            host.querySelector(`[name="catalog-${key}"]`).onchange = event => {
                values[key] = event.target.value;
                remember();
                rows();
            };
        host.querySelector('#catalog-clear-filters').onclick = () => {
            for (const key of Object.keys(values))
                values[key] = '';
            host.querySelector('#catalog-search').value = '';
            remember();
            options();
            rows();
        };
        host.querySelector('#catalog-clear-selection').onclick = () => {
            selected.clear();
            remember();
            selection();
        };
        host.querySelector('#catalog-select-visible').onchange = event => {
            for (const m of visible)
                if (event.target.checked)
                    selected.add(m.id);
                else
                    selected.delete(m.id);
            remember();
            selection();
        };
        host.querySelector('.catalog-rows').onchange = event => {
            const box = event.target.closest('[data-monitor-select]');
            if (!box)
                return;
            if (box.checked)
                selected.add(box.dataset.monitorSelect);
            else
                selected.delete(box.dataset.monitorSelect);
            remember();
            selection();
        };
        for (const button of host.querySelectorAll('[data-bulk]'))
            button.onclick = () => button.dataset.bulk === 'maintenance' ? openMaintenanceDialog({ monitors: chosen(), api, action }) : open(button.dataset.bulk);
        showBatch();
    }
    return { render({ area, data, readUnavailable }) {
            current = { data, readUnavailable };
            for (const id of selected)
                if (!data.monitors.some(m => m.id === id))
                    selected.delete(id);
            if (!host?.isConnected || !area.contains(host))
                mount(area);
            options();
            rows();
            showBatch();
        }, openAdd() {
            open('add');
        }, read };
}
