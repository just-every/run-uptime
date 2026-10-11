
// Art is requested only when the user commits a changed workspace field.
export function workspaceArt({ request, read, save, model: {fields} }) {
  const contextKeys = Object.keys(fields).filter(key => fields[key].artwork);
  const activeKeys = draft => contextKeys.filter(key => fields[key].visible?.(draft) !== false);
  const signature = draft => JSON.stringify(activeKeys(draft).map(key => [key, draft[key]]));
  let dirty = false, attached = false, lastRequested = '', committing = Promise.resolve();
  return {
    update(state) { attached = state.agent?.attached === true; },
    edited(key) { if (contextKeys.includes(key)) dirty = true; },
    commit() {
      committing = committing.catch(() => {}).then(async () => {
        if (!dirty) return;
        const draft = read(), current = signature(draft);
        await save();
        if (signature(read()) !== current) return;
        if (!attached) return;
        if (!activeKeys(draft).every(key => {
          const definition = fields[key].definition?.(draft) ?? fields[key];
          return (definition.optional && !draft[key]) || definition.valid(draft[key]);
        })) return;
        if (current === lastRequested) { dirty = false; return; }
        await request('/api/workspace-art', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        lastRequested = current;
        if (signature(read()) === current) dirty = false;
      });
      return committing;
    },
  };
}
