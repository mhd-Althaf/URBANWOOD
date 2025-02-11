const express = require('express');
const router = express.Router();
const userController = require("../controllers/user/userController");
const passport = require('passport');
const {userAuth, adminAuth}=require("../middlewares/auth")
const productController=require("../controllers/user/productController")
const profileController=require("../controllers/user/profileController");
const cartController = require("../controllers/user/cartController")


//Error management
router.get("/pageNotFound", userController.pageNotFound);

//user sign-up management  
router.get("/signup", userController.loadSignUp);
router.post("/signup", userController.signup);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp", userController.resendOtp);
router.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get("/auth/google/callback", 
    passport.authenticate("google", { failureRedirect: "/signup" }),
    (req, res) => {
        console.log("Authenticated User:", req.user); 

        req.login(req.user, (err) => {
            if (err) {
                console.log("Login Error:", err); // Debugging login error
                return res.redirect("/signup");
            }

            req.session.user = {
                _id: req.user._id,
                name: req.user.name,
                email: req.user.email,
            };
            console.log("Session User After Google Auth:", req.session.user); // Debugging session user
            res.redirect("/");
        });
    }
);

// Cart routes
router.post('/update-cart-quantity', cartController.updateCartQuantity);
router.post('/remove-from-cart', cartController.removeFromCart);
router.get('/checkout',cartController.getCheckoutPage);
router.post('/place-order', cartController.placeOrder);
//product management
router.get("/blocked",userController.blocked)
router.get("/productDetails",productController.productDetails)


// login management 
router.get("/login", userController.loadLogin);
router.post("/login",userController.login);

//home page & shoping page
router.get("/", userController.loadHomepage); 
router.get('/logout',userController.logout);


//google authentication


// profile-management//
router.get("/forgot-password",profileController.getForgotPassPage)
router.post("/forgot-email-valid", profileController.forgotEmailValid);
router.post("/verify-passForgot-otp", profileController.verifyForgotPassOtp);

router.get("/reset-password",profileController.getResetPassPage)
router.post("/resend-forgot-otp",profileController.resendOtp);
router.post("/reset-password",profileController.postNewPassword);
router.get("/userProfile",userAuth,profileController.userProfile);

router.get("/change-email",userAuth,profileController.changeEmail);
router.post("/change-email",userAuth,profileController.changeEmailValid);
router.post("/verify-email-otp",userAuth,profileController.verifyEmailOtp)  
router.post("/update-email",userAuth,profileController.updateEmail)
router.get("/change-password",userAuth,profileController.changePassword);
router.post("/change-password",userAuth,profileController.changePasswordValid);
router.post("/verify-changepassword-otp",userAuth,profileController.verifyChangePassOtp);


//address management//
router.get("/addaddress",userAuth,profileController.addaddress)
router.post("/addaddress",userAuth,profileController.postAddAddress);
router.get("/editAddress",userAuth,profileController.editAddress);
router.post("/editAddress",userAuth,profileController.postEditAddress);
router.get("/deleteAddress",userAuth,profileController.deleteAddress)






// Cart Management
router.get("/cart",userAuth, cartController.getCartPage)
router.post("/addToCart", userAuth,cartController.addToCart)
router.post("/changeQuantity", userAuth,cartController.changeQuantity)
router.get("/deleteItem", userAuth, cartController.deleteProduct)
router.get("/checkStock",userAuth,cartController.getCheckStock)
router.get('/getCartCount',userAuth,cartController.getCartCount)
router.post("/clearCart",userAuth,cartController.clearCart)

router.get('/shop',productController.getshop)






module.exports = router;