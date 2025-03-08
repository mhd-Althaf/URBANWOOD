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
        const data = {
            couponName: req.body.couponName,
            startDate: new Date(req.body.startDate + "T00:00:00"),
            endDate: new Date(req.body.endDate + "T00:00:00"),
            offerPrice: parseInt(req.body.offerPrice),
            minimumPrice: parseInt(req.body.minimumPrice),
        };

        const newCoupon = new Coupon({
            name: data.couponName,
            createdOn: Date.now(), // Auto set current timestamp
            expireOn: data.endDate,
            offerPrice: data.offerPrice,
            minimumPrice: data.minimumPrice
        });

        await newCoupon.save();
        console.log(newCoupon);
        return res.redirect('/admin/coupon');

    } catch (error) {
        console.error('Error creating coupon:', error);
        res.status(500).render('admin/pageerror', {
            message: 'Error creating coupon. Please try again.'
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
        const couponId = req.body.couponId;
        const oid = new mongoose.Types.ObjectId(couponId);

        // Check if coupon exists
        const selectedCoupon = await Coupon.findById(oid);
        if (!selectedCoupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        // Prepare new data
        const startDate = new Date(req.body.startDate);
        const endDate = new Date(req.body.endDate);

        // Perform the update
        const updateCoupon = await Coupon.updateOne(
            { _id: oid },
            {
                $set: {
                    name: req.body.couponName,
                    createdOn: startDate,
                    expireOn: endDate,
                    offerPrice: parseInt(req.body.offerPrice),
                    minimumPrice: parseInt(req.body.minimumPrice),
                }
            }
        );

        if (updateCoupon.modifiedCount > 0) {
            // Successful update
            return res.json({
                success: true,
                message: 'Coupon updated successfully'
            });
        } else {
            // No changes made (if the data was the same)
            return res.status(400).json({
                success: false,
                message: 'No changes made to the coupon'
            });
        }

    } catch (error) {
        console.error('Error updating coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update coupon. Please try again.'
        });
    }
};
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


module.exports = {
    loadCoupon,
    createCoupon,
    editCoupon,
    updateCoupon,
    deleteCoupon,
};
