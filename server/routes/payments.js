const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const SequenceCounter = require('../models/SequenceCounter');
const MenuItem = require('../models/MenuItem');
const User = require('../models/User');
const { sendStatusSMS } = require('../utils/smsService');

const getRequesterFromToken = async (req) => {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (!token || String(scheme || '').toLowerCase() !== 'bearer') {
    return null;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key_here');
    const user = await User.findById(payload.id).select('_id role');
    return user || null;
  } catch (err) {
    return null;
  }
};

// Function to calculate estimated preparation time
const calculateEstimatedTime = async (items, stallId) => {
  // Base time per item: 3 minutes
  const baseTimePerItem = 3;
  
  // Calculate total items in the order
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  
  // Base preparation time based on items
  let prepTime = totalItems * baseTimePerItem;
  
  // Get current workload (active orders)
  const activeOrders = await Order.countDocuments({
    status: { $in: ['pending', 'preparing'] },
    ...(stallId ? { stallId } : {})
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

const getNextSequenceValue = async (key) => {
  const counter = await SequenceCounter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return counter.seq;
};

const getNextOrderIdentifiers = async (stallId) => {
  const [orderNumber, queueNumber] = await Promise.all([
    getNextSequenceValue('order-number'),
    getNextSequenceValue(`queue-number:${String(stallId)}`)
  ]);

  return { orderNumber, queueNumber };
};

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomUUID()}`;
    cb(null, `gcash-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Upload GCash proof of payment
router.post('/gcash-upload', upload.single('file'), async (req, res) => {
  try {
    const { customerId, items, totalAmount, stallId } = req.body;

    if (!req.file || !customerId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Parse items if it's a string
    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;

    const menuItemIds = (parsedItems || [])
      .map((item) => item?.menuItemId)
      .filter(Boolean);

    if (!menuItemIds.length) {
      return res.status(400).json({ message: 'Order must include valid menu items' });
    }

    const menuItems = await MenuItem.find({ _id: { $in: menuItemIds } }).select('stallId');
    const stallIds = Array.from(
      new Set(
        menuItems
          .map((menuItem) => String(menuItem?.stallId || ''))
          .filter(Boolean)
      )
    );

    if (!stallIds.length) {
      return res.status(400).json({ message: 'Unable to resolve store for this order' });
    }

    if (stallIds.length > 1) {
      return res.status(400).json({ message: 'Please place separate orders per store' });
    }

    const [resolvedStallId] = stallIds;
    const requestedStallId = String(stallId || '').trim();
    if (requestedStallId && String(resolvedStallId) !== requestedStallId) {
      return res.status(400).json({ message: 'Uploaded items do not match the selected store' });
    }

    const effectiveStallId = requestedStallId || String(resolvedStallId);
    const store = await User.findById(resolvedStallId).select('name');
    const storeName = store?.name || 'Store';

    const { orderNumber, queueNumber } = await getNextOrderIdentifiers(effectiveStallId);
    const estimatedTime = await calculateEstimatedTime(parsedItems, effectiveStallId);

    const newOrder = new Order({
      customerId: customerId,
      items: parsedItems,
      totalAmount: totalAmount || req.body.amount || 0,
      paymentMethod: 'gcash',
      paymentStatus: 'pending', // Payment pending approval
      status: 'pending', // Order status
      stallId: effectiveStallId,
      orderNumber,
      queueNumber,
      estimatedTime
    });

    const savedOrder = await newOrder.save();
    const stableOrderId = String(savedOrder._id);

    if (savedOrder?.customerId) {
      const customer = await User.findById(savedOrder.customerId);
      if (customer?.phone) {
        await sendStatusSMS(customer.phone, savedOrder.orderNumber || savedOrder.queueNumber, 'pending', storeName);
      } else {
        console.log("⚠️ SMS skipped: Customer has no phone number saved.");
      }
    }

    // Deduct quantities from menu items
    for (const item of parsedItems) {
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

    // Create payment record
    const payment = new Payment({
      orderId: stableOrderId,
      orderDbId: savedOrder._id, // Reference to the actual Order document
      stallId: effectiveStallId,
      customerId: customerId,
      paymentMethod: 'gcash',
      amount: totalAmount || req.body.amount || 0,
      status: 'pending',
      proofOfPaymentPath: req.file.path,
      proofOfPaymentUrl: `/uploads/${req.file.filename}`
    });

    await payment.save();

    res.json({
      success: true,
      message: 'Proof of payment uploaded successfully',
      paymentId: payment._id,
      orderId: stableOrderId,
      orderDbId: savedOrder._id
    });
  } catch (err) {
    console.error('GCash upload error:', err);
    
    // Delete file if save fails
    if (req.file) {
      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) console.error('File deletion error:', unlinkErr);
      });
    }

    res.status(500).json({ 
      message: 'Upload failed: ' + err.message 
    });
  }
});

// Get GCash payment status
router.get('/gcash-status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    const payment = await Payment.findOne({ orderId: orderId })
      .populate('orderDbId', 'orderNumber queueNumber _id');

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    res.json({
      status: payment.status,
      orderId: orderId,
      orderNumber: payment.orderDbId?.orderNumber,
      queueNumber: payment.orderDbId?.queueNumber,
      approvedAt: payment.approvedAt,
      rejectionReason: payment.rejectionReason
    });
  } catch (err) {
    console.error('Get status error:', err);
    res.status(500).json({ message: 'Error fetching status: ' + err.message });
  }
});

// Approve GCash payment (Staff only)
router.post('/gcash-approve/:paymentId', async (req, res) => {
  try {
    const requester = await getRequesterFromToken(req);
    const { paymentId } = req.params;
    const { stallId } = req.body;

    const effectiveStallId = requester?.role === 'stall_staff' ? String(requester._id) : stallId;

    if (!effectiveStallId) {
      return res.status(400).json({ message: 'stallId is required' });
    }

    const existingPayment = await Payment.findById(paymentId).populate('orderDbId', 'stallId');

    if (!existingPayment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const paymentStallId = existingPayment.stallId
      ? String(existingPayment.stallId)
      : (existingPayment.orderDbId?.stallId ? String(existingPayment.orderDbId.stallId) : '');
    if (!paymentStallId || paymentStallId !== String(effectiveStallId)) {
      return res.status(403).json({ message: 'You can only approve payments for your own store' });
    }

    const payment = await Payment.findByIdAndUpdate(
      paymentId,
      {
        status: 'approved',
        approvedBy: effectiveStallId,
        approvedAt: new Date()
      },
      { new: true }
    );

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Update order payment status using the MongoDB ObjectId
    if (payment.orderDbId) {
      const updatedOrder = await Order.findByIdAndUpdate(
        payment.orderDbId,
        { paymentStatus: 'paid' },
        { returnDocument: 'after' }
      );
      if (updatedOrder?.customerId) {
        const customer = await User.findById(updatedOrder.customerId);
        if (customer?.phone) {
          const store = await User.findById(updatedOrder.stallId).select('name');
          const storeName = store?.name || 'Store';
          await sendStatusSMS(customer.phone, updatedOrder.orderNumber || updatedOrder.queueNumber, 'approved', storeName);
        }
      }
    }

    res.json({
      success: true,
      message: 'Payment approved',
      payment: payment
    });
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ message: 'Error approving payment: ' + err.message });
  }
});

// Reject GCash payment (Staff only)
router.post('/gcash-reject/:paymentId', async (req, res) => {
  try {
    const requester = await getRequesterFromToken(req);
    const { paymentId } = req.params;
    const { reason, stallId } = req.body;

    const effectiveStallId = requester?.role === 'stall_staff' ? String(requester._id) : stallId;

    if (!effectiveStallId) {
      return res.status(400).json({ message: 'stallId is required' });
    }

    const existingPayment = await Payment.findById(paymentId).populate('orderDbId', 'stallId');

    if (!existingPayment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const paymentStallId = existingPayment.stallId
      ? String(existingPayment.stallId)
      : (existingPayment.orderDbId?.stallId ? String(existingPayment.orderDbId.stallId) : '');
    if (!paymentStallId || paymentStallId !== String(effectiveStallId)) {
      return res.status(403).json({ message: 'You can only reject payments for your own store' });
    }

    if (String(existingPayment.status || '').toLowerCase() !== 'pending') {
      return res.status(400).json({ message: 'Only pending payments can be rejected' });
    }

    const payment = await Payment.findByIdAndUpdate(
      paymentId,
      {
        status: 'rejected',
        rejectionReason: reason || 'No reason provided'
      },
      { new: true }
    );

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (payment.orderDbId) {
      const order = await Order.findById(payment.orderDbId);

      if (order && String(order.status || '').toLowerCase() !== 'cancelled') {
        for (const item of order.items || []) {
          if (!item?.menuItemId || !Number(item?.quantity || 0)) continue;

          await MenuItem.findByIdAndUpdate(item.menuItemId, {
            $inc: { quantity: Number(item.quantity || 0) },
            $set: { isAvailable: true }
          });
        }

        order.status = 'cancelled';
        order.paymentStatus = 'rejected';
        order.cancellationReason = 'payment_rejected';
        order.refundRequired = false;
        order.refundStatus = 'not_required';
        order.gracePeriodExpiresAt = undefined;
        order.readyAt = undefined;
        await order.save();
      }

      if (order?.customerId) {
        const customer = await User.findById(order.customerId);
        if (customer?.phone) {
          const store = await User.findById(order.stallId).select('name');
          const storeName = store?.name || 'Store';
          await sendStatusSMS(customer.phone, order.orderNumber || order.queueNumber, 'rejected', storeName);
        }
      }
    }

    res.json({
      success: true,
      message: 'Payment rejected',
      payment: payment
    });
  } catch (err) {
    console.error('Reject error:', err);
    res.status(500).json({ message: 'Error rejecting payment: ' + err.message });
  }
});

// Get pending GCash payments
router.get('/pending-payments', async (req, res) => {
  try {
    const requester = await getRequesterFromToken(req);
    const requestedStallId = req.query.stallId;
    const effectiveStallId = requester?.role === 'stall_staff' ? String(requester._id) : String(requestedStallId || '').trim();

    if (!effectiveStallId) {
      return res.status(200).json({ success: true, payments: [], count: 0 });
    }

    const paymentQuery = {
      status: 'pending'
    };

    paymentQuery.stallId = effectiveStallId;

    const payments = await Payment.find(paymentQuery)
      .populate('customerId', 'name email phone')
      .populate({
        path: 'orderDbId',
        select: 'orderNumber queueNumber _id stallId'
      })
      .sort({ createdAt: -1 });

    const finalPayments = payments.filter((payment) => {
      if (!payment.orderDbId?.stallId) return false;
      return String(payment.orderDbId.stallId) === String(effectiveStallId);
    });

    res.json({
      success: true,
      payments: finalPayments,
      count: finalPayments.length
    });
  } catch (err) {
    console.error('Fetch pending error:', err);
    res.status(500).json({ message: 'Error fetching pending payments: ' + err.message });
  }
});

module.exports = router;
