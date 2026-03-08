const router = require('express').Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const Order = require('../models/Order');
const SequenceCounter = require('../models/SequenceCounter');
const MenuItem = require('../models/MenuItem');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const SalesReport = require('../models/SalesReport');
const { sendStatusSMS } = require('../utils/smsService');
const { GRACE_PERIOD_MINUTES, processExpiredReadyOrders } = require('../utils/orderGraceService');
const { deductInventoryForOrder, restoreInventoryForOrder } = require('../utils/inventoryService');

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const uploadRefundProof = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
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

const calculateEstimatedTime = async (items, stallId) => {
  const baseTimePerItem = 3;
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  let prepTime = totalItems * baseTimePerItem;

  const activeOrders = await Order.countDocuments({
    status: { $in: ['pending', 'preparing'] },
    ...(stallId ? { stallId } : {})
  });

  const queueDelay = Math.max(0, activeOrders) * 2;
  const complexityBuffer = totalItems > 5 ? 5 : totalItems > 3 ? 3 : 0;
  const totalTime = prepTime + queueDelay + complexityBuffer;

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

const getGracePeriodExpiry = (readyAt = new Date()) => {
  return new Date(readyAt.getTime() + GRACE_PERIOD_MINUTES * 60 * 1000);
};

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

const getManilaDateKey = (date = new Date()) => {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getManilaDayRange = (dateKeyInput) => {
  const dateKey = String(dateKeyInput || '').trim() || getManilaDateKey(new Date());
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const dayStartUtc = new Date(Date.UTC(year, month - 1, day) - MANILA_OFFSET_MS);
  const nextDayUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);

  return { dateKey, dayStartUtc, nextDayUtc };
};

const persistDailySalesReportForStall = async (stallId, date = new Date()) => {
  if (!stallId) {
    return;
  }

  const { dayStartUtc, nextDayUtc } = getManilaDayRange(getManilaDateKey(date));

  const completedOrders = await Order.find({
    stallId,
    status: 'completed',
    updatedAt: { $gte: dayStartUtc, $lt: nextDayUtc }
  });

  const totalRevenue = completedOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const itemBreakdown = {};

  completedOrders.forEach((order) => {
    (order.items || []).forEach((item) => {
      const itemName = String(item?.name || '').trim() || 'Unknown Item';
      itemBreakdown[itemName] = (itemBreakdown[itemName] || 0) + Number(item?.quantity || 0);
    });
  });

  await SalesReport.findOneAndUpdate(
    { stallId, reportDate: dayStartUtc },
    {
      $set: {
        totalOrders: completedOrders.length,
        totalRevenue,
        itemsSold: itemBreakdown,
        generatedAt: new Date()
      }
    },
    { upsert: true }
  );
};

router.get('/', async (req, res) => {
  try {
    await processExpiredReadyOrders();
    const requester = await getRequesterFromToken(req);
    const query = {};

    if (requester?.role === 'stall_staff') {
      query.stallId = requester._id;
    } else if (req.query.stallId) {
      query.stallId = req.query.stallId;
    }

    const orders = await Order.find(query)
      .populate('customerId', 'name phone')
      .sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.get('/report/daily', async (req, res) => {
  try {
    const requester = await getRequesterFromToken(req);
    let range;
    try {
      range = getManilaDayRange(req.query.date);
    } catch (dateErr) {
      return res.status(400).json({ message: dateErr.message });
    }

    const { dateKey, dayStartUtc, nextDayUtc } = range;

    const query = {
      status: 'completed',
      updatedAt: { $gte: dayStartUtc, $lt: nextDayUtc }
    };

    if (requester?.role === 'stall_staff') {
      query.stallId = requester._id;
    } else if (req.query.stallId) {
      query.stallId = req.query.stallId;
    }

    const orders = await Order.find(query);

    const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const itemBreakdown = {};

    orders.forEach(order => {
      order.items.forEach(item => {
        itemBreakdown[item.name] = (itemBreakdown[item.name] || 0) + item.quantity;
      });
    });

    // D5: Persist sales report to database (upsert by stall + date)
    const effectiveStallId = requester?.role === 'stall_staff' ? requester._id : (req.query.stallId || null);
    if (effectiveStallId) {
      await SalesReport.findOneAndUpdate(
        { stallId: effectiveStallId, reportDate: dayStartUtc },
        {
          $set: {
            totalOrders: orders.length,
            totalRevenue,
            itemsSold: itemBreakdown,
            generatedAt: new Date()
          }
        },
        { upsert: true }
      );
    }

    res.status(200).json({
      date: dateKey,
      reportDate: dayStartUtc,
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
    const orders = await Order.find({ customerId: req.params.userId })
      .populate('stallId', 'name')
      .populate({
        path: 'items.menuItemId',
        select: 'stallId',
        populate: {
          path: 'stallId',
          select: 'name'
        }
      })
      .sort({ createdAt: -1 });

    const ordersWithStoreName = orders.map((order) => {
      const orderObject = order.toObject();
      const fallbackStoreName = orderObject.items?.find((item) => item?.menuItemId?.stallId?.name)?.menuItemId?.stallId?.name;
      const storeName = orderObject.stallId?.name || fallbackStoreName || 'Store';

      return {
        ...orderObject,
        storeName
      };
    });

    res.status(200).json(ordersWithStoreName);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.post('/', async (req, res) => {
  try {
    const sharedOrderNote = String(req.body.noteToStall || req.body.note || req.body.customerNote || '').trim();
    const normalizedItems = normalizeOrderItems(req.body.items, sharedOrderNote);

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
    const store = await User.findById(resolvedStallId).select('name storeOpen');
    const storeName = store?.name || 'Store';

    if (!store || store.storeOpen === false) {
      return res.status(403).json({ message: 'This store is currently closed and cannot accept orders.' });
    }

    const { orderNumber, queueNumber } = await getNextOrderIdentifiers(resolvedStallId);
    const estimatedTime = await calculateEstimatedTime(normalizedItems, resolvedStallId);

    const newOrder = new Order({
      customerId: req.body.customerId,
      items: normalizedItems,
      totalAmount: req.body.totalAmount,
      paymentMethod: req.body.paymentMethod,
      stallId: resolvedStallId,
      orderNumber,
      queueNumber,
      estimatedTime,
      status: 'pending'
    });

    const savedOrder = await newOrder.save();

    // D3: Record transaction for cash orders
    await Transaction.create({
      orderId: savedOrder._id,
      customerId: savedOrder.customerId,
      stallId: resolvedStallId,
      amount: savedOrder.totalAmount,
      paymentMethod: savedOrder.paymentMethod,
      status: 'pending'
    });

    const customer = await User.findById(savedOrder.customerId);
    if (customer?.phone) {
      await sendStatusSMS(customer.phone, savedOrder.orderNumber || savedOrder.queueNumber, 'pending', storeName);
    }

    res.status(201).json(savedOrder);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const requester = await getRequesterFromToken(req);
    const existingOrder = await Order.findById(req.params.id);
    if (!existingOrder) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (requester?.role === 'stall_staff' && String(existingOrder.stallId) !== String(requester._id)) {
      return res.status(403).json({ message: 'You can only update orders for your own store' });
    }

    const updateData = { ...req.body };

    const transitionedToCompleted =
      String(req.body.status || '').toLowerCase() === 'completed' &&
      String(existingOrder.status || '').toLowerCase() !== 'completed';

    if (req.body.status) {
      const nextStatus = String(req.body.status).toLowerCase();
      const isGcashOrder = String(existingOrder.paymentMethod || '').toLowerCase() === 'gcash';
      const inventoryAlreadyDeducted = existingOrder.inventoryDeducted === true || (existingOrder.inventoryDeducted === undefined && isGcashOrder);

      if (nextStatus === 'cancelled' && String(existingOrder.status).toLowerCase() === 'preparing') {
        return res.status(400).json({ message: 'Cannot cancel an order that is already preparing' });
      }

      if (
        nextStatus === 'completed' &&
        existingOrder.status !== 'completed' &&
        !inventoryAlreadyDeducted
      ) {
        await deductInventoryForOrder(existingOrder);
        updateData.inventoryDeducted = true;
      }

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
        if (inventoryAlreadyDeducted) {
          await restoreInventoryForOrder(existingOrder);
          updateData.inventoryDeducted = false;
        }

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

    // D3: Sync transaction status
    if (req.body.status) {
      const nextStatus = String(req.body.status).toLowerCase();
      let txStatus = null;
      if (nextStatus === 'completed') txStatus = 'completed';
      else if (nextStatus === 'cancelled') txStatus = 'cancelled';
      if (txStatus) {
        await Transaction.findOneAndUpdate(
          { orderId: updatedOrder._id },
          { $set: { status: txStatus } }
        );
      }
    }

    if (req.body.status) {
      const phone = updatedOrder.customerId?.phone;
      const orderNo = updatedOrder.orderNumber || updatedOrder.queueNumber;
      const store = await User.findById(updatedOrder.stallId).select('name');
      const storeName = store?.name || 'Store';

      if (phone) {
        await sendStatusSMS(phone, orderNo, req.body.status, storeName);
      }
    }

    if (transitionedToCompleted) {
      await persistDailySalesReportForStall(updatedOrder.stallId, new Date());
    }

    res.status(200).json(updatedOrder);
  } catch (err) {
    const message = err?.message || 'Failed to update order';
    const statusCode = message.toLowerCase().includes('insufficient stock') || message.toLowerCase().includes('no longer exist')
      ? 400
      : 500;
    res.status(statusCode).json({ message });
  }
});

router.post('/:id/refund-proof', uploadRefundProof.single('refundProof'), async (req, res) => {
  try {
    const requester = await getRequesterFromToken(req);
    if (!req.file) {
      return res.status(400).json({ message: 'Refund proof image is required' });
    }

    const order = await Order.findById(req.params.id).populate('customerId', 'phone');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (requester?.role === 'stall_staff' && String(order.stallId) !== String(requester._id)) {
      return res.status(403).json({ message: 'You can only submit refund proof for your own store orders' });
    }

    const refundStatus = String(order.refundStatus || '').toLowerCase();
    const canSubmitRefundProof =
      String(order.paymentMethod || '').toLowerCase() === 'gcash' &&
      String(order.status || '').toLowerCase() === 'cancelled' &&
      !['proof_sent', 'confirmed'].includes(refundStatus);

    if (!canSubmitRefundProof) {
      return res.status(400).json({ message: 'Order is not eligible for refund proof submission' });
    }

    order.refundProofPath = null;
    order.refundProofUrl = toImageDataUrl(req.file);
    order.refundProofSentAt = new Date();
    order.refundStatus = 'proof_sent';
    order.paymentStatus = 'refunded';

    const inventoryAlreadyDeducted = order.inventoryDeducted === true || order.inventoryDeducted === undefined;
    if (inventoryAlreadyDeducted) {
      await restoreInventoryForOrder(order);
      order.inventoryDeducted = false;
    }

    await order.save();

    const customerPhone = order.customerId?.phone;
    if (customerPhone) {
      const store = await User.findById(order.stallId).select('name');
      const storeName = store?.name || 'Store';
      await sendStatusSMS(customerPhone, order.orderNumber || order.queueNumber, 'refund_sent', storeName);
    }

    res.status(200).json({
      success: true,
      message: 'Refund proof submitted and customer has been notified by SMS.',
      order
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to submit refund proof' });
  }
});

router.post('/:id/confirm-refund', async (req, res) => {
  try {
    const requester = await getRequesterFromToken(req);

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Only the customer who owns the order can confirm
    if (!requester || String(order.customerId) !== String(requester._id)) {
      return res.status(403).json({ message: 'Only the customer can confirm refund receipt' });
    }

    if (String(order.refundStatus || '').toLowerCase() !== 'proof_sent') {
      return res.status(400).json({ message: 'Refund proof has not been sent yet' });
    }

    order.refundStatus = 'confirmed';
    order.refundConfirmedAt = new Date();
    await order.save();

    res.status(200).json({
      success: true,
      message: 'Refund confirmed by customer.',
      order
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to confirm refund' });
  }
});

router.post('/:id/refund-not-received', async (req, res) => {
  try {
    const requester = await getRequesterFromToken(req);

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (!requester || String(order.customerId) !== String(requester._id)) {
      return res.status(403).json({ message: 'Only the customer can report refund issues' });
    }

    if (String(order.refundStatus || '').toLowerCase() !== 'proof_sent') {
      return res.status(400).json({ message: 'No submitted refund proof to review' });
    }

    order.refundStatus = 'pending';
    order.paymentStatus = 'paid';
    order.refundProofUrl = null;
    order.refundProofPath = null;
    order.refundProofSentAt = null;
    await order.save();

    res.status(200).json({
      success: true,
      message: 'Refund marked as not received. Store must re-submit proof.',
      order
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to update refund status' });
  }
});

module.exports = router;
