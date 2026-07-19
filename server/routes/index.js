const express = require('express');
const router = express.Router();
const resourcesController = require('../controllers/resourcesController');
const postsController = require('../controllers/postsController');
const organizationsController = require('../controllers/organizationsController');
const searchController = require('../controllers/searchController');

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

