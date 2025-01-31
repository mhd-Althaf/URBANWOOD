const User = require("../../models/userSchema");
const category = require("../../models/categorySchema");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");


const loadLogin = (req, res) => {
    // if (req.session.admin) {
    //     return res.redirect("/admin/dashboard");
    // }
    res.render("admin/login", { message: null });
};

const login = async (req, res) => {

    try {
        const {email,password} = req.body;
        const admin = await User.findOne({email,isAdmin:true});
        if(admin){

            const passwordMatch = bcrypt.compare(password,admin.password)
            if(passwordMatch){
                req.session.admin = true;
                return res.redirect("/admin")
            }else{
                return res.redirect("/login")
            }
        }else{
            return res.redirect("/login")
        }
    } catch (error) {
        console.log("Login error",error);
        return res.redirect("/pageError")
    }
}


const loadDashboard = async (req,res)=>{
  
    res.render("admin/dashboard");
}


const loadProductGet = async (req,res) =>{
    res.render("admin/product")
}

const loadcatogoryget = async (req,res)=>{
    
    res.render("admin/catogory")
}


const loadAddProducts = async (req,res)=>{
    res.render("admin/addProducts")
}

const logoutUser = async (req,res)=>{
    req.session.destroy();
    res.redirect("/admin/login")
}

const loadCategoryform = async (req,res)=>{
    res.render("admin/categoryForm")
}

const loadproductform = async (req,res)=>{
    res.render("admin/productForm")
}



module.exports = {
 
    loadcatogoryget,
    loadproductform,
    loadCategoryform,
    loadLogin,
    login,
    loadDashboard, 
    loadProductGet,
    loadAddProducts, 
    logoutUser,

}