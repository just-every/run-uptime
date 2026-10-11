/** Read one bounded UTF-8 line at a time; never materialize the complete archive. */
export async function* archiveLines(source, maxLineBytes) {
  if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 1) throw new Error('Invalid archive line limit.');
  const reader = source.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = new Uint8Array(Math.min(maxLineBytes, 65_536)), bytes = 0;
  function append(fragment) {
    const required = bytes + fragment.byteLength;
    if (required > maxLineBytes) throw new Error('An archive line exceeds the supported size.');
    if (required > buffer.length) {
      const grown = new Uint8Array(Math.min(maxLineBytes, Math.max(required, buffer.length * 2)));
      grown.set(buffer.subarray(0, bytes)); buffer = grown;
    }
    buffer.set(fragment, bytes); bytes = required;
  }
  function line() {
    const value = decoder.decode(buffer.subarray(0, bytes)); bytes = 0;
    return value.endsWith('\r') ? value.slice(0, -1) : value;
  }
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      let offset = 0;
      for (let index = 0; index < next.value.length; index++) {
        if (next.value[index] !== 10) continue;
        append(next.value.subarray(offset, index));
        yield line(); offset = index + 1;
      }
      append(next.value.subarray(offset));
    }
    if (bytes) yield line();
  } finally {
    await reader.cancel(); reader.releaseLock();
  }
}
