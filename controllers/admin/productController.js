const Product = require("../../models/productSchema");
const mongoose = require('mongoose');
const Category = require("../../models/categorySchema");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");



const getProductAddPage = async (req, res) => {
    try {
        const categories = await Category.find({ isListed: true });
        
        res.render("admin/addProducts", { cat: categories});
    } catch (error) {
        console.error("Error loading product add page:", error.message);
        res.redirect("/admin/pageerror");
    }
};

const addProducts = async (req, res) => {
    try {
        console.log("Request body:", req.body);
        console.log("Files:", req.files);

        const products = req.body;
        const productExists = await Product.findOne({ productName: products.productName });

        if (productExists) {
            return res.status(400).json({ 
                success: false,
                message: "Product already exists, please try with another name." 
            });
        }

        // Check for required fields
        if (!products.productName || !products.description || !products.regularPrice || !products.quantity) {
            return res.status(400).json({ 
                success: false,
                message: "All required fields must be filled." 
            });
        }

        // Handle images
        const images = [];
        if (req.files && req.files.length > 0) {
            for (let file of req.files) {
                const originalImagePath = file.path;
                const resizedImagePath = path.join("public", "uploads", "product-images", file.filename);

                await sharp(originalImagePath)
                    .resize({ width: 440, height: 440 })
                    .toFile(resizedImagePath);

                images.push(file.filename);
            }
        }
console.log("kkkkkkkkkkkkk",req.files);

        if (images.length === 0) {
            return res.status(400).json({ 
                success: false,
                message: "At least one image is required." 
            });
        }

        // Get category
        const categoryId = await Category.findOne({ name: products.category });
        if (!categoryId) {
            return res.status(400).json({ 
                success: false,
                message: "Invalid category name." 
            });
        }

        const newProduct = new Product({
            productName: products.productName,
            description: products.description,
            category: categoryId._id,
            regularPrice: products.regularPrice,
            salePrice: products.salePrice || products.regularPrice,
            quantity: products.quantity,
            productImages: images,
            status: "Available",
            createdOn: new Date(),
        });

        await newProduct.save();
        
        return res.status(200).json({
            success: true,
            message: "Product added successfully"
        });

    } catch (error) {
        console.error("Error adding product:", error);
        return res.status(500).json({ 
            success: false,
            message: "Error adding product: " + error.message 
        });
    }
};



const getAllProducts = async (req, res) => {
    try {
        const search = req.query.search || "";
        const page = parseInt(req.query.page) || 1;
        const limit = 5
       

        const productQuery = {
            $or: [
                { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },
            ],
        };

        if (search) {
            const category = await Category.findOne({ name: { $regex: new RegExp(".*" + search + ".*", "i") } });
            if (category) {
                productQuery.$or.push({ category: category._id });
            }
        }

        const productData = await Product.find(productQuery)
            .skip((page - 1) * limit)
            .limit(limit)
            .populate("category")
            .exec();

        const count = await Product.countDocuments(productQuery);
        const categories = await Category.find({ isListed: true });

        res.render("admin/product", {
            data: productData,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            cat: categories,
            search
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.redirect("/admin/pageerror");
    }
};
const addProductOffer = async (req, res) => {
    try {
        const { percentage, productId, offerType, validUntil } = req.body;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(400).json({ status: false, message: "Product not found" });
        }

        const category = await Category.findById(product.category);
        if (!category || (category.categoryOffer && category.categoryOffer > percentage)) {
            return res.json({ status: false, message: "This product already has a better category offer" });
        }

        product.salePrice = product.regularPrice - Math.floor(product.regularPrice * (percentage / 100));
        product.productOffer = percentage;
        product.offerType = offerType;
        product.validUntil = validUntil;

        await product.save();
        res.json({ status: true });
    } catch (error) {
        console.error("Error adding product offer:", error);
        res.status(500).json({ status: false, message: "Internal server error" });
    }
};

const removeProductOffer = async (req, res) => {
    try {
        const { productId } = req.body;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(400).json({ status: false, message: "Product not found for offer removal" });
        }

        product.salePrice = product.regularPrice;
        product.productOffer = 0;
        product.offerType = null;
        product.validUntil = null;

        await product.save();
        res.json({ status: true });
    } catch (error) {
        console.error("Error removing product offer:", error);
        res.status(500).json({ status: false, message: "Internal server error" });
    }
};

const blockProduct = async (req, res) => {
    try {
        const { productId } = req.body;

        // Validate the ID format
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ status: false, message: "Invalid product ID" });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(400).json({ status: false, message: "Product not found" });
        }

        product.isBlocked = true;
        await product.save();
        
        res.json({ status: true, message: "Product blocked successfully" });
    } catch (error) {
        console.error("Error blocking product:", error);
        res.status(500).json({ status: false, message: "Internal server error", error: error.message });
    }
};

const unblockProduct = async (req, res) => {
    try {
        const { productId } = req.body;

        // Validate the ID format
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ status: false, message: "Invalid product ID" });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(400).json({ status: false, message: "Product not found" });
        }

        product.isBlocked = false;
        await product.save();
        
        res.json({ status: true, message: "Product unblocked successfully" });
    } catch (error) {
        console.error("Error unblocking product:", error);
        res.status(500).json({ status: false, message: "Internal server error", error: error.message });
    }
};

const getEditProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).render("user/page-404", { message: "Product not found" });
        }

        const categories = await Category.find({ isListed: true });
        res.render("admin/editProduct", { category: categories, product:product});
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).render("admin/pageerror", { message: "Server error. Please try again later." });
    }
};
const editProduct = async (req, res) => {
    try {
        const id = req.params.id;
        const product = await Product.findOne({ _id: id });
        const data = req.body;

        const existingProduct = await Product.findOne({
            productName: data.productName,
            _id: { $ne: id },
        });
        if (existingProduct) {
            
            return res.status(400).json({ error: "Product with this name already exists. Please try with another name." });
        }
        const images = [];
        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                images.push(req.files[i].filename);
            }
        }

        const updateFields = {
            productName: data.productName,
            description: data.description,
        
            category: product.category,
            regularPrice: data.regularPrice,
            salePrice: data.salePrice,
            quantity: data.quantity,
        };
        if (req.files.length > 0) {
            updateFields.$push = { productImages: { $each: images } };
        }

        await Product.findByIdAndUpdate(id, updateFields, { new: true });
        res.redirect("/admin/productGet");
    } catch (error) {
        console.error(error);
        res.redirect("/admin/pageerror");
    }
};




const deleteSingleImage = async (req, res) => {
    try {
        const { imageNameToServer, productIdToServer } = req.body;

        const product = await Product.findByIdAndUpdate(productIdToServer);
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }

        product.productImages = product.productImages.filter(image => image !== imageNameToServer);
        await product.save();

        const imagePath = path.join("public", "uploads", "re-image", imageNameToServer);
        if (fs.existsSync(imagePath)) {
         await   fs.unlinkSync(imagePath);
         console.log(`Image ${imageNameToServer} deleted succesfully`)
        }else{
            console.log(`${imageNameToServer} not found`)
        }

        res.json({ status: true, message: "Image deleted successfully" });
    } catch (error) {
        console.error("Error deleting image:", error);
        res.status(500).json({ status: false, message: "Internal server error" });
    }
};

const getProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10; // Show 10 products per page
        const skip = (page - 1) * limit;

        // Get total count of products
        const totalProducts = await Product.countDocuments({});
        const totalPages = Math.ceil(totalProducts / limit);

        // Fetch products with pagination
        const products = await Product.find({})
            .populate({
                path: 'category',
                select: 'name'
            })
            .sort({ createdOn: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const formattedProducts = products.map(product => ({
            _id: product._id,
            productName: product.productName || 'No Name',
            description: product.description || 'No Description',
            category: product.category ? product.category.name : 'Uncategorized',
            regularPrice: product.regularPrice || 0,
            salePrice: product.salePrice || product.regularPrice || 0,
            quantity: product.quantity || 0,
            status: product.status || 'Unavailable',
            productImages: product.productImages || [],

            createdOn: product.createdOn ? new Date(product.createdOn).toLocaleDateString() : 'No Date'
        }));

        res.render('admin/products', {
            products: formattedProducts,
            currentPage: page,
            totalPages: totalPages,
            totalProducts: totalProducts,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            nextPage: page + 1,
            prevPage: page - 1,
            lastPage: totalPages,
            moment: require('moment')
        });

    } catch (error) {
        console.error("Error in getProducts:", error);
        res.status(500).render('admin/products', {
            products: [],
            error: "Error loading products: " + error.message
        });
    }
};

// Add this helper function to check if image exists
const checkImageExists = (imagePath) => {
    try {
        return fs.existsSync(path.join(__dirname, '../../public/uploads/product-images/', imagePath));
    } catch (error) {
        console.error("Error checking image:", error);
        return false;
    }
};

module.exports = {
    
    getProductAddPage,
    addProducts,
    getAllProducts,
    addProductOffer,
    removeProductOffer,
    blockProduct,
    unblockProduct,
    getEditProduct,
    editProduct,
    deleteSingleImage,
    getProducts,
    checkImageExists,
};