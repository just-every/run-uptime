import { escape, icon, shownState } from './console-format.js';
import { openCatalogDialog } from './catalog-dialogs.js';
import { openMaintenanceDialog } from './planned-maintenance.js';
import { monitorRow } from './monitor-list.js';
import { patch } from './dom-patch.js';
const filters = ['state', 'project', 'environment', 'service', 'group', 'tags', 'owner'];
const names = { state: 'State', project: 'Project', environment: 'Environment', service: 'Service', group: 'Group', tags: 'Tag', owner: 'Owner' };
const bulk = [['edit', 'Edit labels'], ['pause', 'Pause'], ['resume', 'Resume'], ['clone', 'Clone'], ['maintenance', 'Plan maintenance']];
// Text that changes only when it differs, so a refresh leaves a live region and its node alone.
function text(element, value) {
    if (element.textContent !== value)
        element.textContent = value;
}
// The monitor list: search and one Filter, which opens the seven filters; the filters that apply as chips; and, once a
// monitor is ticked, what to do with the selection. The toolbar stays mounted during the five-second refresh. Rows and
// chips are patched, so only what changed changes, and an open panel, focus and the scroll position stay.
export function createCatalog({ api, action }) {
    const values = {}, selected = new Set();
    let current = null, host = null, visible = [], lastBatch = null, filtersOpen = false;
    // The list's search, filters and selection live in its URL (catalog-*), so a copied, bookmarked or revisited list
    // opens as it was left. Reading them rebuilds the toolbar, with the filter panel closed, on the next render.
    function read() {
        const params = new URLSearchParams(location.search);
        for (const key of ['search', ...filters])
            values[key] = params.get('catalog-' + key) ?? '';
        selected.clear();
        for (const id of (params.get('catalog-selection') ?? '').split(',').filter(Boolean))
            selected.add(id);
        host = null;
        filtersOpen = false;
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
        patch(note, lastBatch ? '<p>Catalog batch applied. <a href="/app/settings/backup">Review or undo it in Settings › Backup and files</a></p>' : '');
    }
    function showFilters(open) {
        filtersOpen = open;
        host.querySelector('#catalog-filters').hidden = !open;
        host.querySelector('#catalog-filter').setAttribute('aria-expanded', String(open));
    }
    // The toolbar's row holds search and Filter or, once a monitor is ticked, the selection's actions, in the same place,
    // so the box just ticked does not move. Its count is a live region that is always there, empty with nothing ticked.
    function selection() {
        const count = chosen().length, visibleSelected = visible.filter(m => selected.has(m.id)).length, ticked = count > 0, box = host.querySelector('#catalog-select-visible');
        host.querySelector('.catalog-toolbar').classList.toggle('is-selecting', ticked);
        host.querySelector('.catalog-tools').hidden = ticked;
        for (const part of host.querySelectorAll('#catalog-select-visible,.catalog-bulk-actions,#catalog-clear-selection'))
            part.hidden = !ticked;
        box.checked = visible.length > 0 && visibleSelected === visible.length;
        box.indeterminate = visibleSelected > 0 && visibleSelected < visible.length;
        text(host.querySelector('.catalog-selected'), ticked ? `${count} selected${count > visibleSelected ? ` (${count - visibleSelected} outside these results)` : ''}` : '');
        for (const tick of host.querySelectorAll('[data-monitor-select]')) {
            tick.checked = selected.has(tick.dataset.monitorSelect);
            tick.closest('.monitor-row').classList.toggle('is-selected', tick.checked);
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
    // Each filter that applies is a chip with its own remove button. Clear all and the count show while the list is
    // narrowed by a filter or the search; the count stays in the page as an empty live region otherwise.
    function chips() {
        const applied = filters.filter(key => values[key]), narrowed = applied.length > 0 || Boolean(values.search), row = host.querySelector('.catalog-chips'), badge = host.querySelector('.catalog-filter-count');
        row.classList.toggle('is-narrowed', narrowed);
        patch(row, (narrowed ? applied.map(key => {
            const label = `${names[key]}: ${values[key]}`;
            return `<span class="catalog-chip" data-key="chip-${key}"><span class="catalog-chip-label">${escape(label)}</span><button type="button" class="catalog-chip-remove" data-remove-filter="${key}" aria-label="Remove filter: ${escape(label)}">${icon('x')}</button></span>`;
        }).join('') + '<button type="button" class="ui-link" id="catalog-clear-filters">Clear all</button>' : '')
            + `<p class="catalog-result-count" id="catalog-result-count" role="status">${narrowed ? `${visible.length} of ${current.data.monitors.length}<span class="ui-visually-hidden"> monitors shown</span>` : ''}</p>`);
        badge.hidden = !applied.length;
        patch(badge, applied.length ? `<span class="ui-visually-hidden"> (</span>${applied.length}<span class="ui-visually-hidden"> applied)</span>` : '');
    }
    function rows() {
        const { data, readUnavailable } = current, list = host.querySelector('.catalog-rows');
        visible = data.monitors.filter(matches);
        patch(list, visible.map(m => monitorRow(m, { runners: data.runner.runners, readUnavailable, selected: selected.has(m.id) })).join(''));
        list.hidden = !visible.length;
        host.querySelector('.catalog-no-results').hidden = visible.length > 0 || !data.monitors.length;
        chips();
        selection();
    }
    function mount(area) {
        area.innerHTML = `<div class="catalog-console"><div class="catalog-toolbar"><div class="catalog-tools"><label class="catalog-search"><span class="ui-visually-hidden">Search monitors</span>${icon('search')}<input id="catalog-search" name="catalog-search" type="search" placeholder="Search monitors" value="${escape(values.search)}"></label><button type="button" id="catalog-filter" aria-expanded="false" aria-controls="catalog-filters">${icon('funnel')}Filter<span class="catalog-filter-count" hidden></span></button></div><input id="catalog-select-visible" type="checkbox" aria-label="Select all monitors" hidden><span class="catalog-selected" role="status"></span><div class="catalog-bulk-actions" hidden>${bulk.map(([kind, label]) => `<button type="button" class="ui-compact" data-bulk="${kind}">${label}</button>`).join('')}</div><button type="button" class="ui-link" id="catalog-clear-selection" hidden>Clear</button></div><div class="catalog-filters" id="catalog-filters" role="group" aria-label="Filters" hidden>${filters.map(key => `<label>${names[key]}<select id="catalog-filter-${key}" name="catalog-${key}"></select></label>`).join('')}</div><div class="catalog-chips"></div><div class="catalog-batch ui-callout" role="status" hidden></div><ul class="catalog-rows" aria-label="Monitors"></ul><p class="catalog-no-results ui-empty" hidden>No monitors match these filters.</p></div>`;
        host = area.querySelector('.catalog-console');
        const search = host.querySelector('#catalog-search'), filter = host.querySelector('#catalog-filter'), selectAll = host.querySelector('#catalog-select-visible');
        // The toolbar row's first control: Filter, or the select-all box while monitors are ticked.
        const lead = () => chosen().length ? selectAll : filter;
        search.oninput = event => {
            values.search = event.target.value;
            remember();
            rows();
        };
        filter.onclick = () => showFilters(!filtersOpen);
        // Escape closes the panel from Filter or from inside it, and focus returns to Filter (to the selection's first
        // control while monitors are ticked, which takes Filter's place).
        for (const element of [filter, host.querySelector('#catalog-filters')])
            element.addEventListener('keydown', event => {
                if (event.key !== 'Escape' || !filtersOpen)
                    return;
                event.preventDefault();
                showFilters(false);
                lead().focus();
            });
        for (const key of filters)
            host.querySelector(`[name="catalog-${key}"]`).onchange = event => {
                values[key] = event.target.value;
                remember();
                rows();
            };
        // A removed chip hands focus to the chip that takes its place, or to the toolbar row once none is left.
        host.querySelector('.catalog-chips').onclick = event => {
            const remove = event.target.closest('[data-remove-filter]');
            if (!remove && !event.target.closest('#catalog-clear-filters'))
                return;
            const index = remove ? [...host.querySelectorAll('[data-remove-filter]')].indexOf(remove) : 0;
            if (remove)
                values[remove.dataset.removeFilter] = '';
            else {
                for (const key of Object.keys(values))
                    values[key] = '';
                search.value = '';
            }
            remember();
            options();
            rows();
            const left = host.querySelectorAll('[data-remove-filter]');
            (left[Math.min(index, left.length - 1)] ?? lead()).focus();
        };
        host.querySelector('#catalog-clear-selection').onclick = () => {
            selected.clear();
            remember();
            selection();
            search.focus();
        };
        selectAll.onchange = event => {
            for (const m of visible)
                if (event.target.checked)
                    selected.add(m.id);
                else
                    selected.delete(m.id);
            remember();
            selection();
            if (!selected.size)
                search.focus();
        };
        host.querySelector('.catalog-rows').onchange = event => {
            const tick = event.target.closest('[data-monitor-select]');
            if (!tick)
                return;
            if (tick.checked)
                selected.add(tick.dataset.monitorSelect);
            else
                selected.delete(tick.dataset.monitorSelect);
            remember();
            selection();
        };
        for (const button of host.querySelectorAll('[data-bulk]'))
            button.onclick = () => button.dataset.bulk === 'maintenance' ? openMaintenanceDialog({ monitors: chosen(), api, action }) : open(button.dataset.bulk);
        showFilters(filtersOpen);
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
        },
        // The list's "Add many monitors" (public/app.js); U21 round R3's "Other ways to add" commit removes it.
        openAdd() {
            open('add');
        }, read };
}
