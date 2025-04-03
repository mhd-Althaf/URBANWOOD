const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController")
const categoryController= require("../controllers/admin/categoryConroller");
const productController = require("../controllers/admin/productController")
const couponController = require("../controllers/admin/couponController");
const Order = require("../models/orderSchema");

const {userAuth,adminAuth} = require("../middlewares/auth");
const storage = require("../helpers/multer");
const multer = require("multer");
const uploads = multer({storage:storage});

const orderController = require('../controllers/admin/orderController');
const dashboardController = require('../controllers/admin/dashboardController');
const excel = require('exceljs');
const PDFDocument = require('pdfkit');

// login management
router.get("/login", adminController.loadLogin);
router.post("/login",adminController.login);

router.get('/logout',adminController.logoutUser)

// customer management
router.get("/customers",adminAuth,customerController.customerInfo);
router.get("/blockCustomer",adminAuth,customerController.customerBlocked)
router.get("/unBlockCustomer",adminAuth,customerController.customerUnBlocked)


//category management 
router.get('/category',adminAuth,categoryController.categoryInfo);
router.get('/addCategory',adminAuth,adminController.loadAddCategory)
router.post('/addCategory',adminAuth,categoryController.addCategory)
router.get("/editCategory/:id",adminAuth,categoryController.getUpdateCategory)
router.post("/editCategory/:id",adminAuth,categoryController.editCategory);
router.get("/listCategory",adminAuth,categoryController.listCategory);
router.get("/unlistCategory",adminAuth,categoryController.unlistCategory);


// product management 
// router.get('/productGet',adminAuth,adminController.loadProductGet);
router.get("/addProducts", productController.getProductAddPage);
router.post("/addProducts", adminAuth, uploads.array("images", 4), productController.addProducts);
router.get('/productGet',adminAuth,productController.getAllProducts);
router.post("/blockProduct", adminAuth, productController.blockProduct);
router.post("/unblockProduct", adminAuth, productController.unblockProduct);
router.get("/editProduct/:id", adminAuth, productController.getEditProduct);
router.post("/editProduct/:id", adminAuth, uploads.array("images", 4), productController.editProduct);
router.post("/editProduct/:id", productController.editProduct);
router.post("/deleteImage", adminAuth, productController.deleteSingleImage);

// Coupon Management 
router.get("/coupon", adminAuth, couponController.loadCoupon);
router.post("/createCoupon", adminAuth, couponController.createCoupon);
router.get("/editCoupon", adminAuth, couponController.editCoupon);
router.post("/updatecoupon/:id", adminAuth, couponController.updateCoupon);
router.get("/deleteCoupon", adminAuth, couponController.deleteCoupon);
router.post("/apply-coupon", adminAuth, couponController.applyCoupon);


//order
router.get('/order',adminAuth,orderController.getOrderListPageAdmin);
router.get("/orderDetailsAdmin",adminAuth,orderController.getOrderDetailsPageAdmin);
router.post('/changeStatus/:orderId', adminAuth, orderController.changeOrderStatus);
router.post('/acceptReturn', adminAuth, orderController.acceptReturn);
router.post('/rejectReturn', adminAuth, orderController.rejectReturn);



// Sales Report
router.get('/sales-report', adminAuth, orderController.getSalesReport);
router.get('/generate-sales-report', adminAuth, orderController.generateSalesReport);
router.post('/generate-sales-report', adminAuth, orderController.generateSalesReport);
router.get('/download-report/:format', adminAuth, orderController.downloadReport);

// Dashboard routes
router.get('/dashboard', adminAuth, dashboardController.getDashboard);
router.get('/dashboard/filter', adminAuth, dashboardController.getFilteredData);

// Export routes
router.get('/download-report/excel', adminAuth, async (req, res) => {
    try {
        const workbook = new excel.Workbook();
        const worksheet = workbook.addWorksheet('Ledger Book');

        // Add headers
        worksheet.columns = [
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Order ID', key: 'orderId', width: 15 },
            { header: 'Customer', key: 'customer', width: 20 },
            { header: 'Products', key: 'products', width: 30 },
            { header: 'Amount', key: 'amount', width: 15 },
            { header: 'Payment Method', key: 'paymentMethod', width: 15 },
            { header: 'Status', key: 'status', width: 15 }
        ];

        // Get orders data
        const orders = await Order.find()
            .populate('userId', 'name')
            .populate('orderItems.productId', 'productName')
            .sort({ createdAt: -1 });

        // Add rows
        orders.forEach(order => {
            worksheet.addRow({
                date: new Date(order.createdAt).toLocaleDateString(),
                orderId: order.orderId,
                customer: order.userId ? order.userId.name : 'N/A',
                products: order.orderItems.map(item => `${item.productId.productName} (${item.quantity})`).join(', '),
                amount: `₹${order.finalAmount.toFixed(2)}`,
                paymentMethod: order.paymentMethod,
                status: order.status
            });
        });

        // Style the worksheet
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=ledger-book.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Excel Export Error:', error);
        res.status(500).send('Error generating Excel file');
    }
});

router.get('/download-report/pdf', adminAuth, async (req, res) => {
    try {
        const doc = new PDFDocument();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=ledger-book.pdf');
        doc.pipe(res);

        // Add title
        doc.fontSize(20).text('Ledger Book', { align: 'center' });
        doc.moveDown();

        // Get orders data
        const orders = await Order.find()
            .populate('userId', 'name')
            .populate('orderItems.productId', 'productName')
            .sort({ createdAt: -1 });

        // Add table headers
        const tableTop = doc.y;
        const tableLeft = 50;
        const colWidth = 80;
        const rowHeight = 30;

        // Draw headers
        doc.fontSize(10)
           .text('Date', tableLeft, tableTop)
           .text('Order ID', tableLeft + colWidth, tableTop)
           .text('Customer', tableLeft + colWidth * 2, tableTop)
           .text('Amount', tableLeft + colWidth * 4, tableTop)
           .text('Status', tableLeft + colWidth * 5, tableTop);

        // Draw rows
        let y = tableTop + rowHeight;
        orders.forEach(order => {
            if (y > 700) {
                doc.addPage();
                y = 50;
            }

            doc.fontSize(8)
               .text(new Date(order.createdAt).toLocaleDateString(), tableLeft, y)
               .text(order.orderId, tableLeft + colWidth, y)
               .text(order.userId ? order.userId.name : 'N/A', tableLeft + colWidth * 2, y)
               .text(`₹${order.finalAmount.toFixed(2)}`, tableLeft + colWidth * 4, y)
               .text(order.status, tableLeft + colWidth * 5, y);

            y += rowHeight;
        });

        doc.end();
    } catch (error) {
        console.error('PDF Export Error:', error);
        res.status(500).send('Error generating PDF file');
    }
});

module.exports = router;