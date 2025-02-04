const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
     destination:(req,files,cb)=>{
        cb(null,path.join(__dirname,"../public/uploads/re-image"));
     },
     filename:(req,res,cb)=>{
        cb(null,Date.now()+"_"+File.originalname);
     }
})

module.exports = storage;