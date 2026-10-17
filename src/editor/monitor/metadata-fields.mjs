// Accountability labels describe the monitor; they never grant operator access.
export const METADATA_FIELDS = ['project', 'environment', 'service', 'group', 'tags', 'owner', 'outcome', 'dependencies'];
const labels = { project: 'Project', environment: 'Environment', service: 'Service', group: 'Group', tags: 'Tags (comma-separated)', owner: 'Accountable owner', outcome: 'Intended customer outcome', dependencies: 'Dependency monitor IDs (comma-separated)' };
const limits = { project: 100, environment: 80, service: 100, group: 100, owner: 100, outcome: 500 };
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
        card.innerHTML = '<h2>Organization and ownership</h2><p class="helper ui-helper">Owner is an accountability label. It does not grant permissions.</p><div class="editor-fields">' + METADATA_FIELDS.map(name => `<label>${labels[name]}${name === 'outcome' ? `<textarea name="${name}" maxlength="500"></textarea>` : `<input name="${name}"${limits[name] ? ` maxlength="${limits[name]}"` : ''}>`}</label>`).join('') + '</div>';
    const values = metadataValues(definition);
    for (const name of METADATA_FIELDS) {
        const input = root.querySelector(`[name="${name}"]`);
        if (input)
            input.value = values[name];
    }
}
export function readMetadata(root, definition) {
    const result = {};
    for (const name of METADATA_FIELDS) {
        const input = root.querySelector(`[name="${name}"]`);
        if (!input)
            continue;
        const value = input.value.trim();
        if (!value && !Object.hasOwn(definition, name))
            continue;
        result[name] = ['tags', 'dependencies'].includes(name) ? value.split(',').map(item => item.trim()).filter(Boolean) : value;
    }
    return result;
}
