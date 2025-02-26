const User = require("../../models/userSchema")
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
    const userId = req.session.user;
    const userData = userId ? await User.findById(userId) : null;
    const { page = 1, query = "", category, sort, minPrice, maxPrice } = req.query;
    const limit = 12;
    const skip = (page - 1) * limit;

    let filter = { isBlocked: false, quantity: { $gt: 0 } };

    // Search query
    if (query.trim()) {
      filter.$or = [
        { name: { $regex: query, $options: "i" } },
        { description: { $regex: query, $options: "i" } }
      ];
    }

    // Category filter
    if (category) {
      const categoryObj = await Category.findOne({ name: category });
      if (categoryObj) {
        filter.category = categoryObj._id;
      }
    }

    // Price range filter
    if (minPrice && maxPrice) {
      filter.salePrice = { $gte: parseInt(minPrice), $lte: parseInt(maxPrice) };
    } else if (minPrice) {
      filter.salePrice = { $gte: parseInt(minPrice) };
    } else if (maxPrice) {
      filter.salePrice = { $lte: parseInt(maxPrice) };
    }

    // Sorting
    let sortOption = {};
    let useCollation = false;

    if (sort) {
      if (sort === "priceAsc") {
        sortOption = { salePrice: 1 };
      } else if (sort === "priceDesc") {
        sortOption = { salePrice: -1 };
      } else if (sort === "nameAsc") {
        sortOption = { productName: 1 };
        useCollation = true;
      } else if (sort === "nameDesc") {
        sortOption = { productName: -1 };
        useCollation = true;
      } else {
        sortOption = { createdOn: -1 };
      }
    }

    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    // Create query
    let productQuery = Product.find(filter)
      .populate("category")
      .sort(sortOption)
      .skip(skip)
      .limit(limit);

    // Apply collation for proper alphabetic sorting
    if (useCollation) {
      productQuery = productQuery.collation({ locale: "en", strength: 2 });
    }

    // Execute query
    const products = await productQuery.exec();

    res.render("user/shop", {
      user: userData,
      products,
      currentPage: parseInt(page),
      totalPages,
      categories: await Category.find({ isListed: true }),
      filters: { query, category, sort, minPrice, maxPrice }
    });
  } catch (error) {
    console.error("Error fetching shop data:", error);
    res.status(500).send("An error occurred while fetching shop data.");
  }
};



const getFilteredProducts = async (req, res) => {

};




module.exports = {
  getshop,
  productDetails,
  getFilteredProducts
};