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
const ReturnOrder = require("../../models/returnOrder");
const { log } = require("console");


const razorpayInstance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || '',
    key_secret: process.env.RAZORPAY_KEY_SECRET || ''
});

if (!razorpayInstance.key_id || !razorpayInstance.key_secret) {
    console.error('Razorpay credentials are missing!');
}

const validateObjectId = (id) => ObjectId.isValid(id) && new ObjectId(id).toString() === id;

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
        const userAddress = await Address.find({ userId: userId });
        const currentDate = new Date();

        const coupons = await Coupon.find({
            expireOn: { $gte: currentDate },
            isListed: true,
            userId: { $nin: [userId] }
        });

        console.log('Available coupons:', coupons);
        console.log('Current user ID:', userId);
        console.log('Current subtotal:', subtotal);

        res.render('user/checkout', {
            cartItems,
            subtotal,
            shippingCost,
            grandTotal,
            savedAddresses,
            user: req.session.user,
            userAddress,
            coupons: coupons || []
        });

    } catch (error) {
        console.error('Error in getCheckoutPage:', error);
        res.status(500).send('Internal Server Error');
    }
};

const createRazorpayOrder = async (req, res) => {
    try {
        const { orderAmount } = req.body;
        console.log("Request body:", req.body);
        console.log("Order amount:", orderAmount);

        if (!orderAmount) {
            throw new Error("Order amount is required");
        }

        const razorpayOptions = {
            amount: Math.round(orderAmount * 100),
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
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            orderId,
            amount
        } = req.body;

        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(sign.toString())
            .digest("hex");

        const isAuthentic = expectedSignature === razorpay_signature;

        if (isAuthentic) {
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


const placeOrder = async (req, res) => {
    try {
        const { addressId, paymentMethod } = req.body;
        const userId = req.session.user;

        console.log("User ID:", userId);
        console.log("Request Body:", req.body);


        const cart = await Cart.findOne({ userid: userId }).populate({
            path: 'items.productId',
            select: 'productName description category regularPrice salePrice productOffer quantity productImages status',
            populate: { path: 'category', select: 'name' }
        });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'No items in the cart to place an order.' });
        }


        const userAddress = await Address.findOne(
            { userId: userId, "address._id": addressId },
            { "address.$": 1 }
        );

        if (!userAddress || userAddress.address.length === 0) {
            return res.json({ success: false, message: "Invalid address." });
        }

        const shippingAddress = userAddress.address[0];

        console.log(shippingAddress)
        if (!shippingAddress) {
            return res.status(400).json({ success: false, message: 'Invalid shipping address.' });
        }

        if (!paymentMethod) {
            return res.status(400).json({ success: false, message: 'Payment method is required.' });
        }


        const totalPrice = cart.items.reduce((total, item) => {
            return total + (item.productId.salePrice || item.productId.regularPrice) * item.quantity;
        }, 0);

        const discount = 0;
        const finalAmount = totalPrice - discount;

        const generateOrderId = () => Math.floor(100000 + Math.random() * 900000).toString();


        for (let item of cart.items) {
            const product = await Product.findById(item.productId);
            if (!product) {
                return res.status(404).json({ success: false, message: `Product not found: ${item.productId.productName}` });
            }

            if (product.quantity < item.quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient stock for product: ${product.productName}. Available: ${product.quantity}, Requested: ${item.quantity}`
                });
            }

            product.quantity -= item.quantity;
            await product.save();
        }

        const order = new Order({
            orderId: generateOrderId(),
            userId: userId,
            orderItems: cart.items.map(item => ({
                productId: item.productId._id,
                name: item.productId.productName,
                quantity: item.quantity,
                price: item.productId.salePrice || item.productId.regularPrice
            })),
            totalPrice,
            discount,
            finalAmount,
            address: shippingAddress,
            paymentMethod,
            status: 'Pending',
            paymentStatus: 'Pending',
            createdAt: new Date(),
            invoiceDate: new Date()
        });

        await order.save();


        await Cart.findOneAndUpdate(
            { userid: userId },
            { $set: { items: [] } },
            { new: true }
        );


        return res.json({ success: true, message: 'Order placed successfully.', order });
    } catch (error) {
        console.error('Error placing order:', error);
        return res.status(500).json({ success: false, message: 'Error processing the order. Please try again.' });
    }
};

const cancelProduct = async (req, res) => {
    const { orderId, productId, reason } = req.body;
    console.log("Cancel Product Request:", { orderId, productId, reason });

    try {
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        const productItem = order.orderItems.find(
            item => item.productId.toString() === productId
        );

        if (!productItem) {
            return res.status(404).json({
                success: false,
                message: "Product not found in order"
            });
        }

        if (productItem.status === "Cancelled") {
            return res.status(400).json({
                success: false,
                message: "Product is already cancelled"
            });
        }

        productItem.status = "Cancelled";
        productItem.cancellationReason = reason;
        productItem.cancelledAt = new Date();

        const product = await Product.findById(productId);
        if (product) {
            product.quantity += productItem.quantity;
            await product.save();
        }

        const activeItems = order.orderItems.filter(item => item.status !== "Cancelled");
        order.finalAmount = activeItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

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
        console.log("Cancel Order Request:", orderId);

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        if (order.status === 'Cancelled') {
            return res.status(400).json({ success: false, message: 'Order is already cancelled' });
        }

        order.status = 'Cancelled';

        order.orderItems.forEach(item => {
            item.status = 'Cancelled';
        });

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

const singleReturnRequest = async (req, res) => {
    const { orderId, productId, returnReason } = req.body;
    console.log(req.body)

    try {
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: Please log in first."
            });
        }
        const userId = req.session.user;

        if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID or product ID format"
            });
        }
        // if (!returnReason || returnReason.trim() === "") {
        //     return res.status(400).json({
        //         success: false,
        //         message: "Return reason is required"
        //     });
        // }


        const order = await Order.findById(orderId).populate('orderItems.productId');
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }





        const productObjectId = mongoose.Types.ObjectId.isValid(productId) ? new mongoose.Types.ObjectId(productId) : productId;

        // Debugging logs
        console.log("Order Items:", order.orderItems);
        console.log("Searching for productId:", productObjectId.toString());

        const item = order.orderItems.find(item =>
            item.productId._id && item.productId._id.toString() === productObjectId.toString()
        );

        if (!item) {
            console.error("Product not found:", productId);
            return res.status(404).json({ success: false, message: "Product not found in the order" });
        }

        console.log("Product found:", item);




        if (item.status !== "Delivered") {
            return res.status(400).json({
                success: false,
                message: "Item must be delivered to request a return"
            });
        }

        if (item.status === "Returned") {
            return res.status(400).json({
                success: false,
                message: "Return request already submitted or processed for this item"
            });
        }

        item.status = "Returned";
        item.ReturnReason = returnReason;


        const allItemsReturned = order.orderItems.every(i => i.status === "Returned");
        if (allItemsReturned) {
            order.status = "Returned";
        }

        await order.save();



        res.status(200).json({
            success: true,
            message: "Return request submitted successfully"
        });

    } catch (error) {
        console.error("Error in singleReturnRequest:", error);
        res.status(500).json({
            success: false,
            message: "An error occurred. Please try again later."
        });
    }

};






const applyCoupon = async (req, res) => {
    console.log('applyCoupon called');
    console.log('Session:', req.session);
    console.log('User:', req.session.user);
    console.log('Request body:', req.body);
    
    try {
        const { couponCode } = req.body;
        console.log('Coupon code:', couponCode);
        const userId = req.session.user._id;
        console.log('User ID:', userId);

        const cart = await Cart.findOne({ userid: userId });
        const coupon = await Coupon.findOne({ name: couponCode });
        console.log('Cart:', cart);
        console.log('Coupon:', coupon);

        if (!cart || !coupon) {
            return res.status(404).json({ success: false, message: "Cart or Coupon not found" });
        }

        const now = new Date();
        if (now > new Date(coupon.expireOn)) {
            return res.status(400).json({ success: false, message: "Coupon has expired" });
        }

        let subtotal = 0;
        for (const item of cart.items) {
            const product = await Product.findById(item.productId);
            if (product) {
                subtotal += product.salePrice * item.quantity;
            }
        }

        if (subtotal < coupon.minimumPrice) {
            return res.status(400).json({ success: false, message: "Minimum cart value not met for this coupon" });
        }

        const discountAmount = Math.min(coupon.offerPrice, subtotal);
        const discountedTotal = subtotal - discountAmount;

        const shippingCost = subtotal > 1000 ? 0 : 100; 
        const grandTotal = discountedTotal + shippingCost;

        if (!coupon.userId.includes(userId)) {
            coupon.userId.push(userId);
            await coupon.save();
        }
       
        return res.json({
            success: true,
            message: "Coupon applied successfully!",
            subtotal: discountedTotal,         
            discountAmount,   
            shippingCost,     
            grandTotal       
        });

    } catch (error) {
        console.error("Error applying coupon:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const userOrderDetails = async (req, res) => {
    try {
        const orders = await Order.find().populate("orderItems.productId");

        res.render("user/orderDetails", { orders });
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).send("Internal Server Error");
    }
}







module.exports = {
    validateObjectId,
    checkStockStatus,
    calculateCartTotals,
    getRecommendedProducts,

    getCheckoutPage,
    updateCartQuantity,
    removeFromCart,
    createRazorpayOrder,
    verifyPayment,
    placeOrder,
    cancelOrder,
    cancelProduct,
    singleReturnRequest,
    applyCoupon,
    userOrderDetails
};
