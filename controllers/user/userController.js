
const User = require("../../models/userSchema");
const nodemailer = require("nodemailer");
const env = require("dotenv").config();
const bcrypt = require("bcrypt")


const loadHomepage = async (req, res) => {
  try {
      const user = req.session.user;


      if (user) {
          const userData = await User.findOne({ _id: user });
          console.log(userData);
          
     
          res.render("home", { user: userData });
      } else {
          return res.render("home",{user:''});
      }
  } catch (error) {
      console.log("Error loading homepage:", error.message); // Debugging error
      res.status(500).send("Server error");
  }
};


const pageNotFound = async (req,res) => {
    try{
        res.render("page-404")
    }catch(error){
        res.redirect("/pageNotFound")
    }
}


const loadSignUp = async (req, res) => {
  try {
    
    return res.render("signup", { message:null});
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
    // console.log(req.body);

    if (password !== cPassword) {
      return res.render("signup", { message: "Passwords do not match" });
    }
      // Check if this gets logged
    const findUser = await User.findOne({ email });

    if (findUser) {
      console.log('alrddd');
      
      return res.render("signup", { message: "User with this email already exists" });
    }

    const otp = generateOtp();
    console.log("Generated OTP:", otp);
     
    const emailSend = sendVerificationEmail(email, otp);
    if (!emailSend) {
      return res.json("email-error");
    }

    req.session.userOtp = otp;
    req.session.userData = { name, phone, email, password };

    res.render("verify-otp");
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
  
      // Check if session data is valid
      if (!req.session.userOtp || !req.session.userData) {
        return res.status(400).json({ success: false, message: "Session expired. Please try again." });
      }
  
      // Check if OTP has expired
      if (Date.now() > req.session.otpExpiration) {
        return res.send({ success: false, message: "OTP has expired. Please request a new one." });
      }
  
      // Verify OTP
      if (otp.trim() === req.session.userOtp) {
        const user = req.session.userData;
  
        // Hash the password before saving
        const passwordHash = await securePassword(user.password);
  
        // Create a new user
        const newUser = new User({
          name: user.name,
          email: user.email,
          phone: user.phone,
          password: passwordHash,
          referralCode: user.referralCode, // Store the referral code for the new user
        });
  
        // Save the new user
        await newUser.save();
  
        if (req.session.referrer) {
          const referrer = await User.findOne({ referralCode: req.session.referrer.referralCode });
        
          if (referrer) {
            // Referrer gets 150 rupees
            referrer.wallet += 150; // Add reward to the referrer's wallet
            await referrer.save();
  
            console.log("Saving wallet transaction for referrer...");
            // Create wallet transaction for the referrer
            await createWalletTransaction(referrer._id, 150, "Credit", "Referral Bonus");
  
            console.log("Referrer rewarded with 150 rupees.");
        
            // New user gets 50 rupees
            newUser.wallet += 50; // Add reward to the new user's wallet
            await newUser.save();
  
            console.log("Saving wallet transaction for new user...");
            // Create wallet transaction for the new user
            await createWalletTransaction(newUser._id, 50, "Credit", "Referral Bonus");
  
            console.log("New user rewarded with 50 rupees.");
  
            // Update referrer's redeemedUsers array with the new user details
            referrer.redeemedUsers.push({
              userName: newUser.name,
              signupDate: newUser.createdOn,
              reward: 50, // New user’s reward
            });
            await referrer.save();
  
            console.log("Referrer's redeemedUsers array updated.");
          }
        }
        
        // Set session data for the new user
        req.session.user = {
          _id: newUser._id,
          name: newUser.name,
          email: newUser.email,
        };
  
        // Render the success response or redirect
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
        return res.render('login')
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
  

    if (!findUser) {
      return res.render("login", { message: "User not found" });
    }
    if (findUser.IsBlocked) {
      return res.render("login", { message: "User is blocked by Admin" });
    }

    const passwordMatch = await bcrypt.compare(password, findUser.password);
    

    if (!passwordMatch) {
      return res.render("login", { message: "Incorrect password" });
    }

    req.session.user = findUser._id;
    res.redirect("/");
  } catch (error) {
    console.error("Login error:", error);
    res.render("login", { message: "Login failed. Please try again later" });
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
}