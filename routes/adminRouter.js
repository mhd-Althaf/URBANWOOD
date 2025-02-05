const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController")
const categoryController= require("../controllers/admin/categoryConroller");
const productController = require("../controllers/admin/productController")
const {userAuth,adminAuth} = require("../middlewares/auth");
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


//category management 
router.get('/category',adminAuth,categoryController.categoryInfo);
router.get('/addCategory',adminAuth,adminController.loadCategoryform)
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



    
module.exports = router;