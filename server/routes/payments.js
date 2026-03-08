const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const SequenceCounter = require('../models/SequenceCounter');
const MenuItem = require('../models/MenuItem');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { sendStatusSMS } = require('../utils/smsService');
const { deductInventoryForOrder, restoreInventoryForOrder } = require('../utils/inventoryService');

const GCASH_PENDING_TIMEOUT_SECONDS = 300;

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

const upload = multer({
  storage: multer.memoryStorage(),
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

const toImageDataUrl = (file) => {
  if (!file || !file.buffer || !file.mimetype) {
    return null;
  }
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
};

const normalizeOrderItems = (items = [], sharedNote = '') => {
  return (Array.isArray(items) ? items : []).map((item) => ({
    menuItemId: item?.menuItemId || item?._id,
    name: String(item?.name || '').trim(),
    variation: String(item?.variation || '').trim(),
    riceOption: ['no_rice', 'with_rice'].includes(String(item?.riceOption || '').trim())
      ? String(item?.riceOption || '').trim()
      : '',
    noteToStall: String(item?.noteToStall || item?.note || item?.customerNote || sharedNote || '').trim(),
    quantity: Number(item?.quantity || 1),
    price: Number(item?.price || 0)
  }));
};

const isPaymentExpired = (payment, now = new Date()) => {
  if (!payment?.expiresAt) {
    return false;
  }
  return new Date(payment.expiresAt).getTime() <= now.getTime();
};

const cancelExpiredPendingPayment = async (payment, now = new Date()) => {
  if (!payment || String(payment.status || '').toLowerCase() !== 'pending' || !isPaymentExpired(payment, now)) {
    return false;
  }

  if (payment.orderDbId) {
    const order = await Order.findById(payment.orderDbId);

    if (order && String(order.status || '').toLowerCase() !== 'cancelled') {
      const inventoryAlreadyDeducted = order.inventoryDeducted === true || order.inventoryDeducted === undefined;
      if (inventoryAlreadyDeducted) {
        await restoreInventoryForOrder(order);
        order.inventoryDeducted = false;
      }

      order.status = 'cancelled';
      order.paymentStatus = 'rejected';
      order.cancellationReason = 'payment_timeout';
      order.refundRequired = false;
      order.refundStatus = 'not_required';
      order.gracePeriodExpiresAt = undefined;
      order.readyAt = undefined;
      await order.save();
    }

    await Transaction.findOneAndUpdate(
      { orderId: payment.orderDbId },
      { $set: { status: 'rejected' } }
    );
  }

  payment.status = 'rejected';
  payment.rejectionReason = payment.rejectionReason || 'payment_timeout';
  payment.autoCancelledAt = now;
  await payment.save();

  return true;
};

// Upload GCash proof of payment
router.post('/gcash-upload', upload.single('file'), async (req, res) => {
  try {
    const { customerId, items, totalAmount, stallId } = req.body;

    if (!req.file || !customerId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Parse items if it's a string
    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
    const sharedOrderNote = String(req.body.noteToStall || req.body.note || req.body.customerNote || '').trim();
    const normalizedItems = normalizeOrderItems(parsedItems, sharedOrderNote);

    const menuItemIds = normalizedItems
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
    const estimatedTime = await calculateEstimatedTime(normalizedItems, effectiveStallId);
    const expiresAt = new Date(Date.now() + (GCASH_PENDING_TIMEOUT_SECONDS * 1000));

    const newOrder = new Order({
      customerId: customerId,
      items: normalizedItems,
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

    await deductInventoryForOrder(savedOrder);
    savedOrder.inventoryDeducted = true;
    await savedOrder.save();

    // Create payment record
    const payment = new Payment({
      orderId: stableOrderId,
      orderDbId: savedOrder._id, // Reference to the actual Order document
      stallId: effectiveStallId,
      customerId: customerId,
      paymentMethod: 'gcash',
      amount: totalAmount || req.body.amount || 0,
      status: 'pending',
      expiresAt,
      proofOfPaymentUrl: toImageDataUrl(req.file)
    });

    await payment.save();

    // D3: Record GCash transaction (pending until staff approves)
    await Transaction.create({
      orderId: savedOrder._id,
      customerId: customerId,
      stallId: effectiveStallId,
      amount: totalAmount || req.body.amount || 0,
      paymentMethod: 'gcash',
      status: 'pending',
      notes: `Payment ref: ${payment._id}`
    });

    res.json({
      success: true,
      message: 'Proof of payment uploaded successfully',
      paymentId: payment._id,
      orderId: stableOrderId,
      orderDbId: savedOrder._id,
      expiresAt: payment.expiresAt
    });
  } catch (err) {
    console.error('GCash upload error:', err);

    res.status(500).json({ 
      message: 'Upload failed: ' + err.message 
    });
  }
});

// Get GCash payment status
router.get('/gcash-status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const requester = await getRequesterFromToken(req);

    const payment = await Payment.findOne({ orderId: orderId })
      .populate('orderDbId', 'orderNumber queueNumber _id stallId');

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (!requester) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (requester.role === 'customer' && String(payment.customerId) !== String(requester._id)) {
      return res.status(403).json({ message: 'You can only view your own payment status' });
    }

    if (requester.role === 'stall_staff') {
      const paymentStallId = payment.stallId
        ? String(payment.stallId)
        : (payment.orderDbId?.stallId ? String(payment.orderDbId.stallId) : '');

      if (!paymentStallId || paymentStallId !== String(requester._id)) {
        return res.status(403).json({ message: 'You can only view payment status for your own store' });
      }
    }

    const now = new Date();
    await cancelExpiredPendingPayment(payment, now);

    res.json({
      status: payment.status,
      orderId: orderId,
      orderNumber: payment.orderDbId?.orderNumber,
      queueNumber: payment.orderDbId?.queueNumber,
      approvedAt: payment.approvedAt,
      rejectionReason: payment.rejectionReason,
      expiresAt: payment.expiresAt,
      autoCancelledAt: payment.autoCancelledAt,
      timeRemainingSeconds: payment.expiresAt
        ? Math.max(0, Math.ceil((new Date(payment.expiresAt).getTime() - now.getTime()) / 1000))
        : null
    });
  } catch (err) {
    console.error('Get status error:', err);
    res.status(500).json({ message: 'Error fetching status: ' + err.message });
  }
});

router.get('/gcash-active-session', async (req, res) => {
  try {
    const requester = await getRequesterFromToken(req);

    if (!requester) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (requester.role !== 'customer') {
      return res.status(403).json({ message: 'Only customers can resume GCash sessions' });
    }

    const now = new Date();
    const pendingPayments = await Payment.find({
      customerId: requester._id,
      paymentMethod: 'gcash',
      status: 'pending'
    })
      .populate('orderDbId', 'orderNumber queueNumber _id')
      .sort({ createdAt: -1 });

    for (const payment of pendingPayments) {
      await cancelExpiredPendingPayment(payment, now);
    }

    const activePayment = await Payment.findOne({
      customerId: requester._id,
      paymentMethod: 'gcash',
      status: 'pending'
    })
      .populate('orderDbId', 'orderNumber queueNumber _id')
      .sort({ createdAt: -1 });

    if (!activePayment) {
      return res.json({
        hasActiveSession: false
      });
    }

    res.json({
      hasActiveSession: true,
      orderId: activePayment.orderId,
      orderNumber: activePayment.orderDbId?.orderNumber,
      queueNumber: activePayment.orderDbId?.queueNumber,
      status: activePayment.status,
      expiresAt: activePayment.expiresAt,
      timeRemainingSeconds: activePayment.expiresAt
        ? Math.max(0, Math.ceil((new Date(activePayment.expiresAt).getTime() - now.getTime()) / 1000))
        : null
    });
  } catch (err) {
    console.error('Get active session error:', err);
    res.status(500).json({ message: 'Error getting active GCash session: ' + err.message });
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
      // D3: Mark transaction as completed on payment approval
      await Transaction.findOneAndUpdate(
        { orderId: payment.orderDbId },
        { $set: { status: 'completed' } }
      );
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
        const inventoryAlreadyDeducted = order.inventoryDeducted === true || order.inventoryDeducted === undefined;
        if (inventoryAlreadyDeducted) {
          await restoreInventoryForOrder(order);
          order.inventoryDeducted = false;
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
      // D3: Mark transaction as rejected on payment rejection
      await Transaction.findOneAndUpdate(
        { orderId: payment.orderDbId },
        { $set: { status: 'rejected' } }
      );
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
