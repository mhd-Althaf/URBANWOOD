const User=require("../models/userSchema");


const userAuth = async (req, res, next) => {
    console.log(req.session.user);
    
    if (req.session.user) {
        try {
           
            const user = await User.findById(req.session.user);
console.log(user);

           
            if (user && !user.isBlocked) {
                req.user = user; 
                return next(); 
            } else {
                
                req.session.destroy((err) => {
                    if (err) {
                        console.error("Error destroying session:", err);
                    }
                    return res.redirect("/login"); 
                });
            }
        } catch (error) {
            console.error("Error in user auth middleware:", error);
            return res.status(500).send("Internal server error");
        }
    } else {
        console.log("Guest user accessing shop.");
        req.user = null; 
        return next();
    }
};


const adminAuth = (req, res, next) => {
    try {
        if (!req.session.admin) {
            return res.redirect("/admin/login"); // Redirect if not logged in
        }

        next(); // Proceed if admin session exists
    } catch (error) {
        console.error("Error in adminAuth middleware:", error);
        res.status(500).send("Internal Server Error");
    }
};



module.exports={
    userAuth,
    adminAuth

}