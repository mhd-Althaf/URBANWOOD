const User = require("../../models/userSchema");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const env = require("dotenv").config();
const session = require("express-session");
const { response } = require("express");
const Address = require("../../models/addressSchema")


function generateOtp() {
    const digits = "1234567890";
    let otp = "";
    for (let i = 0; i < 6; i++) {
        otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
}

const sendVerificationEmail = async (email, otp) => {
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD,
            },
        });

        const mailOptions = {
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Your OTP for Password Reset",
            text: `Your OTP is ${otp}`,
            html: `<b><h4>Your OTP: ${otp}</h4></b>`,
        };

        const info = await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error("Error sending email", error);
        return false;
    }
};

const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        return passwordHash;
    } catch (error) {
        console.error("Error hashing password:", error);
    }
};

const getForgotPassPage = async (req, res) => {
    try {
        res.render("user/forgot-password"); // Correct path relative to the views folder
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const forgotEmailValid = async (req, res) => {
    try {
        const { email } = req.body;
        const findUser = await User.findOne({ email });
        if (findUser) {
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email, otp);
            if (emailSent) {
                req.session.userOtp = otp;
                req.session.email = email;
                res.render("user/forgotpass-otp");
                console.log("OTP", otp);

            } else {
                res.json({ success: false, message: "Failed to send OTP. Please try again." });
            }
        } else {
            res.render("forgot-password", {
                message: "User with this email does not exist",
            });
        }
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const verifyForgotPassOtp = async (req, res) => {
    try {
        const enteredOtp = req.body.otp;
        if (enteredOtp === req.session.userOtp) {
            res.json({ success: true, redirectUrl: "/reset-password" });
        } else {
            res.json({ success: false, message: "OTP not matching" });
        }
    } catch (error) {
        console.error("Error in OTP verification:", error);
        res.status(500).json({ success: false, message: "An error occurred. Please try again later" });
    }
};

const getResetPassPage = async (req, res) => {
    try {
        res.render("user/reset-password", { message: null }); // Pass a default value
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const resendOtp = async (req, res) => {
    try {
        const otp = generateOtp();
        req.session.userOtp = otp;
        const email = req.session.email;
        console.log("Resending OTP to email:", email);

        const emailSent = await sendVerificationEmail(email, otp);
        if (emailSent) {
            console.log("Resend OTP:", otp);
            res.status(200).json({ success: true, message: "Resend OTP successful" });
        } else {
            return res.status(500).json({ success: false, message: "Failed to send OTP email." });
        }
    } catch (error) {
        console.error("Error in resendOtp:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const postNewPassword = async (req, res) => {
    try {
        const { newPass1, newPass2 } = req.body;
        const email = req.session.email;

        // Ensure session is valid before proceeding with password reset
        if (!email || !req.session.userOtp) {
            return res.render("user/reset-password", {
                message: "Session expired. Please request a new OTP."
            });
        }

        if (newPass1 === newPass2) {
            const passwordHash = await securePassword(newPass1);
            const userExists = await User.findOne({ email });

            if (!userExists) {
                return res.render("user/reset-password", {
                    message: "User not found."
                });
            }

            const updateResult = await User.updateOne(
                { email },
                { $set: { password: passwordHash } }
            );

            if (updateResult.modifiedCount === 0) {
                return res.render("user/reset-password", {
                    message: "Password update failed."
                });
            }

            req.session.touch();  

            
            req.session.destroy();  

            
            res.render("user/login", {
                message: "Your password has been successfully updated. Please log in with your new password."
            });
        } else {
            return res.render("user/reset-password", {
                message: "Passwords do not match."
            });
        }
    } catch (error) {
        console.error("Error updating password:", error);
        return res.redirect("/pageNotFound");
    }
};



const userProfile = async (req, res) => {
    try {
        const userId = req.session.user;
        console.log("Session User:", req.session.user);
        if (!userId) {
            return res.redirect("/login");
        }
        const addressData = await Address.findOne({ userId: userId });
        const userData = await User.findById(userId);
        console.log("User Data:", userData);
        console.log("Address Data:", addressData);
        if (!userData) {
            return res.redirect("/pageNotFound");
        }

        res.render("user/profile", { user: userData, userAddress: addressData }); 
    } catch (error) {
        console.error("Error retrieving profile data:", error);
        res.redirect("/pageNotFound");
    }
};

const changeEmail = async (req, res) => {
    try {
        res.render("user/change-email");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const changeEmailValid = async (req, res) => {
    try {
        const { email } = req.body;
        const userExists = await User.findOne({ email });
        if (userExists) {
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email, otp);
            if (emailSent) {
                req.session.userOtp = otp;
                req.session.userData = req.body;
                req.session.email = email;
                res.render("user/change-email-otp");
                console.log("Email Sent:", email);
                console.log("OTP:", otp);
            } else {
                res.json("email-error");
            }
        } else {
            res.render("user/change-email", { message: "User with this email not exist" });
        }
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const verifyEmailOtp = async (req, res) => {
    try {
        const enteredOtp = req.body.otp;
        if (enteredOtp === req.session.userOtp) {
            req.session.userData = req.body.userData;
            res.render("user/new-email", {
                userData: req.session.userData,
            });
        } else {
            res.render("user/change-email-otp", {
                message: "OTP not matching",
                userData: req.session.userData
            });
        }
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const updateEmail = async (req, res) => {
    try {
        const newEmail = req.body.newEmail;
        const userId = req.session.user;
        await User.findByIdAndUpdate(userId,{email:newEmail});
        
        res.redirect("/userProfile")

        // const updatedUser = await User.findByIdAndUpdate(
        //     userId,
        //     { email: newEmail },
        // );

        // if (!updatedUser) {
        //     return res.redirect("/pageNotFound");
        // }

        // req.session.user.email = updatedUser.email;

        // req.session.save((err) => {
        //     if (err) {
        //         console.error("Error saving session:", err);
        //         return res.redirect("/pageNotFound");
        //     }
        //     res.redirect("/userProfile");
        // });
    } catch (error) {
        console.error("Error updating email:", error);
        res.redirect("/pageNotFound");
    }
};

const changePassword = async (req, res) => {
    try {
        if (!req.session.userOtp || !req.session.email) {
            return res.redirect("/forgot-password"); 
        }

        res.redirect("/forgot-password");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const changePasswordValid = async (req, res) => {
    try {
        const { email } = req.body;
        const userExists = await User.findOne({ email });

        if (userExists) {
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email, otp);

            if (emailSent) {
                req.session.userOtp = otp;
                req.session.userData = req.body;

                req.session.touch();

                console.log("Request Body:", req.body);
                res.render("user/change-password-otp"); 
                console.log("OTP:", otp);
            } else {
                res.render("user/change-password", {
                    message: "Failed to send OTP. Please try again later."
                });
            }
        } else {
            res.render("user/change-password", {
                message: "User with this email does not exist."
            });
        }
    } catch (error) {
        console.error("Error in changePasswordValid:", error);
        res.redirect("/pageNotFound");
    }
};

const verifyChangePassOtp = async (req, res) => {
    try {
        const enteredOtp = req.body.otp;

        if (!req.session.userOtp) {
            return res.json({
                success: false,
                message: "Session expired. Please request a new OTP."
            });
        }


        if (enteredOtp === req.session.userOtp) {
            res.json({ success: true, redirectUrl: "/reset-password" });
        } else {
            res.json({ success: false, message: "OTP not matching" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "An error occurred. Please try again later" });
    }
};
const addaddress = async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            console.log("User not found in session");
            return res.redirect("/pageNotFound");
        }
        res.render("user/add-address", { user: user });
    } catch (error) {
        console.error("Error rendering add address page:", error);
        res.redirect("/pageNotFound");
    }
};

const postAddAddress = async (req, res) => {
    try {
        const userId = req.session.user; 
        if (!userId) {
            console.log("User ID not found in session");
            return res.redirect("/pageNotFound");
        }

        const userData = await User.findById(userId); 
        if (!userData) {
            console.log("User not found in database with ID:", userId);
            return res.redirect("/pageNotFound");
        }

        const { addressType, name, city, landMark, state, pincode, phone, altPhone } = req.body;

        
        console.log("Received address data:", req.body);

        const userAddress = await Address.findOne({ userId: userData._id });
        if (!userAddress) {
            const newAddress = new Address({
                userId: userData._id,
                address: [{ addressType, name, city, landMark, state, pincode, phone, altPhone }]
            });
            await newAddress.save();
            console.log("New address added for user:", userData._id);
        } else {
            userAddress.address.push({ addressType, name, city, landMark, state, pincode, phone, altPhone });
            await userAddress.save();
            console.log("Address added to existing address list for user:", userData._id);
        }

        res.redirect("/userProfile");
    } catch (error) {
        console.error("Error adding address:", error);
        res.redirect("/pageNotFound");
    }
};

const editAddress = async (req, res) => {
    try {
        const addressId = req.query.id;
        const user = req.session.user;
        const currAddress = await Address.findOne({
            "address._id": addressId,
        });

        if (!currAddress) {
            return res.redirect("/pageNotFound");
        }

        const addressData = currAddress.address.find((item) => {
            return item._id.toString() === addressId.toString();
        });

        if (!addressData) {
            return res.redirect("/pageNotFound");
        }

        res.render("user/edit-address", { address: addressData, user: user });
    } catch (error) {
        console.error("Error in edit address", error);
        res.redirect("/pageNotFound");
    }
};

const postEditAddress = async (req, res) => {
    try {
        const data = req.body;
        const addressId = req.query.id;
        const user = req.session.user;

        const findAddress = await Address.findOne({
            "address._id": addressId
        });

        if (!findAddress) {
            return res.redirect("/pageNotFound"); 
        }

        await Address.updateOne(
            {
                "address._id": addressId 
            },
            {
                $set: {
                    "address.$": { 
                        _id: addressId,
                        addressType: data.addressType,
                        name: data.name,
                        city: data.city,
                        landMark: data.landMark,
                        state: data.state, 
                        pincode: data.pincode,
                        phone: data.phone,
                        altPhone: data.altPhone
                    }
                }
            }
        );

        res.redirect("/userProfile"); 
    } catch (error) {
        console.error("Error in edit address:", error);
        res.redirect("/pageNotFound"); 
    }
};
const deleteAddress = async (req, res) => {
    try {
        const { addressId } = req.query;

        console.log("Address ID being passed:", addressId);

        if (!addressId) {
            return res.status(400).json({ error: "Address ID is required" });
        }

        const address = await Address.findOneAndUpdate(
            { "address._id": addressId },
            { $pull: { address: { _id: addressId } } }, 
            { new: true } 
        );

        console.log("Updated Address Document:", address);

        if (!address) {
            return res.status(404).json({ error: "Address not found" });
        }

        res.redirect("/userProfile");
    } catch (error) {
        console.error("Error in delete address", error);
        res.redirect("/pageNotFound"); 
    }
};



module.exports = {
    getForgotPassPage,
    forgotEmailValid,
    verifyForgotPassOtp,
    getResetPassPage,
    resendOtp,
    postNewPassword,
    userProfile,
    changeEmail,
    changeEmailValid,
    verifyEmailOtp,
    updateEmail,
    changePassword,
    changePasswordValid,
    verifyChangePassOtp,
    addaddress,
    postAddAddress,
    editAddress,
    postEditAddress,
    deleteAddress
};