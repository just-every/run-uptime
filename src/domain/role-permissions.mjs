// Edition authorization is separate from Base's live session authentication.
// Only actions wired to a route are available. Unknown roles/actions deny.
const monitorReaders = new Set(['owner', 'admin']);
export function permitted(role, action) {
 return action === 'monitor:summary:read' && monitorReaders.has(role);
}
