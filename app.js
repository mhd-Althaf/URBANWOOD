const express = require("express");
const app = express();
const path = require("path");
const env = require("dotenv").config();
const db = require("./config/db");
const session = require("express-session");
const passport = require("./config/passport");
const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter")

db();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || "default_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Use true only if HTTPS
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000 // 72 hours
    }
}));

// Debugging session middleware
app.use((req, res, next) => {
    // console.log("Session Data:", req.session); // Check if session data exists
    next();
});


app.use(passport.initialize());
app.use(passport.session());
console.log(process.env.GOOGLE_CLIENT_ID); 
console.log(process.env.GOOGLE_CLIENT_SECRET); 

app.use((req, res, next) => {
    res.set('cache-control', 'no-store');
    next();
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, "public")));

app.use("/", userRouter);
app.use("/admin",adminRouter)




app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});

module.exports = app;