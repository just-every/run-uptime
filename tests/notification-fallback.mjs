// A configured fallback waits for its owner-selected delay and stops when recovery or primary acceptance removes its authority.
await (await import('./notify-fallback-fixture.mjs')).proveDependencyFallback();
