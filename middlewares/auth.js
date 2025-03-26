const User=require("../models/userSchema");


const userAuth = async (req, res, next) => {
    console.log('userAuth middleware called');
    console.log('Session:', req.session);
    console.log('User ID from session:', req.session.user);
    
    if (req.session.user) {
        try {
            const user = await User.findById(req.session.user);
            console.log('Found user:', user);

            if (user && !user.isBlocked) {
                req.user = user; 
                return next(); 
            } else {
                console.log('User not found or blocked');
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
        console.log("No user in session, redirecting to home page");
        return res.redirect("/");
    }
};


const adminAuth = (req, res, next) => {
    try {
        if (!req.session.admin) {
            return res.redirect("/admin/login"); 
        }
        
        next();
    } catch (error) {
        console.error("Error in adminAuth middleware:", error);
        res.status(500).send("Internal Server Error");
    }
};



module.exports={
    userAuth,
    adminAuth

}

