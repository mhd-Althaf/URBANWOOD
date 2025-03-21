const mongoose = require("mongoose");
const { Schema } = mongoose;

const returnOrderSchema = new Schema({
    userId: { 
        type: Schema.Types.ObjectId, 
        ref: "User", 
        required: true 
    },
    orderId: { 
        type: Schema.Types.ObjectId, 
        ref: "Order", 
        required: true 
    },
    reason: { 
        type: String, 
        required: true 
    },
    status: { 
        type: String, 
        enum: ["Pending", "Approved", "Rejected", "Refunded","Return_Requested","Returned"], 
        default: "Pending" 
    },
    refundAmount: { 
        type: Number, 
        default: 0 
    },
    refundMethod: { 
        type: String, 
        enum: ["Wallet", "Bank Transfer", "Original Payment Method"], 
        default: "Wallet" 
    },
    refundedAt: { 
        type: Date, 
        default: null 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

const ReturnOrder = mongoose.model("ReturnOrder", returnOrderSchema);
module.exports = ReturnOrder;
