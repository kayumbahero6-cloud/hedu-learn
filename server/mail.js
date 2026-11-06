'use strict';
/* E-mail delivery. With SMTP_* set (a Gmail app password works) mail is really sent.
 * Without SMTP, development and tests keep messages in `outbox` and print them to the console; production refuses to
 * create accounts rather than silently pretending a confirmation mail was sent. */
const nodemailer = require('nodemailer');
const cfg = require('./config');

const outbox = [];
let transport = null;
const configured = () => !!(cfg.SMTP_HOST && cfg.SMTP_USER && cfg.SMTP_PASS);
function getTransport() {
  if (!transport) transport = nodemailer.createTransport({ host: cfg.SMTP_HOST, port: cfg.SMTP_PORT, secure: cfg.SMTP_PORT === 465, auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS } });
  return transport;
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout(title, bodyHtml, button) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#eef1f8;padding:24px"><div style="max-width:520px;margin:auto;background:#fff;border-radius:14px;overflow:hidden">
  <div style="background:#1b2f66;color:#fff;padding:18px 24px;font-size:20px;font-weight:bold">EduLearn</div>
  <div style="padding:24px;color:#1a2238;line-height:1.55"><h2 style="margin:0 0 12px">${esc(title)}</h2>${bodyHtml}
  ${button ? `<p style="margin:24px 0"><a href="${esc(button.url)}" style="background:#f5a800;color:#111;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px;display:inline-block">${esc(button.label)}</a></p>
  <p style="font-size:12px;color:#5a6580">If the button does not work, copy this address into your browser:<br>${esc(button.url)}</p>` : ''}
  <p style="font-size:12px;color:#5a6580;margin-top:24px">If you did not expect this message you can ignore it.</p></div></div></div>`;
}

async function send({ to, subject, text, html, meta }) {
  if (!configured()) {
    if (cfg.IS_PROD) { const e = new Error('Email delivery is not configured'); e.code = 'mail_not_configured'; throw e; }
    outbox.push({ to, subject, text, meta, at: Date.now() }); if (outbox.length > 50) outbox.shift();
    console.log(`[mail:dev] to=${to} subject="${subject}"\n${text}`);
    return { dev: true };
  }
  await getTransport().sendMail({ from: cfg.MAIL_FROM, to, subject, text, html });
  return { dev: false };
}

function verificationMail(user, url) {
  return { to: user.email, subject: 'Confirm your EduLearn email', meta: { url },
    text: `Hello ${user.name},\n\nConfirm your email to activate your EduLearn account:\n${url}\n\nThe link works for 24 hours.`,
    html: layout('Confirm your email', `<p>Hello ${esc(user.name)}, welcome to EduLearn. Confirm that this email address is yours to activate your account.</p>`, { label: 'Confirm my email', url }) };
}
module.exports = { send, verificationMail, configured, outbox };
