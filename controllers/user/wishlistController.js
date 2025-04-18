const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Wishlist = require("../../models/wishlistSchema");
const Cart = require("../../models/cartSchema");

// Load wishlist page with products
const loadWishlistPage = async (req, res) => {
    try {
        const userId = req.session?.user;
        if (!userId) {
            return res.redirect("/login");
        }

        const wishlist = await Wishlist.findOne({ userId })
            .populate({
                path: 'products.productId',
                select: 'productName description salePrice productImages status quantity'
            });

        // Filter out any null or undefined product references
        const products = wishlist ? wishlist.products
            .filter(item => item.productId) // Remove null/undefined products
            .map(item => ({
                ...item.productId?.toObject(),
                addedOn: item.addedOn
            })) : [];

        res.render("user/wishlist", {
            user: req.session.user,
            wishlist: products
        });

    } catch (error) {
        console.error("Error in loadWishlistPage:", error);
        res.status(500).render("user/page-404", { error: "Failed to load wishlist" });
    }
};

// Add product to wishlist
const addToWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        const { productId } = req.body;

        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                message: "Please login to add items to wishlist" 
            });
        }

        let wishlist = await Wishlist.findOne({ userId });

        if (!wishlist) {
            wishlist = new Wishlist({
                userId,
                products: [{ productId }]
            });
        } else {
            const productExists = wishlist.products.some(item => 
                item.productId.toString() === productId
            );

            if (!productExists) {
                wishlist.products.push({ productId });
            } else {
                return res.json({ 
                    success: true, 
                    message: "Product already in wishlist" 
                });
            }
        }

        await wishlist.save();
        res.json({ 
            success: true, 
            message: "Product added to wishlist successfully" 
        });

    } catch (error) {
        console.error('Error in addToWishlist:', error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to add product to wishlist" 
        });
    }
};

// Remove product from wishlist
const removeFromWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        const { productId } = req.body;

        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                message: "Please login to continue" 
            });
        }

        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return res.status(404).json({ 
                success: false, 
                message: "Wishlist not found" 
            });
        }

        wishlist.products = wishlist.products.filter(item => 
            item.productId.toString() !== productId
        );

        await wishlist.save();
        res.json({ 
            success: true, 
            message: "Product removed from wishlist" 
        });

    } catch (error) {
        console.error('Error in removeFromWishlist:', error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to remove product from wishlist" 
        });
    }
};

// Move product from wishlist to cart
const moveToCart = async (req, res) => {
    try {
        const userId = req.session.user;
        const { productId } = req.body;

        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                message: "Please login to continue" 
            });
        }

        // Check product availability
        const product = await Product.findById(productId);
        if (!product || product.quantity < 1 || product.status !== "Available") {
            return res.status(400).json({ 
                success: false, 
                message: "Product is not available" 
            });
        }

        // Add to cart
        let cart = await Cart.findOne({ userid: userId });
        if (!cart) {
            cart = new Cart({
                userid: userId,
                items: [{ productId, quantity: 1 }]
            });
        } else {
            const existingItem = cart.items.find(item => 
                item.productId.toString() === productId
            );

            if (existingItem) {
                existingItem.quantity += 1;
            } else {
                cart.items.push({ productId, quantity: 1 });
            }
        }
        await cart.save();

        // Remove from wishlist
        const wishlist = await Wishlist.findOne({ userId });
        if (wishlist) {
            wishlist.products = wishlist.products.filter(item => 
                item.productId.toString() !== productId
            );
            await wishlist.save();
        }

        res.json({ 
            success: true, 
            message: "Product moved to cart successfully" 
        });

    } catch (error) {
        console.error('Error in moveToCart:', error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to move product to cart" 
        });
    }
};

// Share wishlist
const shareWishlist = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ 
                success: false, 
                message: "Please login to continue" 
            });
        }

        const wishlist = await Wishlist.findOne({ userId })
            .populate({
                path: 'products.productId',
                select: 'productName salePrice productImages'
            });

        if (!wishlist || !wishlist.products.length) {
            return res.status(404).json({ 
                success: false, 
                message: "No items in wishlist" 
            });
        }

        // Generate shareable data
        const shareableData = {
            products: wishlist.products
                .filter(item => item.productId) // Filter out null/undefined products
                .map(item => ({
                    name: item.productId.productName,
                    price: item.productId.salePrice,
                    image: item.productId.productImages && item.productId.productImages.length > 0 
                           ? item.productId.productImages[0] 
                           : null
                })),
            sharedAt: new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        };

        res.json({ 
            success: true, 
            data: shareableData 
        });

    } catch (error) {
        console.error('Error in shareWishlist:', error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to share wishlist" 
        });
    }
};

module.exports = {
    loadWishlistPage,
    addToWishlist,
    removeFromWishlist,
    moveToCart,
    shareWishlist
};