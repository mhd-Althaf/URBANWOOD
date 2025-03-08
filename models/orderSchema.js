const mongoose = require("mongoose");
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid');

const orderSchema = new Schema({
    orderId: {
        type: String,
        required: true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    address: {
        name: String,
        phone: String,
        city: String,
        state: String,
        pincode: String
    },    
    orderItems: [
        {
            productId: {  
                type: Schema.Types.ObjectId,
                ref: "Product",
            },
            name: {
                type: String,
                required: true
            },
            quantity: {
                type: Number,
                required: true,
                min: 1
            },
            price: {
                type: Number,
                required: true
            },
            status: {
                type: String,
                enum: ["Pending", "Shipped", "Delivered", "Cancelled"],
                default: "Pending"
            },
            cancellationReason: {
                type: String,
                required: false
            },
            cancelledAt: {
                type: Date,
                required: false
            }
        }
    ],
    totalPrice: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    finalAmount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"],
        default: "Pending"
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;