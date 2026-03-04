const mongoose = require('mongoose');

// D3 Transactions Database
// Records every payment transaction (both cash and GCash) for auditing and reporting.
const TransactionSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stallId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['cash', 'gcash'], required: true },
  status: {
    type: String,
    enum: ['pending', 'completed', 'refunded', 'rejected', 'cancelled'],
    default: 'pending'
  },
  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Transaction', TransactionSchema);
