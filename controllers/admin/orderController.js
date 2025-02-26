const Order = require('../../models/orderSchema')

const mongoose = require('mongoose');





const getOrderListPageAdmin = async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 }).populate("userId").lean();

    for (let order of orders) {
      let shippingCost = order.totalPrice < 1000 ? 100 : 0;
      let discount = order.discount || 0;
      order.finalAmount = order.totalPrice + shippingCost - discount;
      if (order.finalAmount < 0) {
        order.finalAmount = 0;
      }
    }

    let itemsPerPage = 5;
    let currentPage = parseInt(req.query.page) || 1;
    let startIndex = (currentPage - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(orders.length / itemsPerPage);
    const currentOrder = orders.slice(startIndex, endIndex);


    res.render("admin/orderList", { orders: currentOrder, totalPages, currentPage });
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

    console.log(findOrder)
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





const changeOrderStatus = async (req, res) => {
  console.log("Updating Order Status...");

  try {
    const { orderId } = req.params;
    const { status } = req.body;

    console.log(orderId)
    console.log(req.body)



    const validStatuses = [
      "Pending", "Processing", "Shipped", "Delivered", "Cancelled",
      "Return Request", "Returned"
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ status: false, message: "Invalid status" });
    }


    const order = await Order.findOne({ orderId: orderId });
    if (!order) {
      return res.status(404).json({ status: false, message: "Order not found" });
    }

    console.log(order)

    if (!order.orderItems || order.orderItems.length === 0) {
      return res.status(400).json({ status: false, message: "No items found in the order" });
    }


    order.status = status;
    await order.save();

    return res.status(200).json({ status: true, message: "Status updated successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "An error occurred" });
  }
};





module.exports = {
  getOrderListPageAdmin,
  getOrderDetailsPageAdmin,
  changeOrderStatus,
}