const Razorpay = require('razorpay');
const Order = require('../../models/orderSchema')

const mongoose = require("mongoose");





const getOrderListPageAdmin = async (req, res) => {
  try {
    const orders = await Order.find({})
      .sort({ createdAt: -1 })
      .populate("userId")
      .lean();

    for (let order of orders) {
      let shippingCost = order.totalPrice < 1000 ? 100 : 0;
      let discount = order.discount || 0;
      order.finalAmount = order.totalPrice + shippingCost - discount;
      if (order.finalAmount < 0) {
        order.finalAmount = 0;
      }

      order.status = order.status || "Pending";
      order.paymentMethod = order.paymentMethod || "N/A";
    }

    let itemsPerPage = 5;
    let currentPage = parseInt(req.query.page) || 1;
    let startIndex = (currentPage - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(orders.length / itemsPerPage);
    const currentOrder = orders.slice(startIndex, endIndex);

    // console.log("Orders sent to template:", JSON.stringify(currentOrder, null, 2));

    res.render("admin/orderList", {
      orders: currentOrder,
      totalPages,
      currentPage,
    });

  } catch (error) {
    console.error(error);
    res.redirect("/pageerror");
  }
};





const getOrderDetailsPageAdmin = async (req, res) => {
  try {
    const orderId = req.query.orderId;
    if (!orderId) throw new Error("Order ID is required.");


    const findOrder = await Order.findOne({ orderId: orderId })
      .populate("orderItems.productId")
      .populate("userId")
      .lean()
      .exec();

    if (!findOrder) throw new Error("Order not found.");

    // console.log(findOrder)
    const totalGrant = findOrder.orderItems.reduce(
      (sum, item) => sum + (Number(item.price) * item.quantity || 0),
      0
    );

    const discount = totalGrant - findOrder.totalPrice;
    const finalAmount = findOrder.totalPrice;

    res.render("admin/adminOrderDetails", {
      orders: findOrder,
      orderId,
      finalAmount,
      address: findOrder.address,
      orderStatus: findOrder.orderStatus,
    });
  } catch (error) {
    console.error("Order Details Error:", error.message);
    // res.status(500).render("", { message: error.message });
  }
};





// const changeOrderStatus = async (req, res) => {
//   console.log("Updating Order Status...");

//   try {
//     const { orderId } = req.params;
//     const { status, productId } = req.body;

//     console.log(orderId)
//     console.log(req.body)

//     const validStatuses = [
//       "Pending", "Processing", "Shipped", "Delivered", "Cancelled", 
//       "Return Request", "Returned"
//     ];

//     if (!validStatuses.includes(status)) {
//       return res.status(400).json({ status: false, message: "Invalid status" });
//     }

//     const order = await Order.findById(new mongoose.Types.ObjectId(orderId))
//     if (!order) {
//       return res.status(404).json({ status: false, message: "Order not found" });
//     }
//     console.log("Order Found:", order);


//     // Find the specific product in orderItems array
//     const orderItem = order.orderItems.find(item => item.productId.toString() === productId);

//     if (!orderItem) {
//       return res.status(404).json({ status: false, message: "Product not found in order" });
//     }
//     console.log("Order Items:", order.orderItems);



//     // Update status of specific product
//     orderItem.status = status;

//     // If status is Delivered, set delivery date

//     if (status === "Delivered") {
//       orderItem.deliveryDate = new Date();
//     }

//     await order.save();

//     return res.status(200).json({ status: true, message: "Status updated successfully" });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ status: false, message: "An error occurred" });
//   }
// };

// const changeOrderStatus = async (req, res) => {
//   console.log("Updating Order Status...");
//   try {
//     const { orderId } = req.params;
//     const { status, productId } = req.body;

//     console.log("Received Order ID:", orderId);
//     console.log("Received Product ID:", productId);
//     console.log("New Status:", status);

//     // if (!mongoose.Types.ObjectId.isValid(orderId)) {
//     //   return res.status(400).json({ status: false, message: "Invalid Order ID" });
//     // }
//     if (!mongoose.Types.ObjectId.isValid(orderId)) {
//       return res.status(400).json({ status: false, message: "Invalid Order ID" });
//     }
//     if (!mongoose.Types.ObjectId.isValid(productId)) {
//       return res.status(400).json({ status: false, message: "Invalid Product ID" });
//     }
//     productId = new mongoose.Types.ObjectId(productId);
//     const order = await Order.findById(new mongoose.Types.ObjectId(orderId));
//     if (!order) {
//       return res.status(404).json({ status: false, message: "Order not found" });
//     }

//     console.log("Order Found:", order);
//     if (!order.orderItems || order.orderItems.length === 0) {
//       return res.status(404).json({ status: false, message: "No products found in order" });
//     }

//     const orderItem = order.orderItems.find(item => item.productId.toString() === productId);
//     if (!orderItem) {
//       return res.status(404).json({ status: false, message: "Product not found in order" });
//     }

//     orderItem.status = status;
//     if (status === "Delivered") {
//       orderItem.deliveryDate = new Date();
//     }

//     await order.save();
//     return res.status(200).json({ status: true, message: "Status updated successfully" });

//   } catch (error) {
//     console.error("Error:", error);
//     return res.status(500).json({ status: false, message: "An error occurred" });
//   }
// };


const changeOrderStatus = async (req, res) => {
  console.log("Updating Order Status...");
  try {
    const { orderId } = req.params; 
    const { status } = req.body;

    console.log("Received Order ID:", orderId);
    console.log("New Status:", status);

    if (!status) {
      return res.status(400).json({ error: "Status is missing!" });
  }

    const validStatuses = [
      "Pending",
      "Processing",
      "Shipped",
      "Delivered",
      "Cancelled",
      "Return Request",
      "Returned",
    ];
    if (!validStatuses.includes(status)) {
      console.log("Invalid status value");
      return res.status(400).json({ status: false, message: "Invalid status value" });
    }

    const order = await Order.findById({_id:orderId});
    if (!order) {
      console.log("Order not found with orderId:", orderId);
      return res.status(404).json({ status: false, message: "Order not found" });
    }

    // console.log("Order Found:", JSON.stringify(order, null, 2));

    order.status = status; // Update top-level status

    await order.save();
    return res.status(200).json({
      status: true,
      message: "Status updated successfully",
      updatedStatus: order.status,
    });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ status: false, message: "An error occurred" });
  }
};






module.exports = {
  getOrderListPageAdmin,
  getOrderDetailsPageAdmin,
  changeOrderStatus,
}