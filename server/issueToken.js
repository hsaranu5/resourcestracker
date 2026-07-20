/**
 * Issues an API token to a verified organisation so they can publish events
 * and posts.
 *
 *   node server/issueToken.js "Care Beyond the Boulevard" outreach@example.org
 *   node server/issueToken.js --list
 *   node server/issueToken.js --revoke <token>
 *
 * Only hand these to organisations you have actually verified. A token is the
 * whole of the trust model right now: whoever holds it can publish to everyone
 * using the app.
 */

const crypto = require('crypto');
const db = require('./database');

const run = async () => {
  await db.init();
  await new Promise((resolve) => setTimeout(resolve, 300));

  const [arg, second] = process.argv.slice(2);

  if (!arg || arg === '--help') {
    console.log('Usage:\n  node server/issueToken.js "<Organisation>" [contact-email]\n  node server/issueToken.js --list\n  node server/issueToken.js --revoke <token>');
    db.close();
    return;
  }

  if (arg === '--list') {
    db.getDb().all(
      'SELECT organization, contact_email, active, created_at, last_used_at FROM org_api_tokens ORDER BY organization',
      [],
      (err, rows) => {
        if (err) console.error(err.message);
        else if (!rows.length) console.log('No tokens issued yet.');
        else {
          console.log('\nIssued tokens:\n');
          rows.forEach((r) => {
            console.log(`  ${r.active ? 'active ' : 'REVOKED'}  ${r.organization}`);
            console.log(`           contact: ${r.contact_email || '-'}`);
            console.log(`           created: ${r.created_at}  last used: ${r.last_used_at || 'never'}\n`);
          });
          console.log('Token values are not shown. Re-issue if one is lost.');
        }
        db.close();
      }
    );
    return;
  }

  if (arg === '--revoke') {
    if (!second) {
      console.error('Pass the token to revoke.');
      db.close();
      return;
    }
    db.getDb().run('UPDATE org_api_tokens SET active = 0 WHERE token = ?', [second], function (err) {
      if (err) console.error(err.message);
      else console.log(this.changes ? 'Token revoked.' : 'No matching token.');
      db.close();
    });
    return;
  }

  const organization = arg;
  const contactEmail = second || '';
  const token = crypto.randomBytes(24).toString('base64url');

  db.getDb().run(
    'INSERT INTO org_api_tokens (token, organization, contact_email) VALUES (?, ?, ?)',
    [token, organization, contactEmail],
    (err) => {
      if (err) {
        console.error(err.message);
      } else {
        console.log(`\nToken issued to: ${organization}\n`);
        console.log(`  ${token}\n`);
        console.log('Store it now — it is not recoverable from the CLI afterwards.');
        console.log('Use it as:  Authorization: Bearer <token>\n');
      }
      db.close();
    }
  );
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
