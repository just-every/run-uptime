// Continue the delivery lifecycle with a definite rejection, bounded retry, uncertainty and fallback.
const {proveNotificationRetry}=await import('./notify-retry-fixture.mjs');
const {inspectEchoCustody}=await import('./notify-echo-fixture.mjs');
const {inspectDeliveryChains,inspectQuietFallback}=await import('./notify-chain-browser.mjs');
await proveNotificationRetry(inspectDeliveryChains,inspectQuietFallback,inspectEchoCustody);
await (await import('./notify-oncall-fixture.mjs')).proveOncallHandoff();
