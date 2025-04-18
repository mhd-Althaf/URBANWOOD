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
        addressType: { type: String, required: true },
        name: { type: String, required: true },
        city: { type: String, required: true },
        landMark: { type: String, required: true },
        state: { type: String, required: true },
        pincode: { type: Number, required: true },
        phone: { type: String, required: true },
        altPhone: { type: String, required: true }
    },    
    orderItems: [
        {
            productId: {  
                type: mongoose.Schema.Types.ObjectId,
                ref: "Product",
                required: true   
            },
            image: { 
                type: String 
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
            deliveryDate:{
                type:Date,
            },
            status: {
                type: String,
                enum: ["Pending", "Shipped", "Delivered", "Cancelled", "Return_Requested", "Returned", "Return_Rejected"],
                default: "Pending"
            },
            cancellationReason: {
                type: String,
                required: false
            },
            cancelledAt: {
                type: Date,
                required: false
            }, ReturnReason: {
                type: String,
                required: false
            },
            ReturnedAt: {
                type: Date,
                required: false
            },
            adminComment: {
                type: String,
                required: false
            },
            paymentMethod: {
                type: String,
                enum: ['cod','Credit Card', 'Debit Card', 'Razorpay', 'wallet','Wallet'],
                required: false
            },
        }
    ],
    paymentMethod: {
        type: String,
        enum: ['cod','Credit Card', 'Debit Card', 'Razorpay', 'Wallet','wallet'],
        required: true
    },
    shippingCost: {
        type: Number,
        required: true,
        default: 0  
    },
    status: {
        type: String,
        enum: [ "Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Returned"],
        default: "Pending"
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'paid', 'failed'],
        default: 'Pending'
    },
    deliveryDate:{
        type:Date,
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
    },
    cancellationReason:{
        type:String,
        required:false
    },
    cancelledAt:{
        type:Date,
        required:false,
    },
    totalPrice: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0
    },
    couponApplied: {
        type: Boolean,
        default: false,
    },
    couponDiscount: {
        type: Number,
        default: 0,
    },
    couponCode: {
        type: String,
        default: null,
    },
    finalAmount: {
        type: Number,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    razorpayOrderId: {
        type: String,
        required: false
    },
    razorpayPaymentId: {
        type: String,
    },
    razorpaySignature: {
        type: String,
    },
});

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;