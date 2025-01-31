const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController")
const categoryController= require("../controllers/admin/categoryConroller");
const productController = require("/controllers/admin/productController")
const {userAuth,adminAuth} = require("../middlewares/auth");
const storage = require("../helpers/multer");
const storage = require("../helpers/multer");
const multer = require("multer");
const uploads = multer({storage:storage});


// login management
router.get("/login", adminController.loadLogin);
router.post("/login", adminController.login);
router.get("/",adminAuth,adminController.loadDashboard);
router.get('/logout',adminController.logoutUser)

// customer management
router.get("/customers",adminAuth,customerController.customerInfo);
router.get("/blockCustomer",adminAuth,customerController.customerBlocked)
router.get("/unBlockCustomer",adminAuth,customerController.customerUnBlocked)


// product management 
router.get('/productGet',adminAuth,adminController.loadProductGet);
router.get('/addProducts',adminAuth,adminController.loadAddProducts);
router.get('/addproducts',adminAuth,adminController.loadAddProducts);


//category management 
router.get('/category',adminAuth,categoryController.categoryInfo);
router.get('/addCategory',adminAuth,adminController.loadCategoryform)
router.post('/addCategory',adminAuth,categoryController.addCategory)
router.get("/editCategory/:id",adminAuth,categoryController.getUpdateCategory)
router.post("/editCategory/:id",adminAuth,categoryController.editCategory);
router.get("/listCategory",adminAuth,categoryController.listCategory);
router.get("/unlistCategory",adminAuth,categoryController.unlistCategory);


module.exports = router;