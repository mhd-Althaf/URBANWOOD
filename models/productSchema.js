const mongoose = require("mongoose");
const { Schema } = mongoose;

const productSchema = new Schema(
  {
    productId: {
      type: String,
      unique: true,
    },
    productName: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    regularPrice: {
      type: Number,
      required: true,
    },
    salePrice: {
      type: Number,
      required: true,
    },
    productOffer: {
      type: Number,
      default: 0,
    },
    quantity: {
      type: Number,
      required: true,
    },
    productImages: {
      type: [String],
      required: true,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["Available", "Out of stock", "Discontinued"],
      required: true,
      default: "Available",
    },
  },
  { timestamps: true }
);

productSchema.index({ productName: 'text', description: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ salePrice: 1 });

const Product = mongoose.model("Product", productSchema);

module.exports = Product;
