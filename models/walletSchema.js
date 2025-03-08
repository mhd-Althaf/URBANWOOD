const mongoose = require("mongoose");
const { Schema } = mongoose;

const walletTransactionSchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    transactionId: {
      type: String,
      unique: true,
      default: () => `txn_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    },
    amount: {
      type: Number,
      required: true,
      min: [0, "Amount must be a positive number"],
    },
    type: {
      type: String,
      enum: ["Credit", "Debit"],
      required: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 255,
    },
    status: {
      type: String,
      enum: ["Success", "Pending", "Failed"],
      default: "Success",
    },
    source: {
      type: String,
      enum: ["Referral", "Purchase", "Refund", "Other"],
      default: "Other",
    },
    paymentMethod: {
      type: String,
      enum: ["Card", "UPI", "Bank Transfer", "Wallet Balance", "Other"],
      default: "Other",
    },
  },
  { timestamps: true }
);

const WalletTransaction = mongoose.model("WalletTransaction", walletTransactionSchema);
module.exports = WalletTransaction;
