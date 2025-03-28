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

        // Validate quantity
        const parsedQuantity = parseInt(quantity, 10);
        if (isNaN(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 10) {
            return res.status(400).json({
                success: false,
                message: 'Quantity must be between 1 and 10'
            });
        }

        // Fetch cart
        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        // Find and update cart item
        const cartItem = cart.items.find(item =>
            item.productId.toString() === productId
        );
        if (!cartItem) {
            return res.status(404).json({
                success: false,
                message: 'Product not found in cart'
            });
        }
        
        cartItem.quantity = parsedQuantity;
        await cart.save();

        // Fetch populated cart with category information
        const populatedCart = await Cart.findOne({ userId })
            .populate({
                path: 'items.productId',
                populate: { path: 'category' }
            });

        if (!populatedCart || !populatedCart.items.length) {
            return res.status(500).json({
                success: false,
                message: 'Cart data is inconsistent'
            });
        }

        // Calculate subtotal with offer logic matching getCartPage
        const subtotal = populatedCart.items.reduce((total, item) => {
            const product = item.productId;
            // Calculate the highest applicable offer
            const categoryOffer = product.category?.categoryOffer || 0;
            const productOffer = product.productOffer || 0;
            const totalOffer = Math.max(categoryOffer, productOffer);
            
            // Calculate final price
            const finalPrice = (product.regularPrice || 0) - totalOffer;
            const qty = parseInt(item.quantity, 10) || 0;
            
            return total + (finalPrice * qty);
        }, 0);

        // Calculate shipping and grand total
        const shippingCost = subtotal > 1000 ? 0 : 100;
        const grandTotal = subtotal + shippingCost;

        // Round to 2 decimal places
        const roundedSubtotal = Number(subtotal.toFixed(2));
        const roundedGrandTotal = Number(grandTotal.toFixed(2));

        res.json({
            success: true,
            subtotal: roundedSubtotal,
            shippingCost,
            grandTotal: roundedGrandTotal
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

        const cart = await Cart.findOne({ userid: userId }).populate({
            path: 'items.productId',
            populate: { path: 'category' }
        });
        
        if (!cart || !cart.items.length) {
            return res.redirect('/cart');
        }

        const cartItems = cart.items.map(item => {
            const product = item.productId;
            const categoryOffer = product.category?.categoryOffer || 0;
            const productOffer = product.productOffer || 0;
            const totalOffer = Math.max(categoryOffer, productOffer);
            const finalPrice = product.regularPrice - totalOffer;

            return {
                product: product,
                quantity: item.quantity,
                total: finalPrice * item.quantity,
                totalOffer: totalOffer
            };
        });

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
      const { addressId, paymentMethod, amount, couponCode } = req.body;
      const userId = req.session.user;
  
      if (!addressId || !paymentMethod || typeof amount !== 'number') {
        return res.status(400).json({ success: false, message: 'Missing or invalid order details.' });
      }
  
      const cart = await Cart.findOne({ userid: userId }).populate({
        path: 'items.productId',
        select: 'productName regularPrice productOffer quantity',
        populate: { path: 'category', select: 'categoryOffer' }
      });
  
      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ success: false, message: 'No items in the cart.' });
      }
  
      const userAddress = await Address.findOne(
        { userId: userId, "address._id": addressId },
        { "address.$": 1 }
      );
      if (!userAddress || !userAddress.address?.length) {
        return res.status(400).json({ success: false, message: 'Invalid address.' });
      }
      const shippingAddress = userAddress.address[0];
  
      const totalPrice = cart.items.reduce((total, item) => {
        const product = item.productId;
        const categoryOffer = product.category?.categoryOffer || 0;
        const productOffer = product.productOffer || 0;
        const totalOffer = Math.max(categoryOffer, productOffer);
        return total + ((product.regularPrice - totalOffer) * item.quantity);
      }, 0);
  
      let discount = 0;
      let finalAmount = totalPrice;
  
      if (couponCode) {
        const coupon = await Coupon.findOne({ name: couponCode });
        if (!coupon) {
          return res.status(400).json({ success: false, message: 'Invalid coupon code.' });
        }
        const maxAllowedDiscount = Math.min(coupon.offerPrice, totalPrice * 0.9);
        discount = Math.min(maxAllowedDiscount, totalPrice - 1);
        finalAmount = Math.max(totalPrice - discount, 1);
      }
  
      const shippingCost = totalPrice > 1000 ? 0 : 100;
      finalAmount += shippingCost;
      console.log("finalAmount",finalAmount);

  
      if (Math.abs(finalAmount - amount) > 1) {
        return res.status(400).json({ success: false, message: 'Order amount mismatch.' });
      }
  
      for (let item of cart.items) {
        const updatedProduct = await Product.findOneAndUpdate(
          { _id: item.productId._id, quantity: { $gte: item.quantity } },
          { $inc: { quantity: -item.quantity } },
          { new: true }
        );
        if (!updatedProduct) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${item.productId.productName}`
          });
        }
      }
      console.log("totalPrice",totalPrice);
      console.log("finalAmount",finalAmount);
      const order = new Order({
        orderId: Math.floor(100000 + Math.random() * 900000).toString(),
        userId,
        orderItems: cart.items.map(item => ({
          productId: item.productId._id,
          name: item.productId.productName,
          quantity: item.quantity,
          price: item.productId.regularPrice - Math.max(item.productId.category?.categoryOffer || 0, item.productId.productOffer || 0)
        })),
        shippingCost,
        totalPrice,
        discount,
        finalAmount,
        address: shippingAddress,
        paymentMethod,
        status: 'Pending',
        paymentStatus: 'Pending',
        couponApplied: !!couponCode,
        couponDiscount: discount
      });
  
      await order.save();
      await Cart.findOneAndUpdate({ userid: userId }, { $set: { items: [] } });
  
      return res.json({ success: true, message: 'Order placed successfully.', order });
    } catch (error) {
      console.error('Error placing order:', error);
      return res.status(500).json({ success: false, message: `Error: ${error.message}` });
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

        // If order was paid via Razorpay, refund to wallet
        if (order.paymentMethod === 'Razorpay' && order.paymentStatus === 'paid') {
            await User.findByIdAndUpdate(
                order.userId,
                {
                    $inc: { wallet: order.finalAmount },
                    $push: {
                        history: {
                            amount: order.finalAmount,
                            status: "Credit",
                            date: new Date(),
                            description: `Refund for cancelled order ${order.orderId}`
                        }
                    }
                }
            );
        }

        order.status = 'Cancelled';
        order.cancellationReason = reason;
        order.cancelledAt = new Date();

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
    try {
        const { orderId, productId, reason } = req.body;
        console.log("Return request data:", req.body);

        // Validate inputs
        if (!orderId || !productId || !reason) {
            return res.status(400).json({
                success: false,
                message: "Order ID, Product ID, and return reason are required"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID or product ID format"
            });
        }

        // Find the order
        const order = await Order.findById(orderId).populate('orderItems.productId');
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        // Find the specific product in the order
        const item = order.orderItems.find(item => 
            item.productId && item.productId._id && item.productId._id.toString() === productId
        );

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Product not found in the order"
            });
        }

        // Validate item status
        if (item.status !== "Delivered") {
            return res.status(400).json({
                success: false,
                message: "Only delivered items can be returned"
            });
        }

        if (item.status === "Return_Requested" || item.status === "Returned") {
            return res.status(400).json({
                success: false,
                message: "Return request already exists for this item"
            });
        }

        // Update item status
        item.status = "Return_Requested";
        item.returnReason = reason;

        // If all items are returned, update order status
        const allItemsReturned = order.orderItems.every(item => item.status === "Returned");
        if (allItemsReturned) {
            order.status = "Returned";
            
            // If order was paid via Razorpay, refund to wallet
            if (order.paymentMethod === 'Razorpay' && order.paymentStatus === 'paid') {
                await User.findByIdAndUpdate(
                    order.userId,
                    {
                        $inc: { wallet: order.finalAmount },
                        $push: {
                            history: {
                                amount: order.finalAmount,
                                status: "Credit",
                                date: new Date(),
                                description: `Refund for returned order ${order.orderId}`
                            }
                        }
                    }
                );
            }
        }

        await order.save();

        return res.json({
            success: true,
            message: "Return request submitted successfully"
        });

    } catch (error) {
        console.error("Error in singleReturnRequest:", error);
        return res.status(500).json({
            success: false,
            message: "Server error, please try again later"
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

        // Calculate discount amount ensuring it doesn't exceed the subtotal or maximum allowed discount
        const maxAllowedDiscount = Math.min(coupon.offerPrice, subtotal * 0.9); // Max 90% discount
        const discountAmount = Math.min(maxAllowedDiscount, subtotal - 1); // Ensure at least ₹1 remains
        const discountedTotal = Math.max(subtotal - discountAmount, 1); // Ensure total is at least ₹1

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

        console.log(orders);

        res.render("user/orderDetails", { orders });
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).send("Internal Server Error");
    }
}

// Add a new function to handle wallet payments
const processWalletPayment = async (req, res) => {
    try {
        const { orderId } = req.body;
        const userId = req.session.user;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Check if user has sufficient wallet balance
        if (user.wallet < order.finalAmount) {
            return res.status(400).json({ 
                success: false, 
                message: 'Insufficient wallet balance' 
            });
        }

        // Update user's wallet balance
        await User.findByIdAndUpdate(
            userId,
            {
                $inc: { wallet: -order.finalAmount },
                $push: {
                    history: {
                        amount: -order.finalAmount,
                        status: "Debit",
                        date: new Date(),
                        description: `Payment for order ${order.orderId}`
                    }
                }
            }
        );

        // Update order payment status
        order.paymentStatus = 'paid';
        order.paymentMethod = 'wallet';
        await order.save();

        return res.json({
            success: true,
            message: 'Payment processed successfully'
        });

    } catch (error) {
        console.error('Error processing wallet payment:', error);
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
    updateCartQuantity,
    removeFromCart,
    createRazorpayOrder,
    verifyPayment,
    placeOrder,
    cancelOrder,
    cancelProduct,
    singleReturnRequest,
    applyCoupon,
    userOrderDetails,
    processWalletPayment
};
