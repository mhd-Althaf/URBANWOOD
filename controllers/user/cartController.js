const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Cart = require("../../models/cartSchema");
const Address = require("../../models/addressSchema");
const validateObjectId = (id) => ObjectId.isValid(id) && new ObjectId(id).toString() === id;

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

///add to cart

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

        // Find or create cart
        let cart = await Cart.findOne({ userid: userId });
        if (!cart) {
            cart = new Cart({
                userid: userId,
                items: []
            });
        }

        // Check if product already exists in cart
        const existingItem = cart.items.find(item => 
            item.productId.toString() === productId
        );

        if (existingItem) {
            // Update quantity if total doesn't exceed stock
            const newQuantity = existingItem.quantity + quantity;
            if (newQuantity > product.quantity) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot add more items than available in stock'
                });
            }
            existingItem.quantity = newQuantity;
        } else {
            // Add new item
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
            redirect: '/cart'
        });

    } catch (error) {
        console.error('Error in addToCart:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add product to cart'
        });
    }
};

//delete product from cart

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


//check stock availability

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
    // Get user's cart items categories
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || !cart.items.length) return [];

    // Get products from similar categories
    const categories = cart.items.map(item => item.productId.category);
    const recommendations = await Product.find({
        category: { $in: categories },
        _id: { $nin: cart.items.map(item => item.productId._id) }
    })
        .limit(4)
        .select('productName salePrice productImages');

    return recommendations;
}

//change quantity 
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


const getCartCount = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const cart = await Cart.findOne({ userId: userId });

        if (!cart) {
            return res.status(404).json({ error: 'Cart not found' });
        }

        // Calculate the total number of items in the cart
        const totalProductsInCart = cart.items.reduce((total, item) => total + item.quantity, 0);


        res.json({ cartLength: totalProductsInCart });
    } catch (error) {
        console.error('Error fetching cart count:', error);
        res.status(500).json({ error: 'Internal server error' });
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

// Update cart quantity
const updateCartQuantity = async (req, res) => {
    try {
        const { productId, quantity } = req.body;
        const userId = req.session.user._id;

        // Validate quantity
        if (quantity < 1 || quantity > 10) {
            return res.status(400).json({
                success: false,
                message: 'Quantity must be between 1 and 10'
            });
        }

        // Find cart and update quantity
        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        // Find product in cart
        const cartItem = cart.items.find(item => 
            item.productId.toString() === productId);

        if (!cartItem) {
            return res.status(404).json({
                success: false,
                message: 'Product not found in cart'
            });
        }

        // Update quantity
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

// Remove product from cart
const removeFromCart = async (req, res) => {
    try {
        const { productId } = req.body;
        const userId = req.session.user._id;

        // Find and update cart
        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        // Remove item
        cart.items = cart.items.filter(item => 
            item.productId.toString() !== productId);
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
        const userId = req.session.user._id;
        
        // Fetch cart details
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || !cart.items.length) {
            return res.redirect('/cart');
        }

        // Calculate totals
        const cartItems = cart.items.map(item => ({
            product: item.productId,
            quantity: item.quantity,
            total: item.productId.salePrice * item.quantity
        }));

        const subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
        const shippingCost = subtotal > 1000 ? 0 : 100;
        const grandTotal = subtotal + shippingCost;

        // Get user's saved addresses if any
        const user = await User.findById(userId);
        const savedAddresses = user?.addresses || [];
        const userAddress = await Address.find({})          
        // console.log("userAddress",userAddress)         

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

const placeOrder = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const {
            shippingAddress,
            paymentMethod,
            // other order details
        } = req.body;

        // Validate cart
        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || !cart.items.length) {
            return res.status(400).json({
                success: false,
                message: 'Cart is empty'
            });
        }

        // Create order logic will go here
        // For now, just sending success response
        res.json({
            success: true,
            message: 'Order placed successfully'
        });

    } catch (error) {
        console.error('Error in placeOrder:', error);
        res.status(500).json({
            success: false,
            message: 'Internal Server Error'
        });
    }
};
module.exports = {
    getCheckoutPage,
    placeOrder,
    getCartPage,
    addToCart,
    changeQuantity,
    deleteProduct,
    getCheckStock,
    getCartCount,
    clearCart,
    updateCartQuantity,
    removeFromCart
};