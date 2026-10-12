const express = require('express');
const router = express.Router();
const resourcesController = require('../controllers/resourcesController');
const postsController = require('../controllers/postsController');
const organizationsController = require('../controllers/organizationsController');
const searchController = require('../controllers/searchController');
const mobileController = require('../controllers/mobileController');
const communityController = require('../controllers/communityController');
const authController = require('../controllers/authController');
const requireOrgSession = require('../middleware/requireOrgSession');
const requireRole = require('../middleware/requireRole');
const adminController = require('../controllers/adminController');
const cronController = require('../controllers/cronController');

// Verified poster auth (design/VERIFIED-POSTER-AUTH.md).
// Passwordless: allowlisted email → 6-digit code → session.
router.post('/auth/request-code', authController.requestCode);
router.post('/auth/verify', authController.verify);
router.get('/auth/me', requireOrgSession, authController.me);
router.post('/auth/logout', requireOrgSession, authController.logout);

// Community: events and posts.
// Reads are public; anything that publishes requires a verified org session.
router.get('/community/events', communityController.listEvents);
router.post('/community/events', requireOrgSession, communityController.createEvent);
router.patch('/community/events/:slug', requireOrgSession, communityController.updateEvent);
router.get('/community/posts', communityController.listPosts);
router.post('/community/posts', requireOrgSession, communityController.createPost);

// Bulk export, for partner organisations consuming the catalogue and as the
// backup path for a gitignored database. Must be declared before
// '/resources/:id', otherwise Express matches 'export' as an :id parameter.
router.get('/resources/export', mobileController.exportAll);

// Resources routes
router.get('/resources', resourcesController.getAll);
router.get('/resources/:id', resourcesController.getById);
// Writes are for editors and admins (the /admin Resources screen). These were
// open to anyone while the server only listened on a private network.
const editor = [requireOrgSession, requireRole('editor')];
const admin = [requireOrgSession, requireRole('admin')];
router.post('/resources', editor, resourcesController.create);
router.put('/resources/:id', editor, resourcesController.update);
router.delete('/resources/:id', editor, resourcesController.delete);

// Admin area: change history, address lookup, and the team (the allowlist).
router.get('/admin/resources/:id/history', editor, resourcesController.history);
router.get('/admin/geocode', editor, adminController.geocode);
router.get('/admin/team', admin, adminController.listTeam);
router.post('/admin/team', admin, adminController.addMember);
router.patch('/admin/team/:id', admin, adminController.updateMember);
router.delete('/admin/team/:id', admin, adminController.removeMember);

// Search routes
router.get('/search', searchController.search);

// Legacy community posts routes — reads only.
// The open POST/DELETE that let anyone publish anonymously are gone: all
// posting now goes through /community/posts behind requireOrgSession.
router.get('/posts', postsController.getAll);
router.get('/posts/:id', postsController.getById);

// Scheduled jobs, called by Vercel Cron (vercel.json). They replace the
// setInterval that ran archiveExpired inside the old long-lived server, and
// the OS timer that ran maintenance.js. Locked to the CRON_SECRET bearer.
router.get('/cron/archive', cronController.requireCronSecret, cronController.archive);
router.get('/cron/maintenance', cronController.requireCronSecret, cronController.maintenance);

// Organizations routes
router.get('/organizations', organizationsController.getAll);
router.post('/organizations', admin, organizationsController.create);

module.exports = router;

