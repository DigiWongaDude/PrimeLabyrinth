import { G5_API_URL } from './g5-config.js';
import { TURNSTILE_SITE_KEY } from './invitation-request-config.js';

const form = document.querySelector('#invitation-request-form');
const status = document.querySelector('#request-status');
let turnstileToken = '';
let widgetId = null;
function say(text) { status.textContent = text; }
function renderTurnstile() {
  if (!TURNSTILE_SITE_KEY || !window.turnstile) { say('Invitation requests are not open in this preview.'); return; }
  widgetId = window.turnstile.render('#turnstile-widget', { sitekey: TURNSTILE_SITE_KEY, action: 'invitation_request', callback: token => { turnstileToken = token; }, 'expired-callback': () => { turnstileToken = ''; }, 'error-callback': () => { turnstileToken = ''; } });
}
window.addEventListener('load', renderTurnstile, { once: true });
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!G5_API_URL || !TURNSTILE_SITE_KEY || !turnstileToken) { say('This request preview is not configured yet.'); return; }
  const data = Object.fromEntries(new FormData(form));
  data.privacyAccepted = document.querySelector('#request-privacy').checked;
  data.turnstileToken = turnstileToken;
  say('Sending your request…');
  try {
    const response = await fetch(`${G5_API_URL}/v1/invitation-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!response.ok && response.status !== 202) throw new Error('request_failed');
    form.reset(); turnstileToken = ''; if (widgetId !== null) window.turnstile.reset(widgetId);
    say('Your request has been received for private review. It is not an account or subscription.');
  } catch { say('We could not receive that request. Please try again later.'); }
});
