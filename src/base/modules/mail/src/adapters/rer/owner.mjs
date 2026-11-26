import { createMailSender } from '../../sender.mjs';
import { parseAddress } from '../../core/validation.mjs';
import { sendResult } from '../../core/transport.mjs';

/** Owner-only Business relay. The owner and relay URL come from trusted deployment settings. */
export function createOwnerRelaySender({ ownerEmail, relayUrl, apiKey }, dependencies) {
  return {
    async send(message) {
      let result;
      try {
        const owner = parseAddress(ownerEmail).email.toLowerCase();
        const { to } = message;
        if (!Array.isArray(to) || to.length !== 1 || parseAddress(to[0]).email.toLowerCase() !== owner) {
          result = sendResult('rer', 'rejected', null, 'rer_owner_recipient_required');
        } else {
          const sender = createMailSender({ provider: 'rer', mode: 'production', relayUrl, apiKey }, dependencies);
          // Only the trusted mailbox can reach the transport, even if the caller changes its array.
          result = await sender.send({ ...message, to: [owner] });
        }
      } catch {
        result = sendResult('rer', 'rejected', null, 'invalid_owner_relay_input');
      }
      if (result.status !== 'accepted') console.warn('Owner mail relay failed', result.code);
      return result;
    },
  };
}
