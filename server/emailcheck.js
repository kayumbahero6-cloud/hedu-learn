'use strict';
/* Is this a plausible, deliverable address? Syntax, throwaway domains, common typos, and a DNS MX lookup so made-up domains are rejected.
 * Only the confirmation link proves the mailbox is real and belongs to the person; this just stops obvious junk early. */
const dns = require('node:dns').promises;
const cfg = require('./config');

const DISPOSABLE = new Set(['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com', 'trashmail.com', 'getnada.com', 'sharklasers.com',
  'throwawaymail.com', 'maildrop.cc', 'dispostable.com', 'fakeinbox.com', 'mintemail.com', 'emailondeck.com', 'mohmal.com', 'tempail.com', 'moakt.com', 'spambox.us', 'burnermail.io']);
const TYPOS = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gmaill.com': 'gmail.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'outlok.com': 'outlook.com', 'iclod.com': 'icloud.com' };
const cache = new Map();

async function hasMailServer(domain) {
  const hit = cache.get(domain); if (hit && hit.until > Date.now()) return hit.ok;
  let ok = null;
  try { const mx = await dns.resolveMx(domain); ok = mx.length > 0; }
  catch (e) {
    if (e.code === 'ENODATA' || e.code === 'ENOTFOUND') { try { const a = await dns.resolve4(domain); ok = a.length > 0; } catch (e2) { ok = ['ENODATA', 'ENOTFOUND'].includes(e2.code) ? false : null; } }
    else ok = null;                                   // DNS unreachable or timed out: do not punish the user, the confirmation mail decides
  }
  if (ok !== null) cache.set(domain, { ok, until: Date.now() + 6 * 3600e3 });
  return ok !== false;
}

/** Returns { ok, email, error } */
async function checkEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (email.length > 200 || !/^[a-z0-9._%+\-']{1,64}@[a-z0-9\-]+(\.[a-z0-9\-]+)+$/.test(email) || /\.\./.test(email) || email.startsWith('.') || email.split('@')[0].endsWith('.'))
    return { ok: false, error: 'Enter a valid email address' };
  const domain = email.split('@')[1];
  if (TYPOS[domain]) return { ok: false, error: `Did you mean ${email.split('@')[0]}@${TYPOS[domain]}?` };
  if (DISPOSABLE.has(domain)) return { ok: false, error: 'Temporary email addresses are not accepted. Use your own email.' };
  if (cfg.CHECK_MX && !(await hasMailServer(domain))) return { ok: false, error: `The domain "${domain}" cannot receive email. Check the spelling.` };
  return { ok: true, email };
}
module.exports = { checkEmail };
