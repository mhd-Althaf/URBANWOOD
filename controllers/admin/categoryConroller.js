const Category = require("../../models/categorySchema");

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

// Add a new category
const addCategory = async (req, res) => {
  try{
  const { cname, description } = req.body;

  // Validate input
  if (!cname || !description) {
    return res.status(400).json({ success: false, error: "All fields are required." });
  }

  // Check if category already exists
  const existingCategory = await Category.findOne({ name: cname });
  if (existingCategory) {
    return res.status(400).json({ success: false, error: "Category already exists." });
  }

  // Create and save the new category
  const newCategory = new Category({ name: cname, description });
  await newCategory.save();

  // Send success response
  return res.json({ success: true, message: "Category added successfully!" });
} catch (error) {
  console.error("Error adding category:", error);
  res.status(500).json({ success: false, error: "Error saving category", details: error.message });
}

}

// Get a single category for editing
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
    const { name, description } = req.body;
    console.log(req.body)

    if (!name || !description) {
      return res.status(400).json({ status: false, error: "Both name and description are required." });
    }

    // Check if another category with the same name exists
    const existingCategory = await Category.findOne({ name: name, _id: { $ne: id } });
    if (existingCategory) {
      return res.status(400).json({ status: false, error: "Category name already exists, please choose another." });
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { name: name, description },
      { new: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({ status: false, error: "Category not found." });
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
