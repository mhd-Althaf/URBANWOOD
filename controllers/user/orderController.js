    require("dotenv").config();
    const fs = require("fs");
    const path = require("path");
    const crypto = require("crypto");
    const mongoose = require("mongoose");
    const moment = require("moment");
    const easyinvoice = require("easyinvoice");
    const Razorpay = require("razorpay");
    const { ObjectId } = mongoose.Types;
    const User = require("../../models/userSchema");
    const Product = require("../../models/productSchema");
    const Cart = require("../../models/cartSchema");
    const Address = require("../../models/addressSchema");
    const Order = require("../../models/orderSchema");
    const Coupon = require("../../models/couponSchema");

    // Initialize Razorpay instance
    const razorpayInstance = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID || '',
        key_secret: process.env.RAZORPAY_KEY_SECRET || ''
    });

    // Verify Razorpay is properly initialized
    if (!razorpayInstance.key_id || !razorpayInstance.key_secret) {
        console.error('Razorpay credentials are missing!');
    }

    const validateObjectId = (id) => ObjectId.isValid(id) && new ObjectId(id).toString() === id;

    // Helper functions
    async function checkStockStatus(productId, cartQuantity) {
        const product = await Product.findById(productId);
        if (!product) return { warning: 'Product not found' };

        if (product.quantity === 0) {
            return { warning: 'Out of stock' };
        }

        if (product.quantity < cartQuantity) {
            return { warning: `Only ${product.quantity} items available` };
        }

        return { warning: null };
    }

    function calculateCartTotals(cartItems) {
        const subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
        const shippingCost = subtotal > 1000 ? 0 : 100;
        const grandTotal = subtotal + shippingCost;

        return { subtotal, shippingCost, grandTotal };
    }

    async function getRecommendedProducts(userId) {

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || !cart.items.length) return [];

        const categories = cart.items.map(item => item.productId.category);
        const recommendations = await Product.find({
            category: { $in: categories },
            _id: { $nin: cart.items.map(item => item.productId._id) }
        })
            .limit(4)
            .select('productName salePrice productImages');

        return recommendations;
    }


    const updateCartQuantity = async (req, res) => {
        try {
            const { productId, quantity } = req.body;
            const userId = req.session.user._id;


            if (quantity < 1 || quantity > 10) {
                return res.status(400).json({
                    success: false,
                    message: 'Quantity must be between 1 and 10'
                });
            }


            const cart = await Cart.findOne({ userId });
            if (!cart) {
                return res.status(404).json({
                    success: false,
                    message: 'Cart not found'
                });
            }


            const cartItem = cart.items.find(item =>
                item.productId.toString() === productId);

            if (!cartItem) {
                return res.status(404).json({
                    success: false,
                    message: 'Product not found in cart'
                });
            }


            cartItem.quantity = quantity;
            await cart.save();

            // Calculate new totals
            const populatedCart = await Cart.findOne({ userId })
                .populate('items.productId');

            const subtotal = populatedCart.items.reduce((total, item) => {
                return total + (item.productId.salePrice * item.quantity);
            }, 0);

            const shippingCost = subtotal > 1000 ? 0 : 100;
            const grandTotal = subtotal + shippingCost;

            res.json({
                success: true,
                subtotal,
                shippingCost,
                grandTotal
            });

        } catch (error) {
            console.error('Error in updateCartQuantity:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    };


    const removeFromCart = async (req, res) => {
        try {
            const { productId } = req.body;
            const userId = req.session.user._id;


            const cart = await Cart.findOne({ userId });
            if (!cart) {
                return res.status(404).json({
                    success: false,
                    message: 'Cart not found'
                });
            }


            cart.items = cart.items.filter(item =>
                item.productId.toString() !== productId);
            await cart.save();

            const populatedCart = await Cart.findOne({ userId })
                .populate('items.productId');

            const subtotal = populatedCart.items.reduce((total, item) => {
                return total + (item.productId.salePrice * item.quantity);
            }, 0);

            const shippingCost = subtotal > 1000 ? 0 : 100;
            const grandTotal = subtotal + shippingCost;

            res.json({
                success: true,
                subtotal,
                shippingCost,
                grandTotal,
                itemCount: cart.items.length
            });

        } catch (error) {
            console.error('Error in removeFromCart:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    };
    const getCheckoutPage = async (req, res) => {
        try {
            const userId = req.session.user;

            const cart = await Cart.findOne({ userid: userId }).populate('items.productId');
            if (!cart || !cart.items.length) {
                return res.redirect('/cart');
            }

            const cartItems = cart.items.map(item => ({
                product: item.productId,
                quantity: item.quantity,
                total: item.productId.salePrice * item.quantity
            }));

            const subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
            const shippingCost = subtotal > 1000 ? 0 : 100;
            const grandTotal = subtotal + shippingCost;


            const user = await User.findById(userId);
            const savedAddresses = user?.addresses || [];
            const userAddress = await Address.find({ userId: userId })

            res.render('user/checkout', {
                cartItems,
                subtotal,
                shippingCost,
                grandTotal,
                savedAddresses,
                user: req.session.user,
                userAddress
            });

        } catch (error) {
            console.error('Error in getCheckoutPage:', error);
            res.status(500).send('Internal Server Error');
        }
    };

    // controllers/checkout.js
    // const placeOrder = async (req, res) => {
    //     try {
   
    //         const result = await actions.createRazorpayOrder(req, res);

    //         if (result) {
    //             console.log('Order placed successfully via RazorPay');
             
    //             return res.redirect('/success');
    //         } else {
    //             console.error('Failed to place order: ', result);           
    //             return res.redirect('/checkout-error');
    //         }
    //     } catch (error) {
    //         console.error('Error placing order:', error);
    //         return res.status(500).json({ error: 'Failed to place your order' });
    //     }
    // };


    const createRazorpayOrder = async (req, res) => {
        try {
            const { orderAmount } = req.body;       
            // Add detailed logging
            console.log("Request body:", req.body);
            console.log("Order amount:", orderAmount);
            
            if (!orderAmount) {
                throw new Error("Order amount is required");
            }

            const razorpayOptions = {
                amount: Math.round(orderAmount * 100), // Convert to paise
                currency: "INR",
                receipt: `order_${Date.now()}`
            };

            console.log("Creating Razorpay order with options:", razorpayOptions);

            const order = await razorpayInstance.orders.create(razorpayOptions);
            
            console.log("Razorpay order created:", order);

            res.json({
                success: true,
                razorpayOrderId: order.id,
                amount: order.amount,
                currency: order.currency,
                key: process.env.RAZORPAY_KEY_ID,
                userName: req.session.user?.name,
                userEmail: req.session.user?.email,
                userContact: req.session.user?.phone
            });

        } catch (error) {
            console.error("Error creating Razorpay order:", error);
            res.status(500).json({
                success: false,
                error: "Failed to create Razorpay order",
                details: error.message
            });
        }
    };


    const verifyPayment = async (req, res) => {
        try {
            // Extract necessary data from the request
            const {
                razorpay_order_id,
                razorpay_payment_id,
                razorpay_signature,
                orderId,
                amount
            } = req.body;

            // Create signature verification string
            const sign = razorpay_order_id + "|" + razorpay_payment_id;
            const expectedSignature = crypto
                .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
                .update(sign.toString())
                .digest("hex");

            // Compare signatures
            const isAuthentic = expectedSignature === razorpay_signature;

            if (isAuthentic) {
                // Payment is verified
                return res.json({
                    success: true,
                    payment_id: razorpay_payment_id,
                    message: "Payment verified successfully"
                });
            } else {
                return res.json({
                    success: false,
                    message: "Invalid payment signature"
                });
            }

        } catch (error) {
            console.error('Error verifying payment:', error);
            return res.status(500).json({ error: 'Failed to verify payment' });
        }
    };

    const cancelProduct = async (req, res) => {
        const { orderId, productId, reason } = req.body;
        console.log("Cancel Product Request:", { orderId, productId, reason });

        try {
            // Find the order using the orderId
            const order = await Order.findById(orderId);
            
            if (!order) {
                return res.status(404).json({ 
                    success: false, 
                    message: "Order not found" 
                });
            }

            // Find the specific product in the order
            const productItem = order.orderItems.find(
                item => item.productId.toString() === productId
            );

            if (!productItem) {
                return res.status(404).json({ 
                    success: false, 
                    message: "Product not found in order" 
                });
            }

            // Check if product is already cancelled
            if (productItem.status === "Cancelled") {
                return res.status(400).json({ 
                    success: false, 
                    message: "Product is already cancelled" 
                });
            }

            // Update product status
            productItem.status = "Cancelled";
            productItem.cancellationReason = reason;
            productItem.cancelledAt = new Date();

            // Restore product quantity to inventory
            const product = await Product.findById(productId);
            if (product) {
                product.quantity += productItem.quantity;
                await product.save();
            }

            // Recalculate order total
            const activeItems = order.orderItems.filter(item => item.status !== "Cancelled");
            order.finalAmount = activeItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

            // If all items are cancelled, update order status
            if (activeItems.length === 0) {
                order.status = "Cancelled";
            }

            await order.save();

            return res.json({ 
                success: true, 
                message: "Product cancelled successfully" 
            });

        } catch (error) {
            console.error("Error cancelling product:", error);
            return res.status(500).json({ 
                success: false, 
                message: "Server error, please try again later" 
            });
        }
    };

    const cancelOrder = async (req, res) => {
        try {
            const { orderId, reason } = req.body;
            console.log("Cancel Order Request:",orderId );

            // Find the order using the orderId
            const order = await Order.findById(orderId);
            if (!order) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }

            // Check if order is already cancelled
            if (order.status === 'Cancelled') {
                return res.status(400).json({ success: false, message: 'Order is already cancelled' });
            }

            // Update order status
            order.status = 'Cancelled';
            
            // Update all items in the order to cancelled status
            order.orderItems.forEach(item => {
                item.status = 'Cancelled';
            });

            // Restore product quantities
            for (const item of order.orderItems) {
                const product = await Product.findById(item.productId);
                if (product) {
                    product.quantity += item.quantity;
                    await product.save();
                }
            }

            await order.save();

            return res.json({ 
                success: true, 
                message: 'Order cancelled successfully, stock quantities updated' 
            });

        } catch (error) {
            console.error('Error cancelling order:', error);
            return res.status(500).json({ 
                success: false, 
                message: 'Server error, try again later' 
            });
        }
    };
    


    module.exports = {
        validateObjectId,
        checkStockStatus,
        calculateCartTotals,
        getRecommendedProducts,
        getCheckoutPage,
        // placeOrder,
        updateCartQuantity,
        removeFromCart,
        createRazorpayOrder,
        verifyPayment,
        cancelOrder,
        cancelProduct,
    };
