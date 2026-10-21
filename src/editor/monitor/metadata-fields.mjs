// Accountability labels describe the monitor; they never grant operator access.
export const METADATA_FIELDS = ['project', 'environment', 'service', 'group', 'tags', 'owner', 'outcome', 'dependencies'];
const labels = { project: 'Project', environment: 'Environment', service: 'Service', group: 'Group', tags: 'Tags (comma-separated)', owner: 'Accountable owner', outcome: 'Intended customer outcome' };
const limits = { project: 100, environment: 80, service: 100, group: 100, owner: 100, outcome: 500 };
const hints = { owner: 'A label only; it grants no access.' };
const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const field = name => `<label>${labels[name]}${name === 'outcome' ? `<textarea name="${name}" maxlength="500"></textarea>` : `<input name="${name}"${limits[name] ? ` maxlength="${limits[name]}"` : ''}>`}${hints[name] ? `<span class="helper ui-helper">${hints[name]}</span>` : ''}</label>`;
export function metadataValues(definition) { return Object.fromEntries(METADATA_FIELDS.map(name => [name, Array.isArray(definition[name]) ? definition[name].join(', ') : definition[name] ?? ''])); }
export function fillMetadata(root, definition) {
    let card = root.querySelector('[data-monitor-metadata]');
    if (!card) {
        card = document.createElement('section');
        card.className = 'editor-panel ui-card';
        card.dataset.monitorMetadata = '';
        root.querySelector('.editor-stack')?.append(card);
    }
    if (!card.children.length)
        card.innerHTML = '<details class="editor-field labels-fold"><summary>Labels (optional)</summary><div class="editor-fields">' + METADATA_FIELDS.filter(name => name !== 'dependencies').map(field).join('') + '<fieldset class="dependency-picker" hidden><legend>Depends on</legend></fieldset></div></details>';
    const values = metadataValues(definition);
    for (const name of METADATA_FIELDS) {
        const input = root.querySelector(`[name="${name}"]`);
        if (input && name !== 'dependencies')
            input.value = values[name];
    }
    for (const box of root.querySelectorAll('[name="dependencies"]'))
        box.checked = (definition.dependencies ?? []).includes(box.value);
    card.querySelector('details').open = METADATA_FIELDS.some(name => values[name]);
}
// The other monitors this one can depend on, as a checklist; none to choose from keeps the group hidden.
export function setDependencyChoices(root, monitors, selected = []) {
    const group = root.querySelector('.dependency-picker');
    if (!group)
        return;
    group.querySelectorAll('label').forEach(label => label.remove());
    group.insertAdjacentHTML('beforeend', monitors.map(monitor => `<label class="check-row"><input type="checkbox" name="dependencies" value="${escapeHtml(monitor.id)}"${selected.includes(monitor.id) ? ' checked' : ''}>${escapeHtml(monitor.name)}</label>`).join(''));
    group.hidden = !monitors.length;
}
export function readMetadata(root, definition) {
    const result = {};
    for (const name of METADATA_FIELDS) {
        if (name === 'dependencies') {
            const boxes = [...root.querySelectorAll('[name="dependencies"]')];
            if (!boxes.length && !root.querySelector('.dependency-picker:not([hidden])'))
                continue;
            const chosen = boxes.filter(box => box.checked).map(box => box.value);
            if (chosen.length || Object.hasOwn(definition, name))
                result[name] = chosen;
            continue;
        }
        const input = root.querySelector(`[name="${name}"]`);
        if (!input)
            continue;
        const value = input.value.trim();
        if (!value && !Object.hasOwn(definition, name))
            continue;
        result[name] = name === 'tags' ? value.split(',').map(item => item.trim()).filter(Boolean) : value;
    }
    return result;
}
