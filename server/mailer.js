/**
 * Outbound email, behind one function so the delivery mechanism can change
 * without touching the auth flow.
 *
 * Dev mode (default): codes are printed to the server console. Set
 * EMAIL_MODE=console explicitly or leave unset.
 *
 * To go live, set EMAIL_MODE=provider and implement sendViaProvider() with
 * your chosen service (Resend, SendGrid, SMTP...). Nothing else changes.
 */

const MODE = process.env.EMAIL_MODE || 'console';

const sendLoginCode = async (email, code) => {
  if (MODE === 'provider') {
    return sendViaProvider(email, code);
  }

  // Dev mode: print to console so the flow is testable without an email account.
  console.log('');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log('  │  LOGIN CODE (dev mode — would be emailed)   │');
  console.log(`  │  To:   ${email.padEnd(37)}│`);
  console.log(`  │  Code: ${code.padEnd(37)}│`);
  console.log('  │  Expires in 10 minutes                      │');
  console.log('  └─────────────────────────────────────────────┘');
  console.log('');
};

// eslint-disable-next-line no-unused-vars
const sendViaProvider = async (email, code) => {
  // TODO before launch: wire a real provider here, e.g.:
  //   await resend.emails.send({
  //     from: 'Care Beyond <posts@carebeyond.org>',
  //     to: email,
  //     subject: `${code} is your sign-in code`,
  //     text: `Your sign-in code is ${code}. It expires in 10 minutes.\n` +
  //           `If you didn't request this, you can ignore this email.`
  //   });
  throw new Error('EMAIL_MODE=provider but no provider is configured in server/mailer.js');
};

module.exports = { sendLoginCode };
