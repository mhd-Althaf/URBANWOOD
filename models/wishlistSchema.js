const mongoose = require('mongoose'); 
const { Schema } = mongoose;

const wishlistSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    products: [{
        productId: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        addedOn: {
            type: Date,
            default: Date.now
        }
    }],
    lastModified: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Update lastModified on save
wishlistSchema.pre('save', function(next) {
    this.lastModified = new Date();
    next();
});

const Wishlist = mongoose.model("Wishlist", wishlistSchema);
module.exports = Wishlist;