const express = require('express');
const router = express.Router();
const ApiController = require('../controllers');

const apiController = new ApiController();

router.post('/discover', (req, res) => apiController.discover(req, res));

module.exports = router;