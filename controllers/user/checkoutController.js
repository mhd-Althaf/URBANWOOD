const Cart = require("../../models/cartSchema");
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema')
const Product = require('../../models/productSchema')

const getCheckoutPage = async (req, res) => {
    res.render('checkout');
}



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




const userOrderDetails = async (req, res) => {
    try {
        const orders = await Order.find().populate("orderItems.productId");
        res.render("user/orderDetails", { orders });
    } catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).send("Internal Server Error");
    }
}



const cancelOrder = async (req, res) => {
    try {
        const { orderId, reason, paymentMethod } = req.body;

        console.log(req.body);

        const order = await Order.findOne({ orderId: orderId });
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }


        if (order.status === 'Cancelled') {
            return res.status(400).json({ message: 'Order is already cancelled' });
        }


        order.status = 'Cancelled';
        order.cancellationReason = reason;
        order.cancelledAt = new Date();


        for (let item of order.orderItems) {
            const product = await Product.findById(item.productId);
            console.log(product)
            if (product) {
                product.quantity += item.quantity;
                await product.save();
            }
        }


        await order.save();

        return res.json({ message: 'Order cancelled successfully, stock quantity updated' });
    } catch (error) {
        console.error('Error cancelling order:', error);
        return res.status(500).json({ message: 'Server error, try again later' });
    }
};






















module.exports = {
    placeOrder,
    getCheckoutPage,
    userOrderDetails,
    cancelOrder,
};
