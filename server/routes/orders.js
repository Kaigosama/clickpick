const router = require('express').Router();
const jwt = require('jsonwebtoken');
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

const getNextOrderIdentifiers = async (stallId) => {
  const [orderCount, storeQueueCount] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ stallId })
  ]);

  return {
    orderNumber: orderCount + 1,
    queueNumber: storeQueueCount + 1
  };
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

const deductInventoryForOrder = async (order) => {
  const orderItems = order?.items || [];

  if (!orderItems.length) {
    return;
  }

  const requiredByItemId = new Map();
  const requiredByItemVariation = new Map();

  for (const item of orderItems) {
    if (!item.menuItemId || !item.quantity) {
      continue;
    }

    const itemId = String(item.menuItemId);
    const existingQty = requiredByItemId.get(itemId) || 0;
    requiredByItemId.set(itemId, existingQty + item.quantity);

    const selectedVariation = String(item.variation || '').trim();
    if (selectedVariation) {
      const variationKey = `${itemId}::${selectedVariation}`;
      const existingVariationQty = requiredByItemVariation.get(variationKey) || 0;
      requiredByItemVariation.set(variationKey, existingVariationQty + item.quantity);
    }
  }

  const itemIds = Array.from(requiredByItemId.keys());
  if (!itemIds.length) {
    return;
  }

  const menuItems = await MenuItem.find({ _id: { $in: itemIds } });
  const menuItemsById = new Map(menuItems.map((menuItem) => [String(menuItem._id), menuItem]));

  for (const itemId of itemIds) {
    const menuItem = menuItemsById.get(itemId);
    const requiredQty = requiredByItemId.get(itemId) || 0;

    if (!menuItem) {
      throw new Error('One or more food items no longer exist');
    }

    if (menuItem.quantity < requiredQty) {
      throw new Error(`Insufficient stock for ${menuItem.name}`);
    }

    const menuVariationOptions = Array.isArray(menuItem.variationOptions) ? menuItem.variationOptions : [];
    if (menuVariationOptions.length > 0) {
      for (const [variationKey, variationQty] of requiredByItemVariation.entries()) {
        const [variationItemId, variationName] = variationKey.split('::');
        if (variationItemId !== itemId) continue;

        const matchedOption = menuVariationOptions.find((option) => String(option.name).trim() === variationName);
        if (!matchedOption) {
          throw new Error(`Variation ${variationName} is unavailable for ${menuItem.name}`);
        }

        if (Number(matchedOption.quantity || 0) < variationQty) {
          throw new Error(`Insufficient stock for ${menuItem.name} (${variationName})`);
        }
      }
    }
  }

  for (const itemId of itemIds) {
    const requiredQty = requiredByItemId.get(itemId) || 0;
    const menuItem = menuItemsById.get(itemId);
    const nextQuantity = menuItem.quantity - requiredQty;
    const menuVariationOptions = Array.isArray(menuItem.variationOptions) ? menuItem.variationOptions : [];

    if (menuVariationOptions.length > 0) {
      menuItem.variationOptions = menuVariationOptions.map((option) => {
        const variationKey = `${itemId}::${String(option.name).trim()}`;
        const requiredVariationQty = requiredByItemVariation.get(variationKey) || 0;
        if (!requiredVariationQty) return option;

        return {
          ...option.toObject?.() || option,
          quantity: Math.max(0, Number(option.quantity || 0) - requiredVariationQty)
        };
      });
    }

    menuItem.quantity = Math.max(0, nextQuantity);
    menuItem.isAvailable = nextQuantity > 0;
    await menuItem.save();
  }
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const query = {
      status: 'completed',
      createdAt: { $gte: today }
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
    const menuItemIds = (req.body.items || [])
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
    const store = await User.findById(resolvedStallId).select('name');
    const storeName = store?.name || 'Store';
    const { orderNumber, queueNumber } = await getNextOrderIdentifiers(resolvedStallId);
    const estimatedTime = await calculateEstimatedTime(req.body.items, resolvedStallId);

    const newOrder = new Order({
      customerId: req.body.customerId,
      items: req.body.items,
      totalAmount: req.body.totalAmount,
      paymentMethod: req.body.paymentMethod,
      stallId: resolvedStallId,
      orderNumber,
      queueNumber,
      estimatedTime,
      status: 'pending'
    });

    const savedOrder = await newOrder.save();

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

    if (req.body.status) {
      const nextStatus = String(req.body.status).toLowerCase();

      if (nextStatus === 'cancelled' && String(existingOrder.status).toLowerCase() === 'preparing') {
        return res.status(400).json({ message: 'Cannot cancel an order that is already preparing' });
      }

      if (nextStatus === 'completed' && existingOrder.status !== 'completed') {
        await deductInventoryForOrder(existingOrder);
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
      const orderNo = updatedOrder.orderNumber || updatedOrder.queueNumber;
      const store = await User.findById(updatedOrder.stallId).select('name');
      const storeName = store?.name || 'Store';

      if (phone) {
        await sendStatusSMS(phone, orderNo, req.body.status, storeName);
      }
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
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ message: 'Order not found' });
    }

    if (requester?.role === 'stall_staff' && String(order.stallId) !== String(requester._id)) {
      fs.unlink(req.file.path, () => {});
      return res.status(403).json({ message: 'You can only submit refund proof for your own store orders' });
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
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }
    res.status(500).json({ message: err.message || 'Failed to submit refund proof' });
  }
});

module.exports = router;
