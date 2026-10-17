import {X509Certificate, createPrivateKey} from 'node:crypto';
import {fields, text, credentialError} from './validation.mjs';
export function clientTls(input) {
  fields(input, ['clientCertificatePem', 'clientPrivateKeyPem'], ['passphrase']);
  for (const key of ['clientCertificatePem', 'clientPrivateKeyPem']) if (typeof input[key] !== 'string' || !input[key] || Buffer.byteLength(input[key]) > 32768) throw credentialError();
  if (input.passphrase !== undefined) text(input.passphrase, 4096);
  const blocks = input.clientCertificatePem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (!blocks?.length || blocks.length > 8 || input.clientCertificatePem.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim()) throw credentialError();
  const certificates = blocks.map(block => new X509Certificate(block)), now = Date.now();
  for (const cert of certificates) if (!(Date.parse(cert.validFrom) <= now && now < Date.parse(cert.validTo))) throw credentialError();
  const key = createPrivateKey({key: input.clientPrivateKeyPem, ...(input.passphrase !== undefined ? {passphrase: input.passphrase} : {})});
  if (!certificates[0].checkPrivateKey(key)) throw credentialError();
  if (key.asymmetricKeyType === 'rsa' && key.asymmetricKeyDetails?.modulusLength < 2048) throw credentialError();
  return {cert: input.clientCertificatePem, key: input.clientPrivateKeyPem, ...(input.passphrase !== undefined ? {passphrase: input.passphrase} : {})};
}
