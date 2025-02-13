


const getCheckoutPage = async (req, res) => {
    res.render('checkout');
}

// const placeOrder = async (req, res) => {    
//     res.render('checkout');
// }

const placeOrder = async (req, res) => {
    const { items, shippingAddress, paymentMethod } = req.body;

    try {
        // Example: Validate order details
        if (!items || items.length === 0) {
            return res.json({ success: false, message: 'No items in the order.' });
        }
        if (!shippingAddress || !shippingAddress.street || !shippingAddress.city || !shippingAddress.zip) {
            return res.json({ success: false, message: 'Invalid shipping address.' });
        }
        if (!paymentMethod) {
            return res.json({ success: false, message: 'Payment method is required.' });
        }

        // Process the order (e.g., save to database)
        // Example: saveOrderToDatabase(orderDetails);
        const order = {
            items: items,
            shippingAddress: shippingAddress,
            paymentMethod: paymentMethod,
            status: 'Pending',
            createdAt: new Date(),
        };

        // Assuming you have an "Order" model or database interaction to save the order
        // const savedOrder = await Order.create(order); // Example of saving the order

        // If the order is successfully placed, respond with success
        return res.json({ success: true, message: 'Order placed successfully.' });

    } catch (error) {
        console.error('Error placing order:', error);
        return res.json({ success: false, message: 'Error processing the order. Please try again.' });
    }
};

module.exports = {
    placeOrder,
};



module.exports = {
    getCheckoutPage,
    placeOrder
}
