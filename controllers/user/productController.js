const User=require("../../models/userSchema")
const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");

const productDetails = async (req, res) => {
  try {
    const userId = req.session.User;
    const userData = await User.findById(userId);
    const productId = req.params.id;

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

const getshop = async (req, res) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    // Get user data if logged in
    const userId = req.session.user;
    const userData = userId ? await User.findById(userId) : null;

    // Get all active categories
    const categories = await Category.find({ isListed: true });
    
    // Base query for products
    let query = {
      isBlocked: false,
      quantity: { $gt: 0 }
    };

    // Apply filters if present
    if (req.query.category) {
      const category = await Category.findOne({ name: req.query.category });
      if (category) {
        query.category = category._id;
      }
    }

    if (req.query.priceRange) {
      const [min, max] = req.query.priceRange.split('-');
      query.salePrice = {
        $gte: parseInt(min),
        $lte: parseInt(max)
      };
    }

    // Get sorting parameter
    const sort = {};
    if (req.query.sort) {
      switch (req.query.sort) {
        case 'price-low':
          sort.salePrice = 1;
          break;
        case 'price-high':
          sort.salePrice = -1;
          break;
        case 'newest':
          sort.createdOn = -1;
          break;
        default:
          sort.createdOn = -1;
      }
    }

    // Get total count for pagination
    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    // Fetch products
    const products = await Product.find(query)
      .populate('category')
      .sort(sort)
      .skip(skip)
      .limit(limit);

    // Get brand and color lists for filters
    const brands = await Product.distinct('brand');
    const colors = await Product.distinct('color');

    // Price range for filter
    const priceRange = {
      min: await Product.find().sort({ salePrice: 1 }).limit(1).then(products => products[0]?.salePrice || 0),
      max: await Product.find().sort({ salePrice: -1 }).limit(1).then(products => products[0]?.salePrice || 10000)
    };

    res.render('user/shop', {
      user: userData,
      products,
      categories,
      brands,
      colors,
      priceRange,
      filters: {
        category: req.query.category,
        priceRange: req.query.priceRange,
        sort: req.query.sort
      },
      pagination: {
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Error in shop page:', error);
    res.status(500).send('Internal Server Error');
  }
};

module.exports = {
  getshop,
  productDetails,
};