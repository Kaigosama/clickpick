const router = require('express').Router();
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const User = require('../models/User'); // Import User to get their phone number
const { sendStatusSMS } = require('../utils/smsService'); // Import the SMS utility

// Function to calculate estimated preparation time
const calculateEstimatedTime = async (items, queuePosition) => {
  // Base time per item: 3 minutes
  const baseTimePerItem = 3;
  
  // Calculate total items in the order
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  
  // Base preparation time based on items
  let prepTime = totalItems * baseTimePerItem;
  
  // Get current workload (active orders)
  const activeOrders = await Order.countDocuments({
    status: { $in: ['pending', 'preparing'] }
  });
  
  // Add queue delay: 2 minutes per order ahead in queue
  const queueDelay = Math.max(0, activeOrders) * 2;
  
  // Add buffer time based on complexity (more items = more complexity)
  const complexityBuffer = totalItems > 5 ? 5 : totalItems > 3 ? 3 : 0;
  
  // Total estimated time
  const totalTime = prepTime + queueDelay + complexityBuffer;
  
  // Return estimated time (minimum 5 minutes, maximum 60 minutes)
  return Math.max(5, Math.min(60, Math.round(totalTime)));
};

// 1. GET ALL ORDERS (For Kitchen Staff)
router.get('/', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }); // Newest first
    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 2. GET MY ORDERS (For Customers)
router.get('/:userId', async (req, res) => {
  try {
    const orders = await Order.find({ customerId: req.params.userId }).sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 3. PLACE NEW ORDER (Customer)
router.post('/', async (req, res) => {
  try {
    const count = await Order.countDocuments();
    const queueNumber = count + 1;
    
    // Calculate estimated preparation time
    const estimatedTime = await calculateEstimatedTime(req.body.items, queueNumber);

    const newOrder = new Order({
      customerId: req.body.customerId,
      items: req.body.items,
      totalAmount: req.body.totalAmount,
      paymentMethod: req.body.paymentMethod,
      queueNumber: queueNumber,
      estimatedTime: estimatedTime,
      status: 'pending' // Force the status to be 'pending' here
    });

    const savedOrder = await newOrder.save();
    
    // Deduct quantities from menu items
    for (const item of req.body.items) {
      await MenuItem.findByIdAndUpdate(
        item.menuItemId,
        {
          $inc: { quantity: -item.quantity },
          $set: { isAvailable: true } // Will be set to false below if quantity becomes 0
        }
      );
      
      // Check if quantity is now 0 and update isAvailable
      const updatedItem = await MenuItem.findById(item.menuItemId);
      if (updatedItem.quantity <= 0) {
        updatedItem.isAvailable = false;
        await updatedItem.save();
      }
    }
    
    const customer = await User.findById(savedOrder.customerId);
    if (customer?.phone) {
      await sendStatusSMS(customer.phone, savedOrder.queueNumber, 'pending');
    }
    res.status(201).json(savedOrder);
  } catch (err) {
    res.status(500).json(err);
  }
});

// 4. UPDATE ORDER STATUS (Staff)
router.put('/:id', async (req, res) => {
  try {
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { returnDocument: 'after' }
    ).populate('customerId'); // Crucial: This gets the user's phone number

    if (req.body.status) {
      const phone = updatedOrder.customerId?.phone;
      const queueNo = updatedOrder.queueNumber;

      if (phone) {
        await sendStatusSMS(phone, queueNo, req.body.status);
      } else {
        console.log("⚠️ SMS skipped: Customer has no phone number saved.");
      }
    }

    res.status(200).json(updatedOrder);
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;

// 5. GENERATE DAILY SALES REPORT (Staff/Owner)
router.get('/report/daily', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find all 'completed' orders from today
    const orders = await Order.find({
      status: 'completed',
      createdAt: { $gte: today }
    });

    const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    
    // Breakdown of items sold
    const itemBreakdown = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        itemBreakdown[item.name] = (itemBreakdown[item.name] || 0) + item.quantity;
      });
    });

    res.status(200).json({
      date: today.toDateString(),
      totalOrders: orders.length,
      totalRevenue: totalRevenue,
      itemsSold: itemBreakdown
    });
  } catch (err) {
    res.status(500).json(err);
  }
});