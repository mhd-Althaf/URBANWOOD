const mongoose = require("moongose");
const product = require("./productSchema");
const {Schema} = mongoose;

const wishlistSchema = new Schema({
    userId : {
        type:Schema.Types.ObjectId,
        ref:'Product',
        required:true
    },
    product:[
        {
            productId:{
                type:Schema.Types.ObjectId,
                ref:"Product",
                required:true
            },
            addedOn:{
                type:Date,
                default:Date.now
            }
        }
    ]
})

const wishlist = mongoose.model("wishlist",wishlistSchema);
module.exports = wishlist;