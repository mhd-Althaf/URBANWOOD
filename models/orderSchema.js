const mongoose = require("mongoose");
const { Schema } = mongoose;
const { v4: uuidv4 } = require('uuid');

const orderSchema = new Schema({
    orderId: {
        type: String,
       required:true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
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
    address: {
        addressType: { type: String, required: true },
        name: { type: String, required: true },
        city: { type: String, required: true },
        landMark: { type: String, required: true },
        state: { type: String, required: true },
        pincode: { type: Number, required: true },
        phone: { type: String, required: true },
        altPhone: { type: String, required: true }
    },
     // other existing fields...
     paymentMethod: {
        type: String,
        enum: ['cod','Credit Card', 'Debit Card', 'Razorpay'],
        required: true
    },
    razorpayOrderId: {
        type: String,
        required: false
    },
    status: {
        type: String,
        enum: [ "Pending", "Processing", "Shipped", "Delivered", "Cancelled","Return Request", "Returned"],
        default: "Pending"
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'paid', 'failed'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    invoiceDate: {
        type: Date
    },
    couponApplied: {
        type: Boolean,
        default: false
    },cancellationReason:{
        type:String,
        required:false
    },
    cancelledAt:{
        type:Date,
        required:false,
    }
});

// Create Order model
const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
