
const User = require("../../models/userSchema");
const nodemailer = require("nodemailer");
const env = require("dotenv").config();
const bcrypt = require("bcrypt")
const Product=require("../../models/productSchema")
const Category=require("../../models/categorySchema")



const loadHomepage = async (req, res) => {
  try {
    const user = req.session.user;
    

    
    const categories = await Category.find({ isListed: true });

    if (!categories || categories.length === 0) {
      console.error("No categories found");
      return res.status(404).send("No categories available");
    }

    
    let productData = await Product.find({
      isBlocked: false,
      category: { $in: categories.map((category) => category._id) },
      quantity: { $gt: 0 },
    });

    if (!productData || productData.length === 0) {
      console.error("No products found");
      return res.render("user/home", { user: user || '', products: [] });
    }

   
    productData.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
    productData = productData.slice(0, 4);

    
    if (user) {
      const userData = await User.findOne({ _id: user });
      if (!userData) {
        console.error("User not found");
        return res.status(404).send("User not found");
      }
      res.render("user/home", { user: userData, products: productData });
    } else {
     
      res.render("user/home", { user: '', products: productData });
    }

  } catch (error) {
    console.error("Error loading homepage:", error.message);
    res.status(500).send("Server error");
  }
};

  


  

const pageNotFound = async (req,res) => {
    try{
        res.render("user/page-404")
    }catch(error){
        res.redirect("/pageNotFound")
    }
}


const loadSignUp = async (req, res) => {
  try {
    
    return res.render("user/signup", { message:null});
  } catch (error) {
    console.log("Home page not loading:", error);
    res.status(500).send("Server Error");
  }
};

function generateOtp(){
    return Math.floor(100000 + Math.random()*900000).toString();
}

async function sendVerificationEmail(email,otp) {
    try{

        const transporter = nodemailer.createTransport({
            service:'gmail',
            port:587,
            secure:false,
            requireTLS:true,
            auth:{
                user:process.env.NODEMAILER_EMAIL,
                pass:process.env.NODEMAILER_PASSWORD
            }
        })

        const info = await transporter.sendMail({
            from:process.env.NODEMAILER_EMAIL,
            to:email,
            subject:"Verify your account",
            text:`Your OTP is ${otp}`,
            html:`<b>Your OTP:${otp} </b>`,
        })

        return info.accepted.length > 0;

    }catch(error){
        console.error("Error sending email",error);
        return false;
    }
}

const signup = async (req, res) => {
  try {
    const { name, phone, email, password, cPassword } = req.body;
   

    if (password !== cPassword) {
      return res.render("user/signup", { message: "Passwords do not match" });
    }
     
    const findUser = await User.findOne({ email });

    if (findUser) {
      console.log('alrddd');
      
      return res.render("user/signup", { message: "User with this email already exists" });
    }

    const otp = generateOtp();
    console.log("Generated OTP:", otp);
     
    const emailSend = sendVerificationEmail(email, otp);
    if (!emailSend) {
      return res.json("email-error");
    }

    req.session.userOtp = otp;
    req.session.userData = { name, phone, email, password };

    res.render("user/verify-otp");
    console.log("OTP sent:", otp);

  } catch (error) {
    console.log("Signup error:", error);
    res.redirect("/pageNotFound");
  }
};


const securePassword = async (password) => {
    try {
      const passwordHash = await bcrypt.hash(password, 10);
      return passwordHash;
    } catch (error) 
    {
      console.error("password error", error);
      res.redirect("/pageNotFound");
    }
  };



const verifyOtp = async (req, res) => {
    try {
      const { otp } = req.body;
      console.log("Received OTP:", otp);
  
      
      if (!req.session.userOtp || !req.session.userData) {
        return res.status(400).json({ success: false, message: "Session expired. Please try again." });
      }
  
     
      if (Date.now() > req.session.otpExpiration) {
        return res.send({ success: false, message: "OTP has expired. Please request a new one." });
      }
  
     
      if (otp.trim() === req.session.userOtp) {
        const user = req.session.userData;
  
        const passwordHash = await securePassword(user.password);
  
        
        const newUser = new User({
          name: user.name,
          email: user.email,
          phone: user.phone,
          password: passwordHash,
          referralCode: user.referralCode, 
        });
  
       
        await newUser.save();
  
        if (req.session.referrer) {
          const referrer = await User.findOne({ referralCode: req.session.referrer.referralCode });
        
          if (referrer) {
           
            referrer.wallet += 150; 
            await referrer.save();
  
            console.log("Saving wallet transaction for referrer...");
          
            await createWalletTransaction(referrer._id, 150, "Credit", "Referral Bonus");
  
            console.log("Referrer rewarded with 150 rupees.");
        
           
            newUser.wallet += 50; 
            await newUser.save();
  
            console.log("Saving wallet transaction for new user...");
            
            await createWalletTransaction(newUser._id, 50, "Credit", "Referral Bonus");
  
            console.log("New user rewarded with 50 rupees.");
  
           
            referrer.redeemedUsers.push({
              userName: newUser.name,
              signupDate: newUser.createdOn,
              reward: 50,
            });
            await referrer.save();
  
            console.log("Referrer's redeemedUsers array updated.");
          }
        }
        
      
        req.session.user = {
          _id: newUser._id,
          name: newUser.name,
          email: newUser.email,
        };
  
        
        console.log("User saved and logged in:", req.session.user);
        return res.json({ success: true, redirectUrl: "/" });
      } else {
        res.status(400).json({ success: false, message: "Invalid OTP" });
      }
    } catch (error) {
      console.error("Error verifying OTP:", error);
      res.status(500).json({ success: false, message: "An error occurred" });
    }
  };

  const resendOtp = async (req, res) => {
    try {
      const { userData, lastResendTime } = req.session;
  
      if (!userData || !userData.email) {
        return res.status(400).json({ success: false, message: "Email not found in session." });
      }
  
      const currentTime = Date.now();
      if (lastResendTime && currentTime - lastResendTime < 30000) {
        return res.status(429).json({ success: false, message: "Please wait before requesting another OTP." });
      }
  
      const { email } = userData;
  
      // Generate new OTP
      const otp = generateOtp();
      req.session.userOtp = otp;
      req.session.lastResendTime = currentTime;
  
      // Send verification email
      const emailSent = await sendVerificationEmail(email, otp);
      if (emailSent) {
        console.log("Resend OTP:", otp);
        return res.status(200).json({ success: true, message: "OTP resent successfully." });
      } else {
        return res.status(500).json({ success: false, message: "Failed to resend OTP. Please try again." });
      }
    } catch (error) {
      console.error("Error resending OTP:", error);
      res.status(500).json({ success: false, message: "Internal Server Error. Please try again later." });
    }
  };


const loadLogin = async(req,res)=>{
    try{
      if(!req.session.user){
        return res.render('user/login')
      }else{
        res.redirect("/");
      }
        
    }catch(error){
      console.log("home page not loading :",error);
      res.redirect("/pageNotFound")
    }

}
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    

    const findUser = await User.findOne({ isAdmin:false,email: email });
    if (findUser.isBlocked) {
      return res.redirect("/blocked");
  }
  

    if (!findUser) {
      return res.render("user/login", { message: "User not found" });
    }
    if (findUser.IsBlocked) {
      return res.render("user/login", { message: "User is blocked by Admin" });
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password);
    

    if (!passwordMatch) {
      return res.render("user/login", { message: "Incorrect password" });
    }

    req.session.user = findUser._id;
    res.redirect("/");
  } catch (error) {
    console.error("Login error:", error);
    res.render("user/login", { message: "Login failed. Please try again later" });
  }
};

const logout = async(req,res)=>{
  try {
    
    req.session.destroy((err)=>{
      if(err){
        console.log("Session destructuring error",err.message);
        return res.redirect("/pageNotFound");
      }
      return res.redirect("/login")
    })
  } catch (error) {
    console.log("logout error ",err.message);
    res.redirect("/pageNotFound")
  }
}

const blocked=async (req, res) => {
  res.render("user/blocked"); 
};


const loadShoppingPage = async (req, res) => {
  try {
   
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10; 
    const skip = (page - 1) * limit;

    
    const user = req.session.user || null;
    const userData = user ? await User.findOne({ _id: user }) : null;

   
    const categories = await Category.find({ isListed: true });

   
    if (categories.length === 0) {
      return res.render("user/shop", {
        user: userData,
        products: [],
        categories: [],
        totalProducts: 0,
        currentPage: page,
        totalPages: 0,
      });
    }

   
    const categoryIds = categories.map((category) => category._id.toString());

    
    const products = await Product.find({
      isBlocked: false,
      category: { $in: categoryIds },
      quantity: { $gt: 0 }, 
    })
      .sort({ name: 1 })
      .skip(skip)
      .limit(limit);

   
    const totalProducts = await Product.countDocuments({
      isBlocked: false,
      category: { $in: categoryIds },
      quantity: { $gt: 0 },
    });


    const totalPages = Math.ceil(totalProducts / limit);

   
    res.render("user/shop", {
      user: userData,
      products,
      categories,
      totalProducts,
      currentPage: page,
      totalPages,
    });
  } catch (error) {
    console.error("Error loading shopping page:", error);
    res.status(500).send("Internal Server Error");
  }
};



module.exports = {
    loadHomepage,
    pageNotFound,
    loadSignUp,
    verifyOtp,
    resendOtp,
    securePassword,
    loadLogin,
    signup,
    login,
    logout,
    blocked,
    loadShoppingPage
    
}