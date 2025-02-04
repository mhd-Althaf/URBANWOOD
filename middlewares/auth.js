const User=require("../models/userSchema");


const userAuth = async (req, res, next) => {
    if (req.session.user) {
        try {
           
            const user = await User.findById(req.session.user._id);

           
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


const adminAuth=(req,res,next)=>{
    User.findOne({isAdmin:true})
        .then(data=>{
            if(data ){
                next()
            }else{
                res.send('you are blocked')
            }
        })
        .catch(error=>{
            console.log("error in user adminauth middleware");
            res.status(500).send("internal server error")
            
        })
    }

module.exports={
    userAuth,
    adminAuth

}