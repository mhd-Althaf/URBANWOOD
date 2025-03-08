const mongoose = require("mongoose");
const product = require("./productSchema");
const {Schema} = mongoose;

const cartSchema = new Schema({
    userid:{
        type:Schema.Types.ObjectId,
        ref:"User",
        required:true
    },
    items:[{
        productId:{
            type:Schema.Types.ObjectId,
            ref:'Product',
            required:true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        }
    }],createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
})


cartSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Cart = mongoose.model("Cart",cartSchema);
module.exports = Cart;
