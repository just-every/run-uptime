# Investigation notes

Original Verify 43014289681 attempt 2 completed failure. The push-5 archive points to security-controls-browser-support.mjs:106, the post-restart credential row. The push-7 failed-log archive contained no failed steps.

The same security timeout reproduced on Node 22.20.0. Browser response diagnostics identified HTTP 429 responses for public JavaScript modules after the restart. The key panel could not initialize because of the persisted per-client asset limit; the final dynamic import error was a consequence. This was not a deliberately changed form label or README assertion.

A bounded Retry-After reload in the existing registration passed the full operator-security journey locally. Before publication of that adjustment, refreshed main (1b74086) supplied its own smaller fix: wait for the next real asset minute before opening the replacement cold browser. The merge retains that newer test whole; the intermediate local adjustment is superseded. No assertion was removed or weakened, no counter was reset, no production limiter was changed, and no new registration was added.

Two early standalone diagnostics used node --input-type=module; Miniflare's synchronous worker thread hung before obtaining its D1 proxy. Those task-owned processes were stopped and file-based diagnostics used instead. The real command journey and final verification use ordinary .mjs entrypoints. The initial Node 24 typecheck passed; final typecheck and browser security proof use Node 22.20.0.
