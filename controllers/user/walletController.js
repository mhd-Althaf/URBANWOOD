const User = require("../../models/userSchema")
const Product = require("../../models/productSchema")
const razorpay = require("razorpay");
const crypto = require("crypto");

const instance = new razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const getWalletPage = async (req, res) => {
  try {
      const user = await User.findById(req.session.user).select("-password");
      if (!user) {
          return res.redirect("/login");
      }

      if (!user.wallet) user.wallet = 0;
      if (!user.history) user.history = [];

      res.render("user/wallet", { 
          user,
          walletBalance: user.wallet,
          transactions: user.history 
      });
  } catch (error) {
      console.error("Error loading wallet page:", error);
      res.redirect("/pageNotFound");
  }
};
const addMoneyToWallet = async (req, res) => {
    try {
        if (!req.body.total) {
            return res.status(400).json({ error: "Amount is required" });
        }

        const amount = parseInt(req.body.total) * 100;
        const options = {
            amount,
            currency: "INR",
            receipt: `wallet_${req.session.user}_${Date.now()}`
        };

        instance.orders.create(options, async (err, order) => {
            if (err) {
                console.error("Error creating order:", err);
                return res.status(500).json({ error: "Payment initiation failed" });
            }

            res.json({ 
                order, 
                razorpay: true,
                key: process.env.RAZORPAY_KEY_ID,
                userName: req.session.user?.name,
                userEmail: req.session.user?.email,
                userContact: req.session.user?.phone
            });
        });
    } catch (error) {
        console.error("Error in addMoneyToWallet:", error);
        res.redirect("/pageNotFound");
    }
};

const verify_payment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order } = req.body;

    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    // Update user's wallet balance
    const amount = order.amount / 100; // Convert back from paise to INR
    await User.updateOne(
      { _id: req.session.user },
      {
        $inc: { wallet: amount },
        $push: {
          history: {
            amount,
            status: "Credit",
            date: new Date()
          }
        }
      }
    );

    res.json({ success: true, message: "Payment verified and wallet updated" });
  } catch (error) {
    console.error("Error in verify_payment:", error);
    res.redirect("/pageNotFound");
  }
};


module.exports = {
  getWalletPage,
  addMoneyToWallet,
  verify_payment,

}

