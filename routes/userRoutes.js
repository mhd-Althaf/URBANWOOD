const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/user/checkoutController');
const auth = require('../middleware/userAuth');

// Checkout routes
router.get('/checkout', auth.isLogin, checkoutController.getCheckoutPage);
router.post('/place-order', auth.isLogin, checkoutController.placeOrder);

module.exports = router; 