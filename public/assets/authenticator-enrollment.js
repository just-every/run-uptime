import {copyButton} from './copy-button.js';
// The URI, QR and manual secret all come from one installation-local enrollment.
// Build with DOM properties: neither an account label nor factor material becomes HTML.
export function authenticatorEnrollment(host,pending){
 host.innerHTML='<form class="notification-form"><p>Use an authenticator app, such as 1Password, Google Authenticator or Authy. Scan this QR code with it, or open the link on this device. Without a camera, type the secret below into the app.</p><img data-totp-qr alt="Authenticator enrollment QR code" width="224" height="224"><a data-totp-uri>Open in authenticator app</a><label>Authenticator secret (shown once)<output data-totp-secret></output></label><span data-totp-copy></span><label>Confirm authenticator code<input name="code" inputmode="numeric" autocomplete="one-time-code" required></label><button>Confirm authenticator</button></form>';
 host.querySelector('[data-totp-qr]').src='data:image/svg+xml,'+encodeURIComponent(pending.qrCode);
 host.querySelector('[data-totp-uri]').href=pending.uri;
 host.querySelector('[data-totp-secret]').textContent=pending.secret;
 host.querySelector('[data-totp-copy]').replaceWith(copyButton('secret',()=>pending.secret));
 host.querySelector('input').focus();
 return host.querySelector('form');
}
