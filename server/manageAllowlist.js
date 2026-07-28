/**
 * Care Beyond's control panel for who may post, until an admin UI exists.
 * Replaces issueToken.js — there are no tokens to hand out any more; being
 * on this list is the entire grant. (design/VERIFIED-POSTER-AUTH.md)
 *
 *   node server/manageAllowlist.js --add outreach@upliftkc.org "Uplift KC" [added-by]
 *   node server/manageAllowlist.js --remove outreach@upliftkc.org
 *   node server/manageAllowlist.js --list
 *
 * Removing an email revokes access immediately: its active sessions are
 * deleted here, and the posting middleware re-checks the list on every
 * request anyway.
 */

const db = require('./database');

const usage = () => {
  console.log(`Usage:
  node server/manageAllowlist.js --add <email> "<Organisation>" [added-by]
  node server/manageAllowlist.js --remove <email>
  node server/manageAllowlist.js --list`);
};

const run = async () => {
  await db.init();
  await new Promise((resolve) => setTimeout(resolve, 300));

  const [cmd, emailArg, orgName, addedBy] = process.argv.slice(2);
  const email = emailArg ? emailArg.trim().toLowerCase() : null;

  if (cmd === '--list') {
    db.getDb().all('SELECT * FROM allowlist ORDER BY org_name', [], (err, rows) => {
      if (err) console.error(err.message);
      else if (!rows.length) console.log('Allowlist is empty. Add trusted org emails with --add.');
      else {
        console.log('\nOrganisations allowed to post:\n');
        rows.forEach((r) => {
          console.log(`  ${r.org_name}`);
          console.log(`    email: ${r.email}`);
          console.log(`    added: ${r.added_at}${r.added_by ? `  by ${r.added_by}` : ''}\n`);
        });
      }
      db.close();
    });
    return;
  }

  if (cmd === '--add') {
    if (!email || !email.includes('@') || !orgName) {
      usage();
      db.close();
      return;
    }
    db.getDb().run(
      'INSERT INTO allowlist (email, org_name, added_by) VALUES (?, ?, ?)',
      [email, orgName, addedBy || ''],
      (err) => {
        if (err) {
          console.error(err.message.includes('UNIQUE') ? `${email} is already on the allowlist.` : err.message);
        } else {
          console.log(`Added ${orgName} <${email}>. They can now sign in with a code sent to that address.`);
        }
        db.close();
      }
    );
    return;
  }

  if (cmd === '--remove') {
    if (!email) {
      usage();
      db.close();
      return;
    }
    db.getDb().run('DELETE FROM allowlist WHERE email = ?', [email], function (err) {
      if (err) {
        console.error(err.message);
        db.close();
        return;
      }
      if (!this.changes) {
        console.log('No matching email on the allowlist.');
        db.close();
        return;
      }
      // Kill any live sessions so removal takes effect this second.
      db.getDb().run('DELETE FROM sessions WHERE email = ?', [email], () => {
        console.log(`Removed ${email} and ended their active sessions.`);
        db.close();
      });
    });
    return;
  }

  usage();
  db.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
