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
router.post('/resources', resourcesController.create);
router.put('/resources/:id', resourcesController.update);
router.delete('/resources/:id', resourcesController.delete);

// Search routes
router.get('/search', searchController.search);

// Legacy community posts routes — reads only.
// The open POST/DELETE that let anyone publish anonymously are gone: all
// posting now goes through /community/posts behind requireOrgSession.
router.get('/posts', postsController.getAll);
router.get('/posts/:id', postsController.getById);

// Organizations routes
router.get('/organizations', organizationsController.getAll);
router.post('/organizations', organizationsController.create);

module.exports = router;

