const Order = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');
const Address = require('../../models/addressSchema');
const Product = require('../../models/productSchema');
const { v4: uuidv4 } = require('uuid');

const placeOrder = async (req, res) => {
    try {
        const userId = req.session.user;
        const { addressId, paymentMethod } = req.body;

        // Get user's cart
        const cart = await Cart.findOne({ userid: userId }).populate('items.productId');
        if (!cart || !cart.items.length) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        // Get selected address
        const userAddress = await Address.findOne({ userId });
        const selectedAddress = userAddress.address.find(addr => addr._id.toString() === addressId);
        
        if (!selectedAddress) {
            return res.status(400).json({
                success: false,
                message: 'Invalid address selected'
            });
        }

        // Calculate totals
        const subtotal = cart.items.reduce((sum, item) => {
            return sum + (item.productId.salePrice * item.quantity);
        }, 0);
        const shippingCost = subtotal > 1000 ? 0 : 100;
        const grandTotal = subtotal + shippingCost;

        // Create order items array
        const orderItems = cart.items.map(item => ({
            product: item.productId._id,
            quantity: item.quantity,
            price: item.productId.salePrice
        }));

        // Create new order
        const newOrder = new Order({
            orderId: uuidv4(),
            orderItems: orderItems,
            totalPrice: subtotal,
            finalAmount: grandTotal,
            address: {
                addressType: selectedAddress.addressType,
                name: selectedAddress.name,
                landMark: selectedAddress.landMark,
                city: selectedAddress.city,
                state: selectedAddress.state,
                pincode: selectedAddress.pincode,
                phone: selectedAddress.phone
            },
            status: paymentMethod === 'cod' ? 'Pending' : 'Processing',
            createdOn: new Date()
        });

        // Save order
        await newOrder.save();

        // Update product quantities
        for (const item of cart.items) {
            await Product.findByIdAndUpdate(
                item.productId._id,
                { $inc: { quantity: -item.quantity } }
            );
        }

        // Clear user's cart
        await Cart.findOneAndDelete({ userid: userId });

        res.json({
            success: true,
            orderId: newOrder.orderId,
            message: 'Order placed successfully'
        });

    } catch (error) {
        console.error('Error placing order:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

const orderSuccess = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const order = await Order.findOne({ orderId }).populate('orderItems.product');
        
        if (!order) {
            return res.redirect('/');
        }

        res.render('user/order-success', {
            order,
            user: req.session.user
        });

    } catch (error) {
        console.error('Error loading order success page:', error);
        res.redirect('/');
    }
};

module.exports = {
    placeOrder,
    orderSuccess
}; 