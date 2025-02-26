const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Cart = require("../../models/cartSchema");

const getCartPage = async (req, res) => {
    try {
        const userId = req.session.user; 
        const cart = await Cart.findOne({ userid: userId }).lean();

        if (!cart) {
            return res.render('user/cart', { cartItems: [], subtotal: 0, shippingCost: 0, grandTotal: 0 });
        }

        
        const cartItems = await Promise.all(cart.items.map(async (item) => {
            const product = await Product.findById(item.productId).lean();
            return {
                ...item,
                productId: item.productId,
                productName: product.productName,
                description: product.description,
                regularPrice: product.regularPrice,
                salePrice: product.salePrice,
                productImages: product.productImages,
                quantity: item.quantity 
            };
        }));

        // Calculate totals
        const subtotal = cartItems.reduce((sum, item) => sum + (item.salePrice * item.quantity), 0);
        const shippingCost = subtotal > 1000 ? 0 : 100;
        const grandTotal = subtotal + shippingCost;

        res.render('user/cart', {
            cartItems,
            subtotal,
            shippingCost,
            grandTotal,
            user: req.session.user
        });

    } catch (error) {
        console.error('Error fetching cart:', error);
        res.status(500).send('Server Error');
    }
};

const addToCart = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Please login to add items to cart'
            });
        }

        const { productId, quantity } = req.body;

        if (quantity > 10) {
            return res.status(400).json({
                success: false,
                message: 'Maximum product limit is 10'
            });
        }

        // Validate product exists and has stock
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        if (product.quantity < quantity) {
            return res.status(400).json({
                success: false,
                message: 'Not enough stock available'
            });
        }

        let cart = await Cart.findOne({ userid: userId });
        if (!cart) {
            cart = new Cart({
                userid: userId,
                items: []
            });
        }

        const existingItem = cart.items.find(item => 
            item.productId.toString() === productId
        );

        if (existingItem) {
            const newQuantity = existingItem.quantity + quantity;
            if (newQuantity > 10) {
                return res.status(400).json({
                    success: false,
                    message: 'Maximum product limit is 10'
                });
            }
            if (newQuantity > product.quantity) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot add more items than available in stock'
                });
            }
            existingItem.quantity = newQuantity;
        } else {
            cart.items.push({
                productId: productId,
                quantity: quantity
            });
        }

        await cart.save();

        // Calculate new cart count
        const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);

        res.status(200).json({
            success: true,
            message: 'Product added to cart successfully',
            cartCount: cartCount,
            redirect: '/shop'
        });

    } catch (error) {
        console.error('Error in addToCart:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add product to cart'
        });
    }
};

const changeQuantity = async (req, res) => {
    try {
        const { productId, quantity } = req.body;
        const userId = req.session.user._id;

        // Find cart and validate
        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ message: "Cart not found" });
        }

        // Find cart item
        const cartItem = cart.items.find(item => 
            item.productId.toString() === productId);
        
        if (!cartItem) {
            return res.status(404).json({ message: "Item not found in cart" });
        }

        // Update quantity
        cartItem.quantity = quantity;
        await cart.save();

        // Calculate new totals
        const subtotal = cart.items.reduce((total, item) => 
            total + (item.price * item.quantity), 0);
        const shippingCost = subtotal > 1000 ? 0 : 100;
        const grandTotal = subtotal + shippingCost;

        res.json({
            success: true,
            itemTotal: cartItem.price * cartItem.quantity,
            subtotal,
            shippingCost,
            grandTotal
        });

    } catch (error) {
        console.error("Error in changeQuantity:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

const deleteProduct = async (req, res) => {
    try {
        const productId = req.query.id;
        const userId = req.session?.user?._id;
        // console.log("from backen:", productId)

        if (!ObjectId.isValid(userId) || !ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: "Invalid request parameters" });
        }

        // Find the user's cart
        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: "Cart not found" });
        }

        // Find the index of the item to remove
        const itemIndex = cart.items.findIndex((item) => item.productId.toString() === productId);
        if (itemIndex === -1) {
            return res.status(404).json({ success: false, message: "Product not found in cart" });
        }

        // Remove the item from the cart
        cart.items.splice(itemIndex, 1);
        await cart.save();

        res.json({ success: true, message: "Product removed from cart" });
    } catch (error) {
        console.error("Error in deleteProduct:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

const getCheckStock = async (req, res) => {
    try {
        const { productId } = req.query;

        if (!ObjectId.isValid(productId)) {
            return res.status(400).json({ message: "Invalid product ID" });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        res.json({ availableStock: product.quantity || 0 });
    } catch (error) {
        console.error("Error in getCheckStock:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const getCartCount = async (req, res, next) => {
    try {
        if (req.session.user) {  // Check if user is logged in
            const cart = await Cart.findOne({ userId: req.session.user._id });
            const totalProductsInCart = cart ? cart.items.reduce((total, item) => total + item.quantity, 0) : 0;

            // If it's an AJAX request, send JSON response
            // if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            //     return res.json({ cartLength: totalProductsInCart });
            // }
            res.locals.cartCount = totalProductsInCart;
        } else {
            res.locals.cartCount = totalProductsInCart;
        }
        next();
    } catch (error) {
        console.error('Error fetching cart count:', error);
        res.locals.cartCount = 0;
        next();
    }
};

const clearCart = async (req, res) => {
    try {
        const userId = req.session?.user?._id;
        if (!ObjectId.isValid(userId)) {
            return res.redirect("/login");
        }


        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ success: false, message: "Cart not found" });
        }


        cart.items = [];
        await cart.save();

        res.json({ success: true, message: "Cart cleared successfully" });
    } catch (error) {
        console.error("Error in clearCart:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};


module.exports = {
    getCartPage,
    addToCart,
    changeQuantity,
    deleteProduct,
    getCheckStock,
    getCartCount,
    clearCart,
}