const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const User = require('../models/User');
const { sendStatusSMS } = require('../utils/smsService');
const { GRACE_PERIOD_MINUTES, processExpiredReadyOrders } = require('../utils/orderGraceService');

const refundsDir = path.join(__dirname, '../uploads/refunds');
if (!fs.existsSync(refundsDir)) {
  fs.mkdirSync(refundsDir, { recursive: true });
}

const refundStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, refundsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `refund-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const uploadRefundProof = multer({
  storage: refundStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const calculateEstimatedTime = async (items) => {
  const baseTimePerItem = 3;
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  let prepTime = totalItems * baseTimePerItem;

  const activeOrders = await Order.countDocuments({
    status: { $in: ['pending', 'preparing'] }
  });

  const queueDelay = Math.max(0, activeOrders) * 2;
  const complexityBuffer = totalItems > 5 ? 5 : totalItems > 3 ? 3 : 0;
  const totalTime = prepTime + queueDelay + complexityBuffer;

  return Math.max(5, Math.min(60, Math.round(totalTime)));
};

const getGracePeriodExpiry = (readyAt = new Date()) => {
  return new Date(readyAt.getTime() + GRACE_PERIOD_MINUTES * 60 * 1000);
};

router.get('/', async (req, res) => {
  try {
    await processExpiredReadyOrders();
    const orders = await Order.find()
      .populate('customerId', 'name phone')
      .sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.get('/report/daily', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const orders = await Order.find({
      status: 'completed',
      createdAt: { $gte: today }
    });

    const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const itemBreakdown = {};

    orders.forEach(order => {
      order.items.forEach(item => {
        itemBreakdown[item.name] = (itemBreakdown[item.name] || 0) + item.quantity;
      });
    });

    res.status(200).json({
      date: today.toDateString(),
      totalOrders: orders.length,
      totalRevenue,
      itemsSold: itemBreakdown
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

router.get('/:userId', async (req, res) => {
  try {
    const orders = await Order.find({ customerId: req.params.userId }).sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.post('/', async (req, res) => {
  try {
    const count = await Order.countDocuments();
    const queueNumber = count + 1;
    const estimatedTime = await calculateEstimatedTime(req.body.items);

    const newOrder = new Order({
      customerId: req.body.customerId,
      items: req.body.items,
      totalAmount: req.body.totalAmount,
      paymentMethod: req.body.paymentMethod,
      queueNumber,
      estimatedTime,
      status: 'pending'
    });

    const savedOrder = await newOrder.save();

    for (const item of req.body.items) {
      await MenuItem.findByIdAndUpdate(
        item.menuItemId,
        {
          $inc: { quantity: -item.quantity },
          $set: { isAvailable: true }
        }
      );

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

router.put('/:id', async (req, res) => {
  try {
    const existingOrder = await Order.findById(req.params.id);
    if (!existingOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const updateData = { ...req.body };

    if (req.body.status) {
      const nextStatus = String(req.body.status).toLowerCase();

      if (nextStatus === 'ready') {
        const readyAt = new Date();
        updateData.readyAt = readyAt;
        updateData.gracePeriodExpiresAt = getGracePeriodExpiry(readyAt);
        updateData.autoCancelledAt = null;
        updateData.cancellationReason = 'none';
      } else if (nextStatus === 'completed') {
        updateData.readyAt = null;
        updateData.gracePeriodExpiresAt = null;
        updateData.autoCancelledAt = null;
        updateData.refundRequired = false;
        updateData.refundStatus = 'not_required';
      } else if (nextStatus === 'cancelled') {
        updateData.autoCancelledAt = existingOrder.autoCancelledAt || new Date();
        updateData.cancellationReason = req.body.cancellationReason || 'manual_cancel';

        const needsRefund = existingOrder.paymentMethod === 'gcash' && existingOrder.paymentStatus === 'paid';
        updateData.refundRequired = needsRefund;
        updateData.refundStatus = needsRefund ? 'pending' : 'not_required';
      } else {
        updateData.readyAt = null;
        updateData.gracePeriodExpiresAt = null;
      }
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { returnDocument: 'after' }
    ).populate('customerId', 'name phone');

    if (req.body.status) {
      const phone = updatedOrder.customerId?.phone;
      const queueNo = updatedOrder.queueNumber;

      if (phone) {
        await sendStatusSMS(phone, queueNo, req.body.status);
      }
    }

    res.status(200).json(updatedOrder);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.post('/:id/refund-proof', uploadRefundProof.single('refundProof'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Refund proof image is required' });
    }

    const order = await Order.findById(req.params.id).populate('customerId', 'phone');
    if (!order) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ message: 'Order not found' });
    }

    const canSubmitRefundProof =
      order.paymentMethod === 'gcash' &&
      order.refundRequired === true &&
      order.refundStatus === 'pending';

    if (!canSubmitRefundProof) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ message: 'Order is not awaiting manual GCash refund proof' });
    }

    order.refundProofPath = req.file.path;
    order.refundProofUrl = `/uploads/refunds/${req.file.filename}`;
    order.refundProofSentAt = new Date();
    order.refundStatus = 'proof_sent';
    order.paymentStatus = 'refunded';

    await order.save();

    const customerPhone = order.customerId?.phone;
    if (customerPhone) {
      await sendStatusSMS(customerPhone, order.queueNumber, 'refund_sent');
    }

    res.status(200).json({
      success: true,
      message: 'Refund proof submitted and customer has been notified by SMS.',
      order
    });
  } catch (err) {
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }
    res.status(500).json({ message: err.message || 'Failed to submit refund proof' });
  }
});

module.exports = router;
