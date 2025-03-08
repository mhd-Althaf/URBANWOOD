const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const User = require("../../models/userSchema");
const Product = require("../../models/productSchema");
const Wishlist = require("../../models/wishlistSchema");

const loadwishlistPage = async (req, res) => {
  try {
    const userId = req.session?.user?._id;
    if (!ObjectId.isValid(userId)) {
      return res.redirect("/login");
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send("User not found");
    }

    const products=await Product.find({_id:{$in:user.wishlist}}).populate("category")
res.render("user/wishlist",{
    user,
    wishlist:products
})


} catch (error) {
    console.error("Error in wishlist:", error);
    res.redirect("/pageNotFound");
  }
};

const addToWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const productId = req.body.productId;

    let wishlist = await Wishlist.findOne({ userId });

    if (!wishlist) {
      wishlist = new Wishlist({
        userId,
        product: [{ productId }]
      });
    } else {
      const productExists = wishlist.product.some(item => 
        item.productId.toString() === productId
      );

      if (!productExists) {
        wishlist.product.push({ productId });
      }
    }

    await wishlist.save();
    res.json({ success: true });
  } catch (error) {
    console.error('Wishlist error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const removeProduct=async(req,res)=>{
  try {
    const productId=req.query.productId;
    const userid = req.session?.userId || req.user?.id;

    if (!userid) {
        return res.status(401).json({ error: 'User not authenticated' });
    }
    
    const user=await User.findById(userid);
    const index=user.wishlist.indexOf(productId);
    user.wishlist.splice(index,1);
    await user.save()
    return res.redirect("/wishlist")
  } catch (error) {
    console.error(error);
    return res.status(500).json({status:false,message:"Server error"})
    
  }
}

const getWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const wishlist = await Wishlist.findOne({ userId })
      .populate('product.productId');

    res.render('wishlist', { wishlist });
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const wishlistController = {
  loadwishlistPage,
  addToWishlist,
  removeProduct,
  getWishlist
};

module.exports = wishlistController;