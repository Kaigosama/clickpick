const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [
    {
      menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
      name: { type: String },
      variation: { type: String, default: '' },
      riceOption: { type: String, enum: ['no_rice', 'with_rice', ''], default: '' },
      quantity: { type: Number, required: true },
      price: { type: Number, required: true }
    }
  ],
  totalAmount: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['gcash', 'cash'], required: true },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded', 'rejected'], default: 'pending' },
  readyAt: { type: Date },
  gracePeriodExpiresAt: { type: Date },
  autoCancelledAt: { type: Date },
  cancellationReason: {
    type: String,
    enum: ['none', 'manual_cancel', 'grace_period_expired', 'payment_rejected'],
    default: 'none'
  },
  refundRequired: { type: Boolean, default: false },
  refundStatus: {
    type: String,
    enum: ['not_required', 'pending', 'proof_sent'],
    default: 'not_required'
  },
  refundProofUrl: { type: String },
  refundProofPath: { type: String },
  refundProofSentAt: { type: Date },
  status: { 
    type: String, 
    enum: ['pending', 'preparing', 'ready', 'completed', 'cancelled'], 
    default: 'pending' 
  },
  queueNumber: { type: Number },
  estimatedTime: { type: Number }, // Estimated preparation time in minutes
  stallId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Order', OrderSchema);