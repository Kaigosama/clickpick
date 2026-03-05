const Order = require('../models/Order');
const User = require('../models/User');
const { sendStatusSMS } = require('./smsService');
const { restoreInventoryForOrder } = require('./inventoryService');

const GRACE_PERIOD_MINUTES = 15;
const GRACE_PERIOD_MS = GRACE_PERIOD_MINUTES * 60 * 1000;

const processExpiredReadyOrders = async () => {
  const now = new Date();
  const fallbackCutoff = new Date(now.getTime() - GRACE_PERIOD_MS);

  const expiredOrders = await Order.find({
    status: 'ready',
    $or: [
      { gracePeriodExpiresAt: { $lte: now } },
      {
        gracePeriodExpiresAt: { $exists: false },
        updatedAt: { $lte: fallbackCutoff }
      }
    ]
  })
    .populate('customerId', 'phone')
    .populate('stallId', 'name');

  let processedCount = 0;

  for (const order of expiredOrders) {
    const needsRefund = order.paymentMethod === 'gcash' && order.paymentStatus === 'paid';
    const inventoryAlreadyDeducted = order.inventoryDeducted === true || order.inventoryDeducted === undefined;

    if (inventoryAlreadyDeducted) {
      await restoreInventoryForOrder(order);
      order.inventoryDeducted = false;
    }

    order.status = 'cancelled';
    order.autoCancelledAt = now;
    order.cancellationReason = 'grace_period_expired';
    order.refundRequired = needsRefund;
    order.refundStatus = needsRefund ? 'pending' : 'not_required';

    await order.save();
    processedCount += 1;

    let customerPhone = order.customerId?.phone;
    if (!customerPhone && order.customerId) {
      const customer = await User.findById(order.customerId);
      customerPhone = customer?.phone;
    }

    if (customerPhone) {
      const storeName = order.stallId?.name || 'Store';
      await sendStatusSMS(
        customerPhone,
        order.orderNumber || order.queueNumber,
        needsRefund ? 'refund_pending' : 'cancelled',
        storeName
      );
    }
  }

  return { processedCount };
};

module.exports = {
  GRACE_PERIOD_MINUTES,
  processExpiredReadyOrders
};
