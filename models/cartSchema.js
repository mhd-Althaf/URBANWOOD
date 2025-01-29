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
        quantity:{
            type:Number,
            default:1
        },
        price:{
            type:Number,
            require:true
        },
        totalPrice:{
            type:Number,
            required:true
        },
        status:{
            type:String,
            default:'placed'
        },
        cancellationReason:{
            type:String,
            default:"none"
        }
    }]
})

const Cart = mongoose.model("Cart",cartSchema);
module.exports = Cart;
