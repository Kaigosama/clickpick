const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true }, // Custom order ID for tracking
  orderDbId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }, // Reference to Order document
  stallId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Customer who made the payment
  amount: { type: Number, required: true }, // Payment amount
  paymentMethod: { type: String, enum: ['gcash', 'cash'], required: true },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  proofOfPaymentUrl: { type: String },
  proofOfPaymentPath: { type: String },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String },
  expiresAt: { type: Date },
  autoCancelledAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  approvedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Payment', PaymentSchema);
