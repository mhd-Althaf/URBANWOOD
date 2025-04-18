const Coupon = require("../../models/couponSchema");
const mongoose = require("mongoose");

// Load coupons with proper pagination
const loadCoupon = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const startIndex = (page - 1) * limit;

        const totalCoupons = await Coupon.countDocuments();
        const totalPages = Math.ceil(totalCoupons / limit);

        const findcoupons = await Coupon.find({})
            .sort({ createdAt: -1 })
            .skip(startIndex)
            .limit(limit);

        res.render('admin/coupon', {
            coupons: findcoupons,
            currentPage: page,
            totalPages: totalPages
        });
    } catch (error) {
        console.error('Error loading coupons:', error);
        res.status(500).render('admin/pageerror', {
            message: 'Error loading coupons. Please try again.'
        });
    }
};

// Create a new coupon
const createCoupon = async (req, res) => {
    try {
        // Set proper content type
        res.setHeader('Content-Type', 'application/json');

        const data = {
            couponName: req.body.couponName,
            startDate: new Date(req.body.startDate + "T00:00:00"),
            endDate: new Date(req.body.endDate + "T00:00:00"),
            maximumPrice: parseInt(req.body.maximumPrice),
            minimumPrice: parseInt(req.body.minimumPrice),
            offerPrice: parseInt(req.body.offerPrice),
        };

        // Validate numeric values
        if (isNaN(data.maximumPrice) || isNaN(data.minimumPrice) || isNaN(data.offerPrice)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid price values provided'
            });
        }

        const newCoupon = new Coupon({
            name: data.couponName,
            createdOn: Date.now(),
            expireOn: data.endDate,
            maximumPrice: data.maximumPrice,
            minimumPrice: data.minimumPrice,
            offerPrice: data.offerPrice
        });

        await newCoupon.save();
        
        return res.status(200).json({
            success: true,
            message: 'New coupon created successfully'
        });

    } catch (error) {
        console.error('Error creating coupon:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create coupon. Please try again.'
        });
    }
};

// Edit a coupon (renders the edit page)
const editCoupon = async (req, res) => {
    try {
        const id = req.query.id;
        const findCoupon = await Coupon.findOne({ _id: id });
        res.render('admin/editCoupon', { findCoupon });
    } catch (error) {
        console.error(error);
        res.redirect("/pageerror");
    }
};
const updateCoupon = async (req, res) => {
    try {
      const couponId = req.params.id; // Get ID from URL params
      const oid = new mongoose.Types.ObjectId(couponId);
  
      // Validate input values
      const startDate = new Date(req.body.startDate);
      const endDate = new Date(req.body.endDate);
      const offerPrice = parseInt(req.body.offerPrice);
      const minimumPrice = parseInt(req.body.minimumPrice);
      const maximumPrice = parseInt(req.body.maximumPrice);
  
      // Validate numeric values
      if (isNaN(offerPrice) || isNaN(minimumPrice) || isNaN(maximumPrice)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid price values provided'
        });
      }
  
      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format'
        });
      }
  
      // Check if coupon exists
      const existingCoupon = await Coupon.findById(oid);
      if (!existingCoupon) {
        return res.status(404).json({
          success: false,
          message: 'Coupon not found'
        });
      }
  
      // Perform the update
      const updateResult = await Coupon.updateOne(
        { _id: oid },
        {
          $set: {
            name: req.body.couponName,
            createdOn: startDate,
            expireOn: endDate,
            offerPrice: offerPrice,
            minimumPrice: minimumPrice,
            maximumPrice: maximumPrice
          }
        },
        { runValidators: true }
      );
  
      if (updateResult.modifiedCount > 0) {
        return res.json({
          success: true,
          message: 'Coupon updated successfully'
        });
      } else {
        return res.status(400).json({
          success: false,
          message: 'No changes made to the coupon'
        });
      }
    } catch (error) {
      console.error('Error updating coupon:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update coupon',
        error: error.message
      });
    }
  };

// const updateCoupon = async (req, res) => {
//     try {
//         const { maximumPrice } = req.body;

//         const parsedMaxPrice = parseFloat(maximumPrice);
//         if (isNaN(parsedMaxPrice)) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Invalid maximum price value'
//             });
//         }
//         const coupon = await Coupon.findByIdAndUpdate(
//             req.params.id, 
//             { 
//                 ...req.body,
//                 maximumPrice: parsedMaxPrice 
//             },
//             { new: true, runValidators: true }
//         );

//         const couponId = req.body.couponId;
//         const oid = new mongoose.Types.ObjectId(couponId);

//         // Check if coupon exists
//         const selectedCoupon = await Coupon.findById(oid);
//         if (!selectedCoupon) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Coupon not found'
//             });
//         }

//         // Prepare new data
//         const startDate = new Date(req.body.startDate);
//         const endDate = new Date(req.body.endDate);

//         // Perform the update
//         const updateCoupon = await Coupon.updateOne(
//             { _id: oid },
//             {
//                 $set: {
//                     name: req.body.couponName,
//                     createdOn: startDate,
//                     expireOn: endDate,
//                     offerPrice: parseInt(req.body.offerPrice),
//                     minimumPrice: parseInt(req.body.minimumPrice),
//                     maximumPrice: parseInt(req.body.maximumPrice),
//                 }
//             }
//         );

//         if (updateCoupon.modifiedCount > 0) {
//             // Successful update
//             return res.json({
//                 success: true,
//                 message: 'Coupon updated successfully'
//             });
//         } else {
//             // No changes made (if the data was the same)
//             return res.status(400).json({
//                 success: false,
//                 message: 'No changes made to the coupon'
//             });
//         }

//     } catch (error) {
//         console.error('Error updating coupon:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Failed to update coupon'
//         });
//     }
// };

const deleteCoupon = async (req, res) => {
    try {
        const id = req.query.id;
        
        const couponToDelete = await Coupon.findById(id);
        if (!couponToDelete) {
            return res.status(404).send({
                success: false,
                message: 'Coupon not found'
            });
        }

        await Coupon.deleteOne({ _id: id });

        res.status(200).send({
            success: true,
            message: "Coupon deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting coupon:", error);
        res.status(500).send({
            success: false,
            message: "Failed to delete coupon. Please try again."
        });
    }
};

const applyCoupon = async (req, res) => {
    try {
        const { couponCode, cartTotal } = req.body;

        // Find the coupon in the database
        const coupon = await Coupon.findOne({ name: couponCode });

        if (!coupon) {
            return res.status(404).json({ success: false, message: "Invalid coupon code" });
        }

        // Check if the coupon is expired
        const currentDate = new Date();
        if (currentDate > coupon.expireOn) {
            return res.status(400).json({ success: false, message: "Coupon has expired" });
        }

        // Check if the minimum price condition is met
        if (cartTotal < coupon.minimumPrice) {
            return res.status(400).json({ success: false, message: `Minimum purchase of ${coupon.minimumPrice} required` });
        }

        // Calculate the discount
        const discountAmount = coupon.offerPrice;
        const finalPrice = cartTotal - discountAmount;

        res.status(200).json({
            success: true,
            message: "Coupon applied successfully",
            discountAmount,
            finalPrice,
        });

    } catch (error) {
        console.error("Error applying coupon:", error);
        res.status(500).json({ success: false, message: "Failed to apply coupon. Please try again." });
    }
};


module.exports = {
    loadCoupon,
    createCoupon,
    editCoupon,
    updateCoupon,
    deleteCoupon,
    applyCoupon,
};
