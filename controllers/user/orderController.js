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
const { log } = require("console");
const PDFDocument = require("pdfkit");


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
            const categoryOffer = product.category ? product.category.categoryOffer || 0 : 0;
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
            // Skip if product doesn't exist
            if (!item.productId) {
                console.log(`Product with ID ${item.productId} not found`);
                return total;
            }
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
        console.log("Checkout page requested for user:", userId);

        const cart = await Cart.findOne({ userid: userId }).populate({
            path: 'items.productId',
            populate: { path: 'category' }
        });
        
        if (!cart || !cart.items.length) {
            return res.redirect('/cart');
        }

        const cartItems = cart.items.map(item => {
            const product = item.productId;
            
            // Skip if product doesn't exist
            if (!product) {
                console.log(`Product with ID ${item.productId} not found`);
                return null;
            }
            
            const categoryOffer = product.category ? product.category.categoryOffer || 0 : 0;
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

        // Filter out null items (products that don't exist)
        const validCartItems = cartItems.filter(item => item !== null);
        
        // If all items are invalid, return empty cart
        if (validCartItems.length === 0) {
            return res.redirect('/cart');
        }

        const subtotal = validCartItems.reduce((sum, item) => sum + item.total, 0);
        const shippingCost = subtotal > 1000 ? 0 : 100;
        const grandTotal = subtotal + shippingCost;

        // Get complete user data including wallet balance
        const userDetails = await User.findById(userId);
        if (!userDetails) {
            console.error("User not found:", userId);
            return res.redirect('/login');
        }
        
        // Get wallet balance from the new wallet schema
        const Wallet = require('../../models/walletSchema');
        const wallet = await Wallet.findOne({ userId });
        const walletBalance = wallet ? wallet.balance : 0;
        
        // Use the wallet balance from the new schema if available, otherwise use the legacy wallet
        const userWithWallet = {
            ...userDetails.toObject(),
            wallet: wallet ? walletBalance : userDetails.wallet || 0
        };
        
        console.log("User wallet balance:", userWithWallet.wallet);
        
        const savedAddresses = userDetails?.addresses || [];
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
            user: userWithWallet, // Pass the user object with the correct wallet balance
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
        console.log("Payment verification request received:", req.body);
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            orderId,
            amount
        } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id ) {
            console.error("Missing required Razorpay parameters");
            if (orderId) {
                const order = await Order.findById(orderId);
                if (order) {
                    order.paymentStatus = "failed";
                    await order.save();
                    return res.redirect('/payment-failed');
                }
                return res.json({
                    success: false,
                    redirect: `/payment-failed/${orderId}`,
                    message: "Payment verification failed"
                });
            }
            return res.status(400).json({
                success: false,
                message: "Missing required payment parameters"
            });
        }

        // Create signature verification
        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(sign.toString())
            .digest("hex");

        console.log("Signature verification:", {
            expected: expectedSignature,
            received: razorpay_signature
        });

        const isAuthentic = expectedSignature === razorpay_signature;

        if (isAuthentic) {
            console.log("Payment signature verified successfully");
            
            // Update the order payment status
            if (orderId) {
                console.log(`Updating order ${orderId} payment status to paid`);
                const order = await Order.findById(orderId);
                
                if (order) {
                    // Update payment information
                    order.paymentStatus = "paid";
                    order.razorpayOrderId = razorpay_order_id;
                    order.razorpayPaymentId = razorpay_payment_id;
                    order.razorpaySignature = razorpay_signature;
                    
                    // Update order status to Processing if it was Pending
                    if (order.status === "Pending") {
                        order.status = "Processing";
                    }
                    
                    await order.save();
                    console.log(`Order ${orderId} updated: Payment status = paid, Order status = ${order.status}`);
                } else {
                    console.error(`Order not found with ID: ${orderId}`);
                }
            } else {
                console.error("No orderId provided for payment verification");
            }

            return res.json({
                success: true,
                payment_id: razorpay_payment_id,
                message: "Payment verified successfully",
                redirect: `/orders?payment=success`
            });
        } else {
            console.error("Payment signature verification failed");
            if (orderId) {
                const order = await Order.findById(orderId);
                if (order) {
                    order.paymentStatus = "failed";
                    await order.save();
                }
                return res.json({
                    success: false,
                    redirect: `/payment-failed/${orderId}`,
                    message: "Payment signature verification failed"
                });
            }
            return res.json({
                success: false,
                message: "Invalid payment signature"
            });
        }

    } catch (error) {
        console.error('Error verifying payment:', error);
        if (req.body.orderId) {
            const order = await Order.findById(req.body.orderId);
            if (order) {
                order.paymentStatus = "failed";
                await order.save();
            }
            return res.json({
                success: false,
                redirect: `/payment-failed/${req.body.orderId}`,
                message: "Payment verification failed"
            });
        }
        return res.status(500).json({ 
            success: false,
            error: 'Failed to verify payment',
            message: error.message
        });
    }
};


const  placeOrder = async (req, res) => {
    try {
      const { addressId, paymentMethod, amount, coupon } = req.body;
      const userId = typeof req.session.user === 'object' ? req.session.user._id : req.session.user;
  
      if (!userId) {
        return res.status(401).json({ success: false, message: 'User not authenticated.' });
      }
  
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

      // Clean up invalid items from cart
      const validCartItems = cart.items.filter(item => item.productId && item.productId._id);
      if (validCartItems.length === 0) {
        // Clear the cart if all items are invalid
        await Cart.findOneAndUpdate({ userid: userId }, { $set: { items: [] } });
        return res.status(400).json({ 
          success: false, 
          message: 'Your cart contains invalid items. Cart has been cleared.' 
        });
      }

      // Update cart with only valid items if there were invalid items
      if (validCartItems.length !== cart.items.length) {
        await Cart.findOneAndUpdate(
          { userid: userId },
          { $set: { items: validCartItems } }
        );
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
        if (!product) {
          console.log(`Product not found for item: ${item._id}`);
          return total;
        }
        const categoryOffer = product.category ? product.category.categoryOffer || 0 : 0;
        const productOffer = product.productOffer || 0;
        const totalOffer = Math.max(categoryOffer, productOffer);
        return total + ((product.regularPrice - totalOffer) * item.quantity);
      }, 0);
  
      let discount = 0;
      let finalAmount = totalPrice;
      let couponCode = null;
  
      // Check if coupon information is provided in the request
      if (coupon && coupon.code) {
        couponCode = coupon.code;
        discount = coupon.discount || 0;
        finalAmount = totalPrice - discount;
      }
  
      const shippingCost = totalPrice > 1000 ? 0 : 100;
      finalAmount += shippingCost;
      console.log("finalAmount", finalAmount);

  
      if (Math.abs(finalAmount - amount) > 1) {
        return res.status(400).json({ success: false, message: 'Order amount mismatch.' });
      }
  
      // Check stock and update quantities
      for (let item of cart.items) {
        if (!item.productId || !item.productId._id) {
          console.log(`Invalid product in cart: ${JSON.stringify(item)}`);
          return res.status(400).json({
            success: false,
            message: 'Some items in your cart are no longer available'
          });
        }

        const updatedProduct = await Product.findOneAndUpdate(
          { _id: item.productId._id, quantity: { $gte: item.quantity } },
          { $inc: { quantity: -item.quantity } },
          { new: true }
        );
        if (!updatedProduct) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${item.productId.productName || 'a product'}`
          });
        }
      }

      console.log("totalPrice", totalPrice);
      console.log("finalAmount", finalAmount);

      // Filter out invalid items before creating order
      const validOrderItems = validCartItems.filter(item => item.productId && item.productId._id);
      if (validOrderItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid items in cart'
        });
      }

      const order = new Order({
        orderId: Math.floor(100000 + Math.random() * 900000).toString(),
        userId,
        orderItems: validOrderItems.map(item => ({
          productId: item.productId._id,
          name: item.productId.productName || 'Product Unavailable',
          quantity: item.quantity,
          price: item.productId.regularPrice - Math.max(
            item.productId.category ? item.productId.category.categoryOffer || 0 : 0,
            item.productId.productOffer || 0
          )
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
        couponDiscount: discount,
        couponCode: couponCode
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
            console.log("Order not found:", orderId);
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        console.log("Found order:", {
            orderId: order._id,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus
        });

        const productItem = order.orderItems.find(
            item => item.productId.toString() === productId
        );

        if (!productItem) {
            console.log("Product not found in order:", productId);
            return res.status(404).json({
                success: false,
                message: "Product not found in order"
            });
        }

        if (productItem.status === "Cancelled") {
            console.log("Product already cancelled");
            return res.status(400).json({
                success: false,
                message: "Product is already cancelled"
            });
        }

        // Save the product price before changing status for refund calculation
        const productPrice = productItem.price * productItem.quantity;
        console.log("Product cancellation details:", {
            productId,
            productName: productItem.name,
            productPrice,
            quantity: productItem.quantity
        });

        productItem.status = "Cancelled";
        productItem.cancellationReason = reason;
        productItem.cancelledAt = new Date();

        const product = await Product.findById(productId);
        if (product) {
            product.quantity += productItem.quantity;
            await product.save();
        }

        const activeItems = order.orderItems.filter(item => item.status !== "Cancelled");
        const activeProductsCount = activeItems.length;
        const activeProductsFinalAmount = activeItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        // Update the final amount in the order
        order.finalAmount = activeProductsFinalAmount;
        
        // Calculate order status based on active items
        order.status = activeProductsCount === 0 ? "Cancelled" : "Processing";
        
        await order.save();

        let walletRefunded = false;

        // Check if payment was made with Razorpay and payment status is paid
        console.log("Checking payment method and status for refund:", {
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            shouldRefund: (order.paymentMethod === 'Razorpay' || order.paymentMethod === 'razorpay') && 
                         (order.paymentStatus === 'paid' || order.paymentStatus === 'Paid')
        });
        if ((order.paymentMethod === 'Razorpay' || order.paymentMethod === 'Wallet') && 
            (order.paymentStatus === 'paid' )) {
            try {
                // Find the user's wallet or create a new one
                console.log("Starting wallet refund process for user:", order.userId);
                const Wallet = require('../../models/walletSchema');
                let wallet = await Wallet.findOne({ userId: order.userId });
                
                if (!wallet) {
                    console.log("No wallet found for user, creating new wallet");
                    // Create a new wallet if it doesn't exist
                    const user = await User.findById(order.userId);
                    if (!user) {
                        console.log("User not found:", order.userId);
                        throw new Error("User not found");
                    }
                    
                    const legacyBalance = user && typeof user.wallet === 'number' ? user.wallet : 0;
                    console.log("Using legacy wallet balance:", legacyBalance);
                    
                    wallet = new Wallet({
                        userId: order.userId,
                        balance: legacyBalance,
                        transactions: []
                    });
                } else {
                    console.log("Found existing wallet with balance:", wallet.balance);
                }
                
                // Add the refund amount to wallet
                const oldBalance = wallet.balance;
                wallet.balance += productPrice;
                console.log(`Updating wallet balance: ${oldBalance} + ${productPrice} = ${wallet.balance}`);
                
                // Add transaction record
                wallet.transactions.push({
                    amount: productPrice,
                    type: 'credit',
                    description: `Refund for cancelled product in order #${order.orderId}`,
                    orderId: order._id,
                    createdAt: new Date()
                });
                
                await wallet.save();
                console.log("Wallet updated successfully with new balance:", wallet.balance);
                
                // Update legacy wallet for backward compatibility
                const user = await User.findById(order.userId);
                if (user) {
                    console.log("Updating legacy wallet");
                    if (typeof user.wallet !== 'number') {
                        user.wallet = 0;
                    }
                    
                    const oldUserWallet = user.wallet;
                    user.wallet += productPrice;
                    console.log(`Updating legacy wallet: ${oldUserWallet} + ${productPrice} = ${user.wallet}`);
                    
                    if (!Array.isArray(user.walletHistory)) {
                        user.walletHistory = [];
                    }
                    
                    user.walletHistory.push({
                        amount: productPrice,
                        transactionType: 'refund',
                        timestamp: new Date()
                    });
                    
                    await user.save();
                    console.log("Legacy wallet updated successfully");
                } else {
                    console.log("User not found for legacy wallet update:", order.userId);
                }
                
                walletRefunded = true;
                console.log(`Refund of ${productPrice} added to wallet for user ${order.userId} for cancelled product`);
            } catch (walletError) {
                console.error("Error processing wallet refund:", walletError);
                // Continue with cancellation even if wallet refund fails
            }
        }

        res.status(200).json({
            success: true,
            message: "Product cancelled successfully",
            walletRefunded,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            refundAmount: walletRefunded ? productPrice : 0
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

        // If order was paid, refund to wallet
        if ((order.paymentMethod === 'Razorpay' || order.paymentMethod === 'Wallet') && order.paymentStatus === 'paid') {
            console.log(`Processing refund of ₹${order.finalAmount} to wallet for cancelled order`);
            
            // Add to new wallet schema
            const Wallet = require('../../models/walletSchema');
            let wallet = await Wallet.findOne({ userId: order.userId });
            
            if (!wallet) {
                // Create new wallet if it doesn't exist
                const user = await User.findById(order.userId);
                const legacyBalance = user && typeof user.wallet === 'number' ? user.wallet : 0;
                
                wallet = new Wallet({
                    userId: order.userId,
                    balance: legacyBalance,
                    transactions: []
                });
            }
            
            // Update wallet balance
            wallet.balance += order.finalAmount;
            
            // Add transaction to wallet history
            wallet.transactions.push({
                amount: order.finalAmount,
                type: 'credit',
                description: `Refund for cancelled order #${order.orderId}`,
                orderId: order._id,
                createdAt: new Date()
            });
            
            await wallet.save();
            console.log(`Added ₹${order.finalAmount} to wallet for cancelled order`);
            
            // Also update legacy wallet for backward compatibility
            const user = await User.findById(order.userId);
            if (user) {
                if (typeof user.wallet !== 'number') {
                    user.wallet = 0;
                }
                
                user.wallet += order.finalAmount;
                
                if (!Array.isArray(user.walletHistory)) {
                    user.walletHistory = [];
                }
                
                user.walletHistory.push({
                    amount: order.finalAmount,
                    transactionType: 'refund',
                    timestamp: new Date()
                });
                
                await user.save();
                console.log("Also updated legacy wallet for backward compatibility");
            }
        }

        // Update order status and set cancellation details
        order.status = 'Cancelled';
        order.cancellationReason = reason || 'Cancelled by user';
        order.cancelledAt = new Date();
        
        // Update all order items to cancelled
        order.orderItems.forEach(item => {
            item.status = 'Cancelled';
        });
        
        // Update product inventory
        for (const item of order.orderItems) {
            const product = await Product.findById(item.productId);
            if (product) {
                product.quantity += item.quantity;
                await product.save();
                console.log(`Restored ${item.quantity} units to product ${product.productName}`);
            }
        }

        await order.save();
        console.log(`Order ${orderId} has been cancelled`);

        return res.json({ 
            success: true, 
            message: 'Order cancelled successfully, stock quantities updated', 
            walletRefunded: (order.paymentMethod === 'Razorpay' || order.paymentMethod === 'Wallet') && order.paymentStatus === 'paid'
        });
    } catch (error) {
        console.error("Error cancelling order:", error);
        return res.status(500).json({ success: false, message: 'Server error, please try again later' });
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
        const { orderId, amount } = req.body;
        const userId = req.session.user;

        if (!orderId || !amount) {
            return res.status(400).json({
                success: false,
                message: "Order ID and amount are required"
            });
        }

        // Get the wallet using the new wallet schema
        const Wallet = require('../../models/walletSchema');
        let wallet = await Wallet.findOne({ userId });

        if (!wallet) {
            // If no wallet exists in the new schema, check the legacy user schema
            const user = await User.findById(userId);
            const legacyBalance = user && typeof user.wallet === 'number' ? user.wallet : 0;
            
            // Create a new wallet with the legacy balance
            wallet = new Wallet({
                userId,
                balance: legacyBalance,
                transactions: []
            });
            
            // Migrate legacy transactions if they exist
            if (user && Array.isArray(user.walletHistory) && user.walletHistory.length > 0) {
                const migratedTransactions = user.walletHistory.map(transaction => ({
                    amount: transaction.amount,
                    type: transaction.transactionType === 'debit' ? 'debit' : 'credit',
                    description: transaction.transactionType === 'refund' 
                        ? 'Refund from return' 
                        : transaction.transactionType === 'debit' 
                            ? 'Payment' 
                            : 'Credit',
                    createdAt: transaction.timestamp
                }));
                
                wallet.transactions.push(...migratedTransactions);
            }
            
            await wallet.save();
        }

        // Check if wallet has sufficient balance
        if (wallet.balance < amount) {
            return res.status(400).json({
                success: false,
                message: "Insufficient wallet balance"
            });
        }

        // Find the order and update its payment status
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found"
            });
        }

        // Update wallet balance
        wallet.balance -= amount;

        // Add transaction to wallet history
        wallet.transactions.push({
            amount,
            type: 'debit',
            description: `Payment for order #${order.orderId}`,
            orderId: order._id,
            createdAt: new Date()
        });

        await wallet.save();

        // Update legacy wallet for backward compatibility
        const user = await User.findById(userId);
        if (user) {
            if (typeof user.wallet !== 'number') {
                user.wallet = 0;
            }
            
            if (user.wallet < amount) {
                return res.status(400).json({
                    success: false,
                    message: "Insufficient wallet balance"
                });
            }
            
            user.wallet -= amount;
            
            if (!Array.isArray(user.walletHistory)) {
                user.walletHistory = [];
            }
            
            user.walletHistory.push({
                amount,
                transactionType: 'debit',
                timestamp: new Date()
            });
            
            await user.save();
        }

        // Update order payment status
        order.paymentStatus = "paid";
        order.paymentMethod = "Wallet";
        await order.save();

        return res.json({
            success: true,
            message: "Payment processed successfully",
            order,
            newBalance: wallet.balance
        });
    } catch (error) {
        console.error("Error processing wallet payment:", error);
        return res.status(500).json({
            success: false,
            message: "Server error, please try again later"
        });
    }
};

const returnProduct = async (req, res) => {
    const { orderId, productId, reason } = req.body;
    console.log("Return Product Request:", { orderId, productId, reason });

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

        if (order.status !== "Delivered") {
            return res.status(400).json({
                success: false,
                message: "Only delivered orders can be returned"
            });
        }

        if (["Cancelled", "Return_Requested", "Returned", "Return_Rejected"].includes(productItem.status)) {
            return res.status(400).json({
                success: false,
                message: `Product is already ${productItem.status}`
            });
        }

        // Update item status to Return_Requested
        productItem.status = "Return_Requested";
        productItem.ReturnReason = reason;
        productItem.ReturnedAt = new Date();

        await order.save();

        return res.json({
            success: true,
            message: "Return request submitted successfully"
        });

    } catch (error) {
        console.error("Error processing return request:", error);
        return res.status(500).json({
            success: false,
            message: "Server error, please try again later"
        });
    }
};

const downloadInvoice = async (req, res) => {
    try {
        const order = await Order.findById(req.params.orderId)
            .populate('userId')
            .populate('orderItems.productId');

        if (!order) {
            return res.status(404).send('Order not found');
        }

        // Create PDF document with proper initialization
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            bufferPages: true,
            autoFirstPage: true
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderId}.pdf`);
        
        // Pipe the PDF to the response
        doc.pipe(res);

        // Add company logo and details
        try {
            await doc.image('public/assets/images/logo.png', 50, 50, { width: 100 });
        } catch (err) {
            console.log('Error loading logo:', err);
            // Continue without logo if there's an error
        }

        // Ensure we're on the first page
        if (doc.page) {
            // Company Header with premium styling
            doc.fontSize(24)
               .font('Helvetica-Bold')
               .fillColor('#2c3e50')
               .text('URBANWOOD', 200, 50);
            
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#34495e')
               .text('123 Furniture Street', 200, 80)
               .text('City, State - 123456', 200, 95)
               .text('Phone: +91 1234567890', 200, 110)
               .text('Email: info@urbanwood.com', 200, 125);

            // Draw a decorative line
            doc.moveTo(50, 150)
               .lineTo(550, 150)
               .strokeColor('#2c3e50')
               .stroke();

            // Invoice Title
            doc.fontSize(20)
               .font('Helvetica-Bold')
               .fillColor('#2c3e50')
               .text('INVOICE', { align: 'center' })
               .moveDown();

            // Invoice Details Box
            doc.rect(50, 180, 500, 60)
               .fillColor('#f8f9fa')
               .fill()
               .strokeColor('#2c3e50')
               .stroke();
            
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .fillColor('#2c3e50')
               .text('Invoice Number:', 60, 190)
               .text('Date:', 60, 210);
            
            doc.fontSize(12)
               .font('Helvetica')
               .fillColor('#34495e')
               .text(order.orderId, 200, 190)
               .text(new Date(order.createdAt).toLocaleDateString(), 200, 210);

            // Customer Details Box
            doc.rect(50, 260, 500, 100)
               .fillColor('#f8f9fa')
               .fill()
               .strokeColor('#2c3e50')
               .stroke();
            
            doc.fontSize(14)
               .font('Helvetica-Bold')
               .fillColor('#2c3e50')
               .text('Customer Details:', 60, 270);
            
            doc.fontSize(12)
               .font('Helvetica')
               .fillColor('#34495e')
               .text(`Name: ${order.userId.name}`, 60, 290)
               .text(`Email: ${order.userId.email}`, 60, 310)
               .text(`Phone: ${order.userId.phone || 'N/A'}`, 60, 330);

            // Shipping Address
            if (order.address) {
                doc.text(`Address: ${order.address.addressType || ''}`, 60, 350)
                   .text(`${order.address.landMark || ''}, ${order.address.city}, ${order.address.state} - ${order.address.pincode}`, 60, 370);
            }

            // Draw a decorative line
            doc.moveTo(50, 380)
               .lineTo(550, 380)
               .strokeColor('#2c3e50')
               .stroke();

            // Order Items Table
            doc.fontSize(14)
               .font('Helvetica-Bold')
               .fillColor('#2c3e50')
               .text('Order Items:', 50, 400);
            
            const tableTop = 420;
            const tableLeft = 50;
            const colWidth = 120;
            const rowHeight = 30;

            // Table Header
            doc.rect(tableLeft, tableTop, 500, rowHeight)
               .fillColor('#2c3e50')
               .fill()
               .strokeColor('#2c3e50')
               .stroke();
            
            doc.fontSize(10)
               .font('Helvetica-Bold')
               .fillColor('#ffffff')
               .text('Product', tableLeft + 10, tableTop + 10)
               .text('Price', tableLeft + colWidth + 20, tableTop + 10)
               .text('Quantity', tableLeft + colWidth * 2 + 20, tableTop + 10)
               .text('Total', tableLeft + colWidth * 3 + 20, tableTop + 10);

            // Table Rows
            let y = tableTop + rowHeight;
            order.orderItems.forEach(item => {
                // Check if we need a new page
                if (y > 700) {
                    doc.addPage();
                    y = 50;
                }

                doc.rect(tableLeft, y, 500, rowHeight)
                   .fillColor(y % 2 === 0 ? '#f8f9fa' : '#ffffff')
                   .fill()
                   .strokeColor('#e9ecef')
                   .stroke();
                
                doc.fontSize(8)
                   .font('Helvetica')
                   .fillColor('#2c3e50')
                   .text(item.productId.productName, tableLeft + 10, y + 10)
                   .text(`₹${item.price.toFixed(2)}`, tableLeft + colWidth + 20, y + 10)
                   .text(item.quantity.toString(), tableLeft + colWidth * 2 + 20, y + 10)
                   .text(`₹${(item.price * item.quantity).toFixed(2)}`, tableLeft + colWidth * 3 + 20, y + 10);

                y += rowHeight;
            });

            // Order Summary Box
            doc.rect(tableLeft, y + 20, 500, 120)
               .fillColor('#2c3e50')
               .fill()
               .strokeColor('#2c3e50')
               .stroke();
            
            y += 40;
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#ffffff')
               .text('Subtotal:', tableLeft + colWidth * 2, y)
               .text(`₹${(order.subTotal || 0).toFixed(2)}`, tableLeft + colWidth * 3 + 20, y);
            
            y += 20;
            doc.text('Shipping:', tableLeft + colWidth * 2, y)
               .text(`₹${(order.shippingCost || 0).toFixed(2)}`, tableLeft + colWidth * 3 + 20, y);
            
            y += 20;
            doc.text('Discount:', tableLeft + colWidth * 2, y)
               .text(`₹${(order.discount || 0).toFixed(2)}`, tableLeft + colWidth * 3 + 20, y);
            
            y += 20;
            doc.fontSize(12)
               .font('Helvetica-Bold')
               .text('Total:', tableLeft + colWidth * 2, y)
               .text(`₹${(order.finalAmount || 0).toFixed(2)}`, tableLeft + colWidth * 3 + 20, y);

            // Payment Details Box
            doc.rect(tableLeft, y + 40, 500, 60)
               .fillColor('#f8f9fa')
               .fill()
               .strokeColor('#2c3e50')
               .stroke();
            
            y += 60;
            doc.fontSize(10)
               .font('Helvetica')
               .fillColor('#2c3e50')
               .text(`Payment Method: ${order.paymentMethod}`, tableLeft + 10, y)
               .text(`Payment Status: ${order.paymentStatus}`, tableLeft + 10, y + 20)
               .text(`Order Status: ${order.status}`, tableLeft + 10, y + 40);

            // Footer
            doc.fontSize(8)
               .fillColor('#34495e')
               .text('Thank you for shopping with URBANWOOD!', { align: 'center' })
               .text('This is a computer-generated invoice and does not require a signature.', { align: 'center' });
        }

        // Finalize the PDF
        doc.end();
    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).send('Error generating invoice');
    }
};

const paymentFailed = async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).send('Order not found');
        }

        res.render('user/paymentFailed', { order });
    } catch (error) {
        console.error('Error in paymentFailed:', error);
        res.status(500).send('Internal Server Error');
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
    applyCoupon,
    userOrderDetails,
    processWalletPayment,
    returnProduct,
    downloadInvoice,
    paymentFailed
};
