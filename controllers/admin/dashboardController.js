const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');

const getDashboard = async (req, res) => {
    try {
        // Get total counts
        const totalOrders = await Order.countDocuments();
        const totalProducts = await Product.countDocuments();
        const totalCustomers = await User.countDocuments({ role: 'user' });

        // Get total sales
        const salesData = await Order.aggregate([
            { $match: { status: 'Delivered' } },
            { $group: { _id: null, total: { $sum: '$finalAmount' } } }
        ]);
        const totalSales = salesData.length > 0 ? salesData[0].total : 0;

        // Get top 10 products by sales
        const topProducts = await Order.aggregate([
            { $unwind: '$orderItems' },
            { $group: {
                _id: '$orderItems.productId',
                totalQuantity: { $sum: '$orderItems.quantity' },
                totalRevenue: { $sum: { $multiply: ['$orderItems.price', '$orderItems.quantity'] } }
            }},
            { $sort: { totalRevenue: -1 } },
            { $limit: 10 },
            { $lookup: {
                from: 'products',
                localField: '_id',
                foreignField: '_id',
                as: 'product'
            }},
            { $unwind: '$product' },
            { $project: {
                name: '$product.productName',
                quantity: '$totalQuantity',
                revenue: '$totalRevenue'
            }}
        ]);

        // Get top 10 categories by sales
        const topCategories = await Order.aggregate([
            { $unwind: '$orderItems' },
            { $lookup: {
                from: 'products',
                localField: 'orderItems.productId',
                foreignField: '_id',
                as: 'product'
            }},
            { $unwind: '$product' },
            { $group: {
                _id: '$product.category',
                totalQuantity: { $sum: '$orderItems.quantity' },
                totalRevenue: { $sum: { $multiply: ['$orderItems.price', '$orderItems.quantity'] } }
            }},
            { $sort: { totalRevenue: -1 } },
            { $limit: 10 },
            { $lookup: {
                from: 'categories',
                localField: '_id',
                foreignField: '_id',
                as: 'category'
            }},
            { $unwind: '$category' },
            { $project: {
                name: '$category.name',
                quantity: '$totalQuantity',
                revenue: '$totalRevenue'
            }}
        ]);

        // Mock brands data since we don't have a brand field
        const topBrands = [
            { name: 'Brand 1', productCount: 15, salesCount: 120, revenue: 25000 },
            { name: 'Brand 2', productCount: 12, salesCount: 100, revenue: 22000 },
            { name: 'Brand 3', productCount: 10, salesCount: 90, revenue: 20000 },
            { name: 'Brand 4', productCount: 8, salesCount: 80, revenue: 18000 },
            { name: 'Brand 5', productCount: 7, salesCount: 70, revenue: 16000 },
            { name: 'Brand 6', productCount: 6, salesCount: 60, revenue: 14000 },
            { name: 'Brand 7', productCount: 5, salesCount: 50, revenue: 12000 },
            { name: 'Brand 8', productCount: 4, salesCount: 40, revenue: 10000 },
            { name: 'Brand 9', productCount: 3, salesCount: 30, revenue: 8000 },
            { name: 'Brand 10', productCount: 2, salesCount: 20, revenue: 6000 }
        ];

        // Get sales data for charts (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const salesChartData = await Order.aggregate([
            { $match: { 
                createdAt: { $gte: thirtyDaysAgo },
                status: 'Delivered'
            }},
            { $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                total: { $sum: '$finalAmount' }
            }},
            { $sort: { _id: 1 } }
        ]);

        // Format chart data
        const chartData = {
            labels: salesChartData.map(item => item._id),
            sales: salesChartData.map(item => item.total),
            distributionLabels: ['Products', 'Categories', 'Brands', 'Other'],
            distributionData: [40, 30, 20, 10]
        };

        // Get recent orders for ledger
        const recentOrders = await Order.find()
            .populate('userId', 'name')
            .populate('orderItems.productId', 'productName')
            .sort({ createdAt: -1 })
            .limit(100);

        res.render('admin/dashboard', {
            totalOrders,
            totalSales,
            totalCustomers,
            totalProducts,
            topProducts,
            topCategories,
            topBrands,
            chartData,
            orders: recentOrders
        });
    } catch (error) {
        console.error('Dashboard Error:', error);
        res.status(500).render('error', { message: 'Error loading dashboard' });
    }
};

const getFilteredData = async (req, res) => {
    try {
        const filter = req.query.filter;
        let startDate = new Date();
        let groupBy = '%Y-%m-%d';

        switch(filter) {
            case 'weekly':
                startDate.setDate(startDate.getDate() - 7);
                groupBy = '%Y-%m-%d';
                break;
            case 'monthly':
                startDate.setMonth(startDate.getMonth() - 1);
                groupBy = '%Y-%m-%d';
                break;
            case 'yearly':
                startDate.setFullYear(startDate.getFullYear() - 1);
                groupBy = '%Y-%m';
                break;
            default: // daily
                startDate.setDate(startDate.getDate() - 30);
                groupBy = '%Y-%m-%d';
        }

        const salesData = await Order.aggregate([
            { $match: { 
                createdAt: { $gte: startDate },
                status: 'Delivered'
            }},
            { $group: {
                _id: { $dateToString: { format: groupBy, date: '$createdAt' } },
                total: { $sum: '$finalAmount' }
            }},
            { $sort: { _id: 1 } }
        ]);

        res.json({
            labels: salesData.map(item => item._id),
            sales: salesData.map(item => item.total)
        });
    } catch (error) {
        console.error('Filtered Data Error:', error);
        res.status(500).json({ error: 'Error fetching filtered data' });
    }
};

module.exports = {
    getDashboard,
    getFilteredData
}; 