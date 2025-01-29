const mongoose = require("mongoose");
const { Schema } = mongoose;

const userSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        sparse: true,
        match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ // Email validation
    },
    phone: {
        type: String,
        required: false,
        unique: false,
        sparse: true,
        default: null,
        match: /^\d{10}$/ // 10-digit phone number validation
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    password: {
        type: String,
        required: false
    },
    IsBlocked: {
        type: Boolean,
        default: false
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    cart: [{
        type: Schema.Types.ObjectId,
        ref: "Cart",
        default: []
    }],
    wallet: [{
        type: Schema.Types.ObjectId,
        ref: "Wishlist",
        default: []
    }],
    orderHistory: [{
        type: Schema.Types.ObjectId,
        ref: "Order",
        default: []
    }],
    createdOn: {
        type: Date,
        default: Date.now
    },
    referalCode: {
        type: String,
        default: null,
        minlength: 6,
        maxlength: 12
    },
    redeemed: {
        type: Boolean,
        default: false
    },
    redeemedUsers: [{
        type: Schema.Types.ObjectId,
        ref: "User",
        default: []
    }],
    searchHistory: [{
        category: {
            type: Schema.Types.ObjectId,
            ref: "Category"
        },
        brand: {
            type: String
        },
        searchOn: {
            type: Date,
            default: Date.now
        }
    }]
});

// Ensure indexing
//  
userSchema.index({ phone: 1, sparse: true });

const User = mongoose.model("User", userSchema);
module.exports = User;
