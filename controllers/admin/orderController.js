const Razorpay = require('razorpay');
const Order = require('../../models/orderSchema')

const mongoose = require("mongoose");
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');





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

    // Filter out orders with Razorpay payment method and pending payment status
    const filteredOrders = orders.filter(order => 
      !(order.paymentMethod === "Razorpay" && order.paymentStatus === "Pending")
    );

    let itemsPerPage = 5;
    let currentPage = parseInt(req.query.page) || 1;
    let startIndex = (currentPage - 1) * itemsPerPage;
    let endIndex = startIndex + itemsPerPage;
    let totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
    const currentOrder = filteredOrders.slice(startIndex, endIndex);

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
  try {
    const { orderId } = req.params; 
    const { status } = req.body;

    // Validate inputs
    if (!orderId || !status) {
      return res.status(400).json({ 
        status: false, 
        message: "Order ID and status are required" 
      });
    }

    // Validate status value
    const validStatuses = [
      "Pending",
      "Processing",
      "Shipped",
      "Delivered",
      "Cancelled",
      "Return Request",
      "Returned"
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        status: false, 
        message: "Invalid status value" 
      });
    }

    // Find and update the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ 
        status: false, 
        message: "Order not found" 
      });
    }

    // Update the order status
    order.status = status;
    
    // If status is Delivered, set delivery date
    if (status === "Delivered") {
      order.deliveryDate = new Date();
    }

    // Save the updated order
    await order.save();

    return res.status(200).json({
      status: true,
      message: "Status updated successfully",
      updatedStatus: status
    });

  } catch (error) {
    console.error("Error in changeOrderStatus:", error);
    return res.status(500).json({ 
      status: false, 
      message: "An error occurred while updating the order status" 
    });
  }
};

const getSalesReport = async (req, res) => {
    try {
        // Set default query for daily report
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const query = { createdAt: { $gte: today } };

        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = 10; 
        const skip = (page - 1) * limit;

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        const orders = await Order.find(query)
            .populate('userId', 'name email')
            .populate('orderItems.productId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        let totalSales = 0;
        let totalDiscount = 0;

        orders.forEach(order => {
            totalSales += order.finalAmount;
            totalDiscount += order.discount || 0;
        });

        const reportData = {
            orders,
            totalSales,
            totalOrders,
            totalDiscount,
            startDate: today,
            endDate: new Date()
        };

        res.render('admin/salesReport', {
            reportData,
            dateRange: {
                startDate: today.toISOString().split('T')[0],
                endDate: new Date().toISOString().split('T')[0],
                reportType: 'daily'
            },
            currentPage: page,
            totalPages
        });
    } catch (error) {
        console.error('Error loading sales report page:', error);
        res.status(500).send('Internal Server Error');
    }
};

const generateSalesReport = async (req, res) => {
    try {
        // Get parameters from either POST body or GET query
        const { startDate, endDate, reportType } = req.method === 'POST' ? req.body : req.query;
        let query = {};

        if (reportType === 'custom' && startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        } else if (reportType === 'daily') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            query.createdAt = { $gte: today };
        } else if (reportType === 'weekly') {
            const lastWeek = new Date();
            lastWeek.setDate(lastWeek.getDate() - 7);
            query.createdAt = { $gte: lastWeek };
        } else if (reportType === 'monthly') {
            const lastMonth = new Date();
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            query.createdAt = { $gte: lastMonth };
        }

        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = 10; // Number of orders per page
        const skip = (page - 1) * limit;

        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        const orders = await Order.find(query)
            .populate('userId', 'name email')
            .populate('orderItems.productId')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        let totalSales = 0;
        let totalDiscount = 0;

        orders.forEach(order => {
            totalSales += order.finalAmount;
            totalDiscount += order.discount || 0;
        });

        const reportData = {
            orders,
            totalSales,
            totalOrders,
            totalDiscount,
            startDate: startDate || null,
            endDate: endDate || null
        };

        res.render('admin/salesReport', {
            reportData,
            dateRange: {
                startDate,
                endDate,
                reportType
            },
            currentPage: page,
            totalPages
        });

    } catch (error) {
        console.error('Error generating sales report:', error);
        res.status(500).send('Error generating report');
    }
};

const downloadReport = async (req, res) => {
    try {
        const { format } = req.params;
        const { startDate, endDate, reportType } = req.query;
        
        let query = {};
        if (reportType === 'custom' && startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        } else if (reportType === 'daily') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            query.createdAt = { $gte: today };
        } else if (reportType === 'weekly') {
            const lastWeek = new Date();
            lastWeek.setDate(lastWeek.getDate() - 7);
            query.createdAt = { $gte: lastWeek };
        } else if (reportType === 'monthly') {
            const lastMonth = new Date();
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            query.createdAt = { $gte: lastMonth };
        }

        const orders = await Order.find(query)
            .populate('userId', 'name email')
            .populate('orderItems.productId')
            .sort({ createdAt: -1 });

        if (format === 'excel') {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Sales Report');

            // Add headers
            worksheet.addRow([
                'Order ID',
                'Customer',
                'Date',
                'Products',
                'Total Amount',
                'Discount',
                'Final Amount',
                'Payment Method',
                'Status'
            ]);

            // Add data
            orders.forEach(order => {
                worksheet.addRow([
                    order.orderId,
                    order.userId ? order.userId.name : 'N/A',
                    order.createdAt.toLocaleDateString(),
                    order.orderItems.map(item => `${item.name} (${item.quantity})`).join(', '),
                    order.totalPrice,
                    order.discount || 0,
                    order.finalAmount,
                    order.paymentMethod,
                    order.status
                ]);
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');

            await workbook.xlsx.write(res);
            return res.end();

        } else if (format === 'pdf') {
            const doc = new PDFDocument({
                margin: 50,
                size: 'A4',
                autoFirstPage: true
            });
            
            // Track page count
            let pageCount = 1; // Start with 1 for the first page
            
            // Register event to track new pages
            doc.on('pageAdded', () => {
                pageCount++;
            });
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');
            doc.pipe(res);

            // Add company logo and details with better spacing
            doc.fontSize(24).text('URBANWOOD', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(14).text('Premium Furniture Store', { align: 'center' });
            doc.fontSize(10);
            doc.text('123 Furniture Street, Woodlands', { align: 'center' });
            doc.text('Phone: +1234567890 | Email: info@urbanwood.com', { align: 'center' });
            doc.moveDown(1);

            // Add horizontal line after header
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown(1);

            // Add title and report period with better spacing
            doc.fontSize(16).text('Sales Report', { align: 'center' });
            doc.moveDown(0.5);
            const reportPeriod = `Report Period: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
            doc.fontSize(12).text(reportPeriod, { align: 'center' });
            doc.moveDown(1);

            // Calculate totals
            let totalSales = 0;
            let totalDiscount = 0;
            orders.forEach(order => {
                totalSales += order.finalAmount;
                totalDiscount += order.discount || 0;
            });

            // Summary section with improved box and alignment
            const summaryStartY = doc.y;
            // Draw summary box with light gray background
            doc.rect(50, summaryStartY, 500, 100).fill('#f5f5f5');
            doc.fill('#000000'); // Reset fill color to black for text

            // Summary title
            doc.fontSize(14).text('Summary', 50, summaryStartY + 10, { align: 'center', width: 500 });
            
            // Summary data with improved alignment
            const summaryLeftX = 150;
            const summaryValueX = 350;
            doc.fontSize(12);
            
            // Draw summary items with consistent spacing
            doc.text('Total Orders:', summaryLeftX, summaryStartY + 35);
            doc.text(orders.length.toString(), summaryValueX, summaryStartY + 35);
            
            doc.text('Total Sales:', summaryLeftX, summaryStartY + 55);
            doc.text(`Rs: ${totalSales.toFixed(2)}`, summaryValueX, summaryStartY + 55);
            
            doc.text('Total Discount:', summaryLeftX, summaryStartY + 75);
            doc.text(`Rs: ${totalDiscount.toFixed(2)}`, summaryValueX, summaryStartY + 75);

            doc.moveDown(4); // Add space after summary box

            // Order Details section with improved table
            doc.fontSize(14).text('Order Details', { align: 'left' });
            doc.moveDown(0.5);

            // Define table structure
            const tableTop = doc.y;
            const tableHeaders = ['Order ID', 'Customer', 'Date', 'Amount', 'Status'];
            const columnWidths = [100, 120, 100, 100, 80];
            const startX = 50;
            const rowHeight = 25;

            // Draw table header with background
            doc.rect(startX, tableTop, 500, rowHeight).fill('#e0e0e0');
            doc.fill('#000000');

            // Add header text
            let currentX = startX;
            tableHeaders.forEach((header, i) => {
                doc.fontSize(10)
                   .text(header, 
                        currentX + 5, 
                        tableTop + 7,
                        { width: columnWidths[i] - 5, align: 'left' });
                currentX += columnWidths[i];
            });

            // Draw table rows
            let currentY = tableTop + rowHeight;

            orders.forEach((order, index) => {
                // Check for page break
                if (currentY > 700) {
                    // Before adding a new page, add footer to current page
                    const bottomY = doc.page.height - 50;
                    doc.fontSize(8);
                    doc.text(`Generated on: ${new Date().toLocaleString()}`, 50, bottomY, { align: 'left' });
                    
                    // Add new page
                    doc.addPage();
                    currentY = 50;
                    
                    // Repeat header on new page
                    doc.rect(startX, currentY, 500, rowHeight).fill('#e0e0e0');
                    doc.fill('#000000');
                    
                    currentX = startX;
                    tableHeaders.forEach((header, i) => {
                        doc.fontSize(10)
                           .text(header,
                                currentX + 5,
                                currentY + 7,
                                { width: columnWidths[i] - 5, align: 'left' });
                        currentX += columnWidths[i];
                    });
                    currentY += rowHeight;
                }

                // Draw row background (alternate colors)
                doc.rect(startX, currentY, 500, rowHeight)
                   .fill(index % 2 === 0 ? '#ffffff' : '#f9f9f9');
                doc.fill('#000000');

                // Add row data
                currentX = startX;
                [
                    order.orderId,
                    order.userId ? order.userId.name : 'N/A',
                    order.createdAt.toLocaleDateString(),
                    `Rs: ${order.finalAmount.toFixed(2)}`,
                    order.status
                ].forEach((text, i) => {
                    doc.fontSize(9)
                       .text(text,
                            currentX + 5,
                            currentY + 7,
                            { 
                                width: columnWidths[i] - 5,
                                align: i === 3 ? 'right' : 'left'
                            });
                    currentX += columnWidths[i];
                });

                // Draw row border
                doc.rect(startX, currentY, 500, rowHeight).stroke();
                currentY += rowHeight;
            });

            // Finalize the document
            // Add footer with page numbers
            const bottomY = doc.page.height - 50;
            doc.fontSize(8);
            doc.text(`Generated on: ${new Date().toLocaleString()}`, 50, bottomY, { align: 'left' });
            doc.text(`Report generated by AdminPanel`, 500, bottomY, { align: 'right' });

            doc.end();
        } else {
            res.status(400).send('Invalid format specified');
        }

    } catch (error) {
        console.error('Error downloading report:', error);
        res.status(500).send('Error downloading report');
    }
};

const acceptReturn = async (req, res) => {
  try {
    const { orderId, itemId, comment, productName } = req.body;
    console.log("Accept Return Request:", { orderId, itemId, comment, productName });
    
    if (!orderId || !itemId) {
      return res.status(400).json({ 
        status: false, 
        message: "Order ID and Item ID are required" 
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      console.log("Order not found with ID:", orderId);
      return res.status(404).json({ 
        status: false, 
        message: "Order not found" 
      });
    }
    console.log("Found order:", order._id);

    // Find the specific product item in order
    let productItem;
    if (order.orderItems.id) {
      productItem = order.orderItems.id(itemId);
    }
    
    // If id() method doesn't work, try to find it manually
    if (!productItem) {
      console.log("Using manual find for item with ID:", itemId);
      productItem = order.orderItems.find(item => item._id.toString() === itemId);
    }
    
    if (!productItem) {
      console.log("Product item not found in order. Available items:", 
        order.orderItems.map(i => ({ id: i._id.toString(), name: i.name })));
      return res.status(404).json({ 
        status: false, 
        message: "Product not found in order" 
      });
    }
    console.log("Found product item:", productItem._id);

    // Update status to Returned
    productItem.status = "Returned";
    productItem.adminComment = comment || "Return approved";
    console.log("Updated product status to Returned");
    
    // Update product stock if available
    if (productItem.productId) {
      const Product = require('../../models/productSchema');
      const product = await Product.findById(productItem.productId);
      if (product) {
        product.quantity += productItem.quantity;
        await product.save();
        console.log("Updated product stock. Added", productItem.quantity, "to inventory");
      }
    }

    // Update user wallet if applicable
    if (order.userId) {
      const Wallet = require('../../models/walletSchema');
      
      // Calculate refund amount
      const refundAmount = productItem.price * productItem.quantity;
      
      // Find or create wallet for the user
      let wallet = await Wallet.findOne({ userId: order.userId });
      
      if (!wallet) {
        wallet = new Wallet({
          userId: order.userId,
          balance: 0,
          transactions: []
        });
      }
      
      // Update wallet balance
      wallet.balance += refundAmount;
      
      // Add transaction to wallet history
      wallet.transactions.push({
        amount: refundAmount,
        type: 'credit',
        description: `Refund for returned product: ${productName || productItem.name || 'Product'}`,
        orderId: order._id,
        productId: productItem.productId,
        createdAt: new Date()
      });
      
      await wallet.save();
      console.log("Updated user wallet. Added refund of", refundAmount);
      
      // Also update the legacy wallet in user schema for backward compatibility
      const User = require('../../models/userSchema');
      const user = await User.findById(order.userId);
      if (user) {
        if (typeof user.wallet !== 'number') {
          user.wallet = 0;
        }
        user.wallet += refundAmount;
        
        if (!Array.isArray(user.walletHistory)) {
          user.walletHistory = [];
        }
        
        user.walletHistory.push({
          amount: refundAmount,
          transactionType: 'credit',
          timestamp: new Date()
        });
        
        await user.save();
        console.log("Updated legacy user wallet for backward compatibility");
      }
    }

    await order.save();
    console.log("Saved order with returned item");

    return res.status(200).json({ 
      status: true, 
      message: "Return accepted successfully" 
    });
  } catch (error) {
    console.error("Error accepting return:", error);
    return res.status(500).json({ 
      status: false, 
      message: "An error occurred while processing the return" 
    });
  }
};

const rejectReturn = async (req, res) => {
  try {
    const { orderId, itemId, comment } = req.body;
    console.log("Reject Return Request:", { orderId, itemId, comment });
    
    if (!orderId || !itemId) {
      return res.status(400).json({ 
        status: false, 
        message: "Order ID and Item ID are required" 
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      console.log("Order not found with ID:", orderId);
      return res.status(404).json({ 
        status: false, 
        message: "Order not found" 
      });
    }
    console.log("Found order:", order._id);

    // Find the specific product item in order
    let productItem;
    if (order.orderItems.id) {
      productItem = order.orderItems.id(itemId);
    }
    
    // If id() method doesn't work, try to find it manually
    if (!productItem) {
      console.log("Using manual find for item with ID:", itemId);
      productItem = order.orderItems.find(item => item._id.toString() === itemId);
    }
    
    if (!productItem) {
      console.log("Product item not found in order. Available items:", 
        order.orderItems.map(i => ({ id: i._id.toString(), name: i.name })));
      return res.status(404).json({ 
        status: false, 
        message: "Product not found in order" 
      });
    }
    console.log("Found product item:", productItem._id);
    console.log("Current product status:", productItem.status);

    // Update status to Return_Rejected
    productItem.status = "Return_Rejected";
    productItem.adminComment = comment || "Return request rejected";
    console.log("Updated product status to Return_Rejected");
    
    await order.save();
    console.log("Saved order with rejected return item");

    return res.status(200).json({ 
      status: true, 
      message: "Return rejected successfully" 
    });
  } catch (error) {
    console.error("Error rejecting return:", error);
    return res.status(500).json({ 
      status: false, 
      message: "An error occurred while processing the return rejection" 
    });
  }
};

module.exports = {
  getOrderListPageAdmin,
  getOrderDetailsPageAdmin,
  changeOrderStatus,
  getSalesReport,
  generateSalesReport,
  downloadReport,
  acceptReturn,
  rejectReturn
}