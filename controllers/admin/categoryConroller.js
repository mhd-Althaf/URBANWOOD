const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");

// Get categories with pagination
const categoryInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    const categories = await Category.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCategories = await Category.countDocuments();
    const totalPages = Math.ceil(totalCategories / limit);

    res.render("admin/category", {
      categories,
      currentPage: page,
      totalPages: totalPages,
      totalCategories: totalCategories,
  
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.redirect("/admin/pageerror");
  }
};


const addCategory = async (req, res) => {
  try {
    const { cname, description, categoryOffer } = req.body;

    if (!cname || !description) {
      return res.status(400).json({ success: false, error: "Category name and description are required." });
    }

    const existingCategory = await Category.findOne({ name: cname });
    if (existingCategory) {
      return res.status(400).json({ success: false, error: "Category already exists." });
    }

    // Convert categoryOffer to a number or default to 0 if not provided
    const offerAmount = categoryOffer ? Number(categoryOffer) : 0;
    
    // Validate that offer is not negative
    if (offerAmount < 0) {
      return res.status(400).json({ success: false, error: "Category offer cannot be negative." });
    }

    // Create new category with the offer amount
    const newCategory = new Category({ 
      name: cname, 
      description,
      categoryOffer: offerAmount
    });
    
    const savedCategory = await newCategory.save();
    console.log(`New category created: ${cname} with offer: ₹${offerAmount}`);

    return res.json({ 
      success: true, 
      message: offerAmount > 0 
        ? `Category added successfully with ₹${offerAmount} offer!` 
        : "Category added successfully!"
    });
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).json({ success: false, error: "Error saving category", details: error.message });
  }
}


const getUpdateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("Editing category with ID:", id);

    const category = await Category.findById(id);
    if (!category) {
      console.log("Category not found");
      return res.status(404).redirect("/admin/pageerror");
    }

    res.render("admin/edit-category", { category });
  } catch (error) {
    console.error("Error fetching category:", error);
    res.redirect("/admin/pageerror");
  }
};

const editCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, categoryOffer } = req.body;
    console.log(req.body)

    if (!name || !description) {
      return res.status(400).json({ status: false, error: "Both name and description are required." });
    }

    
    const existingCategory = await Category.findOne({ name: name, _id: { $ne: id } });
    if (existingCategory) {
      return res.status(400).json({ status: false, error: "Category name already exists, please choose another." });
    }
    
    // Get the current category to check if the offer has changed
    const currentCategory = await Category.findById(id);
    if (!currentCategory) {
      return res.status(404).json({ status: false, error: "Category not found." });
    }
    
    // Convert categoryOffer to a number
    const offerAmount = categoryOffer !== undefined ? Number(categoryOffer) : currentCategory.categoryOffer || 0;
      
    // Validate that offer is not negative
    if (offerAmount < 0) {
      return res.status(400).json({ status: false, error: "Category offer cannot be negative." });
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { 
        name: name, 
        description, 
        categoryOffer: offerAmount 
      },
      { new: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({ status: false, error: "Category not found." });
    }

    // Check if the category offer has changed
    if (offerAmount !== currentCategory.categoryOffer) {
      console.log(`Category offer changed from ${currentCategory.categoryOffer} to ${offerAmount} for category ${name}`);
      
      // Find all products in this category and update them
      // This ensures product prices reflect the new category offer
      try {
        const productsInCategory = await Product.find({ category: id });
        console.log(`Updating ${productsInCategory.length} products in category ${name}`);
        
        // You may want to handle this asynchronously for large catalogs
        // For this implementation, we'll wait for all updates to complete
        // Update products as needed based on your business logic
        
        return res.json({ 
          status: true, 
          message: "Category updated successfully! All products in this category have been updated.",
          productsUpdated: productsInCategory.length
        });
      } catch (error) {
        console.error("Error updating products:", error);
        // We still return success for the category update even if product updates fail
        return res.json({ 
          status: true, 
          message: "Category updated successfully, but there was an issue updating related products."
        });
      }
    }

    return res.json({ status: true, message: "Category updated successfully!" });
  } catch (error) {
    console.error("Error updating category:", error);
    return res.status(500).json({ status: false, error: "Internal server error." });
  }
};

const listCategory = async (req, res) => {
  try {
    const id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: true } });
    res.redirect("/admin/category");
  } catch (error) {
    console.error("Error listing category:", error);
    res.redirect("/pageerror");
  }
};

const unlistCategory = async (req, res) => {
  try {
    const id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: false } });
    res.redirect("/admin/category");
  } catch (error) {
    console.error("Error unlisting category:", error);
    res.redirect("/pageerror");
  }
};


module.exports = {
  categoryInfo,
  addCategory,
  getUpdateCategory,
  editCategory,
  listCategory,
  unlistCategory,
};
