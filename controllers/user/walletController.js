const User = require("../../models/userSchema")
const Product = require("../../models/productSchema")
const razorpay = require("razorpay");
const crypto = require("crypto");
const Wallet = require('../../models/walletSchema');

const instance = new razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const getWalletPage = async (req, res) => {
    try {
        console.log('getWalletPage called');
        console.log('Session data:', req.session);
        console.log('User in session:', req.session.user);
        
        const userId = req.session.user;
        if (!userId) {
            console.log('No user ID found in session, redirecting to login');
            return res.redirect('/login');
        }

        console.log('Fetching wallet for user ID:', userId);
        
        // Find user's wallet
        let wallet = await Wallet.findOne({ userId });
        console.log('Found wallet:', wallet);
        
        // If wallet doesn't exist yet, create one
        if (!wallet) {
            console.log('No wallet found, creating new wallet');
            // Check if user has legacy wallet balance
            const user = await User.findById(userId);
            console.log('User for legacy wallet:', user);
            
            if (!user) {
                console.log('User not found, redirecting to login');
                return res.redirect('/login');
            }
            
            const legacyBalance = user && typeof user.wallet === 'number' ? user.wallet : 0;
            
            wallet = new Wallet({
                userId,
                balance: legacyBalance,
                transactions: []
            });
            
            // If user has legacy transactions, migrate them
            if (user && Array.isArray(user.walletHistory) && user.walletHistory.length > 0) {
                console.log('Migrating legacy transactions');
                const migratedTransactions = user.walletHistory.map(transaction => ({
                    amount: transaction.amount,
                    type: transaction.transactionType === 'debit' ? 'debit' : 'credit',
                    description: transaction.transactionType === 'refund' 
                        ? 'Refund from return' 
                        : transaction.transactionType === 'debit' 
                            ? 'Payment' 
                            : 'Credit',
                    createdAt: transaction.timestamp || new Date()
                }));
                
                wallet.transactions.push(...migratedTransactions);
            }
            
            await wallet.save();
            console.log('New wallet saved:', wallet);
        }
        
        // Format transactions for display
        const formattedTransactions = wallet.transactions.map(transaction => ({
            createdAt: transaction.createdAt,
            description: transaction.description,
            type: transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1), // Capitalize first letter
            amount: parseFloat(transaction.amount).toFixed(2), // Ensure amount is a number with 2 decimal places
            status: 'Completed',
            orderId: transaction.orderId,
            productId: transaction.productId
        }));
        
        // Sort transactions by date (newest first)
        formattedTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        console.log('Rendering wallet page with data:', {
            walletBalance: parseFloat(wallet.balance).toFixed(2),
            transactionsCount: formattedTransactions.length
        });
        
        res.render('user/wallet', {
            walletBalance: parseFloat(wallet.balance).toFixed(2), // Ensure balance is a number with 2 decimal places
            transactions: formattedTransactions,
            user: req.session.user || {}
        });
    } catch (error) {
        console.error('Error fetching wallet details:', error);
        res.status(500).render('user/error', { 
            message: 'An error occurred while fetching wallet details. Please try again later.'
        });
    }
};

const addFunds = async (req, res) => {
    try {
        const { amount } = req.body;
        const userId = req.session.user;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Please login to add funds'
            });
        }
        
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid amount'
            });
        }
        
        let wallet = await Wallet.findOne({ userId });
        
        if (!wallet) {
            wallet = new Wallet({
                userId,
                balance: 0,
                transactions: []
            });
        }
        
        // Add the funds to wallet
        wallet.balance += parseFloat(amount);
        
        // Record the transaction
        wallet.transactions.push({
            amount: parseFloat(amount),
            type: 'credit',
            description: 'Added funds to wallet',
            createdAt: new Date()
        });
        
        await wallet.save();
        
        // Also update legacy wallet for backward compatibility
        const user = await User.findById(userId);
        if (user) {
            if (typeof user.wallet !== 'number') {
                user.wallet = 0;
            }
            user.wallet += parseFloat(amount);
            
            if (!Array.isArray(user.walletHistory)) {
                user.walletHistory = [];
            }
            
            user.walletHistory.push({
                amount: parseFloat(amount),
                transactionType: 'credit',
                timestamp: new Date()
            });
            
            await user.save();
        }
        
        res.status(200).json({
            success: true,
            message: 'Funds added successfully',
            newBalance: wallet.balance
        });
    } catch (error) {
        console.error('Error adding funds to wallet:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred while adding funds. Please try again later.'
        });
    }
};

const useWalletForPayment = async (userId, amount, orderId, description) => {
    try {
        if (!userId || !amount || amount <= 0) {
            throw new Error('Invalid user ID or amount');
        }
        
        let wallet = await Wallet.findOne({ userId });
        
        if (!wallet) {
            throw new Error('Wallet not found');
        }
        
        if (wallet.balance < amount) {
            throw new Error('Insufficient wallet balance');
        }
        
        // Deduct the amount from wallet
        wallet.balance -= amount;
        
        // Record the transaction
        wallet.transactions.push({
            amount,
            type: 'debit',
            description: description || 'Payment for order',
            orderId,
            createdAt: new Date()
        });
        
        await wallet.save();
        
        // Also update legacy wallet for backward compatibility
        const user = await User.findById(userId);
        if (user) {
            if (typeof user.wallet !== 'number') {
                user.wallet = 0;
            }
            user.wallet -= amount;
            
            if (!Array.isArray(user.walletHistory)) {
                user.walletHistory = [];
            }
            
            user.walletHistory.push({
                amount,
                transactionType: 'debit',
                timestamp: new Date()
            });
            
            await user.save();
        }
        
        return {
            success: true,
            newBalance: wallet.balance
        };
    } catch (error) {
        console.error('Error using wallet for payment:', error);
        throw error;
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
  addFunds,
  useWalletForPayment,
  addMoneyToWallet,
  verify_payment,
}

