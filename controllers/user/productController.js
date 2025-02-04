
const User=require("../../models/userSchema")
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");

const productDetails = async (req, res) => {
  try {
    const userId = req.session.User;
    const userData = await User.findById(userId);
    const productId = req.query.id;

    if (!productId) {
      return res.status(400).send("Product ID is required.");
    }

    const product = await Product.findById(productId).populate("category");
    if (!product) {
      return res.status(404).send("Product not found.");
    }
    const topSellers = await Product.find()
    .sort({ salesCount: -1 })  
    .limit(4);  

    const findCategory = product?.category;
    const categoryOffer = findCategory?.categoryOffer || 0;
    const productOffer = product.productOffer || 0;
    const totalOffer = categoryOffer + productOffer;
    
    res.render("user/single-product", {
      user: userData,
      product: product,
      quantity: product.quantity,
      category: findCategory,
      totalOffer: totalOffer,
      topSellers: topSellers, 
      validUntil: product.validUntil || null,
      offerType: product.offerType || "percentage" 
    });
  } catch (error) {
    console.error("Error fetching product details:", error);
    res.status(500).send("An error occurred while fetching product details.");
  }
};

module.exports = {
  productDetails,
};