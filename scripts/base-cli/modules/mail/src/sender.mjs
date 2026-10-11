import { validateConfig, validateMessage, validateSendResult } from './core/validation.mjs';
import { fail } from './core/errors.mjs';
import { sendSendGrid } from './adapters/sendgrid/index.mjs';
import { sendResend } from './adapters/resend/index.mjs';
import { sendCloudflare } from './adapters/cloudflare/index.mjs';
import { sendDevelopment } from './development/index.mjs';
import { applyUnsubscribeHeaders } from './unsubscribe/index.mjs';

const transports = { sendgrid: sendSendGrid, resend: sendResend, cloudflare: sendCloudflare, development: sendDevelopment };

/** Explicit configuration; a missing/failed provider never selects another path. */
export function createMailSender(config, dependencies = {}) {
  validateConfig(config, dependencies);
  const configured = Object.freeze({ ...config });
  const host = Object.freeze({ ...dependencies });
  const transport = transports[configured.provider];
  return Object.freeze({
    async send(message) {
      validateMessage(message, configured.provider);
      let snapshot;
      try { snapshot = structuredClone(message); } catch { fail('invalid_message'); }
      const prepared = applyUnsubscribeHeaders(snapshot);
      validateMessage(prepared, configured.provider);
      return validateSendResult(await transport(configured, prepared, host), configured.provider);
    },
  });
}
