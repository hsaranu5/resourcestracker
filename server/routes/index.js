const express = require('express');
const router = express.Router();
const resourcesController = require('../controllers/resourcesController');
const postsController = require('../controllers/postsController');
const organizationsController = require('../controllers/organizationsController');
const searchController = require('../controllers/searchController');
const mobileController = require('../controllers/mobileController');
const communityController = require('../controllers/communityController');
const requireOrgToken = require('../middleware/requireOrgToken');

// Community: events and posts.
// Reads are public; anything that publishes requires a verified organisation token.
router.get('/community/events', communityController.listEvents);
router.post('/community/events', requireOrgToken, communityController.createEvent);
router.patch('/community/events/:slug', requireOrgToken, communityController.updateEvent);
router.get('/community/posts', communityController.listPosts);
router.post('/community/posts', requireOrgToken, communityController.createPost);

// Mobile app routes.
// These must be declared before '/resources/:id', otherwise Express matches
// 'export' and 'nearby' as an :id parameter.
router.get('/resources/export', mobileController.exportAll);
router.get('/resources/nearby', mobileController.nearby);

// Resources routes
router.get('/resources', resourcesController.getAll);
router.get('/resources/:id', resourcesController.getById);
router.post('/resources', resourcesController.create);
router.put('/resources/:id', resourcesController.update);
router.delete('/resources/:id', resourcesController.delete);

// Search routes
router.get('/search', searchController.search);

// Community posts routes
router.get('/posts', postsController.getAll);
router.get('/posts/:id', postsController.getById);
router.post('/posts', postsController.create);
router.delete('/posts/:id', postsController.delete);

// Organizations routes
router.get('/organizations', organizationsController.getAll);
router.post('/organizations', organizationsController.create);

module.exports = router;

