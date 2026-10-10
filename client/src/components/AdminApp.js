import React from 'react';
import AddPostForm from './AddPostForm';

/**
 * Publishing, at /admin — deliberately not a tab.
 *
 * The public app is used mostly on library and shelter terminals, and the two
 * audiences should never share a screen: a visitor sees no evidence this area
 * exists, and an organisation that signs in here is not one click away from
 * handing a live session to whoever sits down next. The same reasoning already
 * drives OrgAuth's "remember this device" defaulting to off.
 *
 * Permitted admins publish events and closures. Nothing else lives here: the
 * resource catalogue and the allowlist stay with Care Beyond.
 */
const AdminApp = () => (
  <div className="admin-app">
    <header className="header">
      <h1>CheckpointKC — Publishing</h1>
      <div className="header-right">
        <a className="header-action" href="/">← Public site</a>
      </div>
    </header>

    <main className="admin-main">
      {/* AddPostForm already states who this is for; don't say it twice. */}
      <p className="admin-intro">
        Publish an event, or a closure or alert that would save someone a wasted trip.
      </p>
      <AddPostForm />
    </main>
  </div>
);

export default AdminApp;
