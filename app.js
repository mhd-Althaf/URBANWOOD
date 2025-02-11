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
        secure: false, 
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000 
    }
}));

// Debugging session middleware
app.use((req, res, next) => {
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

// Add this after all routes
app.use((err, req, res, next) => {
    console.error('Global Error Handler:', err);
    res.status(500).json({
        status: false,
        message: 'Internal server error'
    });
});


const PORT =  3004

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


module.exports = app;