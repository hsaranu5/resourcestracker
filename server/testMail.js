/**
 * Checks the email config end to end, so a broken App Password shows up here
 * rather than silently swallowing a real user's sign-in code.
 *
 *   node server/testMail.js you@example.com
 *
 * Verifies the SMTP credentials, then sends one message with a fake code.
 */

require('dotenv').config();

const { sendLoginCode, verifyTransport, MODE } = require('./mailer');

const to = process.argv[2];

const run = async () => {
  console.log(`EMAIL_MODE=${MODE}`);

  if (MODE === 'console') {
    console.error(
      '\nStill in console mode — nothing will be emailed.\n' +
        'Set EMAIL_MODE=smtp in .env (copy .env.example if you have not yet).'
    );
    process.exit(1);
  }

  if (!to || !to.includes('@')) {
    console.error('\nUsage: node server/testMail.js you@example.com');
    process.exit(1);
  }

  console.log(`Connecting to ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587} as ${process.env.SMTP_USER}...`);
  await verifyTransport();
  console.log('Credentials accepted.');

  await sendLoginCode(to, '123456');
  console.log(`\nSent a test code to ${to}. Check the inbox (and spam).`);
};

run().catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  if (/Invalid login|535|BadCredentials/i.test(err.message)) {
    console.error(
      'Gmail rejects the normal account password. Enable 2-Step Verification, then\n' +
        'generate an App Password at https://myaccount.google.com/apppasswords and\n' +
        'use that as SMTP_PASS.'
    );
  }
  process.exit(1);
});
