const express = require('express');
const router = express.Router();
const userController = require("../controllers/user/userController");
const passport = require('passport');
const bodyParser = require('body-parser');
// const { route } = require('../app');
const productController=require("../controllers/user/productController")

router.get("/pageNotFound", userController.pageNotFound);
router.get("/", userController.loadHomepage);
router.get("/signup", userController.loadSignUp);
router.post("/signup", userController.signup);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp", userController.resendOtp);
router.get("/blocked",userController.blocked)
router.get("/productDetails",productController.productDetails)


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


//shop page
router.get("/shop",userController.loadShoppingPage)



router.get("/login", userController.loadLogin);
router.post("/login",userController.login);

router.get('/logout',userController.logout);



module.exports = router;