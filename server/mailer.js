/**
 * Outbound email, behind one function so the delivery mechanism can change
 * without touching the auth flow.
 *
 * Modes (EMAIL_MODE):
 *   console  — default. Codes print to the server console. No account needed.
 *   smtp     — send over SMTP. Works with Gmail today and with a custom domain
 *              later; only the env vars change, not this file.
 *
 * Gmail setup (interim, until the real domain exists):
 *   1. Turn on 2-Step Verification for the Google account.
 *   2. Create an App Password: https://myaccount.google.com/apppasswords
 *      Google will not accept the normal account password here.
 *   3. Put the values in .env (see .env.example):
 *        EMAIL_MODE=smtp
 *        SMTP_HOST=smtp.gmail.com
 *        SMTP_PORT=587
 *        SMTP_USER=youraddress@gmail.com
 *        SMTP_PASS=<16-char app password, spaces removed>
 *        MAIL_FROM="Care Beyond <youraddress@gmail.com>"
 *
 * Moving to a real domain later means pointing SMTP_HOST/USER/PASS/MAIL_FROM at
 * the new provider. Note that Gmail rewrites the From header to the authenticated
 * account, so MAIL_FROM's address must match SMTP_USER while on Gmail.
 */

const MODE = process.env.EMAIL_MODE || 'console';

const CODE_TTL_MINUTES = 10;

let transporter = null;

/**
 * Built once and reused — nodemailer pools the connection, and rebuilding it
 * per send is what makes Gmail start throttling.
 */
const getTransporter = () => {
  if (transporter) return transporter;

  const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `EMAIL_MODE=smtp but ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not set. ` +
        'See .env.example.'
    );
  }

  // Required lazily so console mode still works without the package installed.
  const nodemailer = require('nodemailer');

  const port = Number(process.env.SMTP_PORT || 587);

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 starts plaintext and upgrades via STARTTLS.
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      // App passwords display in groups of four; strip spaces so a copy-paste
      // straight from Google still works.
      pass: String(process.env.SMTP_PASS).replace(/\s+/g, '')
    }
  });

  return transporter;
};

const buildMessage = (email, code) => {
  const from = process.env.MAIL_FROM || `Care Beyond <${process.env.SMTP_USER}>`;

  const text =
    `Your Care Beyond sign-in code is ${code}\n\n` +
    `Enter it on the sign-in screen. It expires in ${CODE_TTL_MINUTES} minutes.\n\n` +
    `If you didn't request this, you can ignore this email — no one can sign in without the code.\n`;

  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;` +
    `max-width:480px;color:#1a1a1a;line-height:1.5">` +
    `<p style="margin:0 0 16px">Your Care Beyond sign-in code:</p>` +
    `<p style="font-size:32px;font-weight:600;letter-spacing:6px;margin:0 0 16px">${code}</p>` +
    `<p style="margin:0 0 16px">Enter it on the sign-in screen. It expires in ${CODE_TTL_MINUTES} minutes.</p>` +
    `<p style="margin:0;color:#666;font-size:13px">If you didn't request this, you can ignore this ` +
    `email — no one can sign in without the code.</p>` +
    `</div>`;

  return {
    from,
    to: email,
    subject: `${code} is your Care Beyond sign-in code`,
    text,
    html
  };
};

const sendLoginCode = async (email, code) => {
  // 'provider' is accepted as an alias so older .env files keep working.
  if (MODE === 'smtp' || MODE === 'provider') {
    const info = await getTransporter().sendMail(buildMessage(email, code));
    console.log(`Sign-in code emailed to ${email} (${info.messageId})`);
    return info;
  }

  // Dev mode: print to console so the flow is testable without an email account.
  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │  LOGIN CODE (dev mode — would be emailed)   │');
  console.log(`  │  To:   ${email.padEnd(37)}│`);
  console.log(`  │  Code: ${code.padEnd(37)}│`);
  console.log(`  │  Expires in ${CODE_TTL_MINUTES} minutes                      │`);
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');
};

/** Proves the credentials work without sending anything. Used by testMail.js. */
const verifyTransport = async () => {
  if (MODE !== 'smtp' && MODE !== 'provider') {
    throw new Error(`EMAIL_MODE is "${MODE}" — set EMAIL_MODE=smtp to test real delivery.`);
  }
  return getTransporter().verify();
};

module.exports = { sendLoginCode, verifyTransport, MODE };
