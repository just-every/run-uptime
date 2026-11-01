// Test-owned identifiers come only from completed native HTTP/tool responses.
export const phaseState = new Map();
export const discoveries = new Map();
export function rememberDiscovery(origin, id) {
 if (typeof id !== 'string' || !id) throw new Error('Native discovery did not return its identifier.');
 if (!discoveries.has(origin)) discoveries.set(origin, new Set());
 discoveries.get(origin).add(id);
}
