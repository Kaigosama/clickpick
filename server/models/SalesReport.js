const mongoose = require('mongoose');

// D5 Sales Reports Database
// Persists generated daily sales reports per stall for historical analysis.
const SalesReportSchema = new mongoose.Schema({
  stallId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reportDate: { type: Date, required: true },
  totalOrders: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  itemsSold: { type: mongoose.Schema.Types.Mixed, default: {} },
  generatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Unique report per stall per day
SalesReportSchema.index({ stallId: 1, reportDate: 1 }, { unique: true });

module.exports = mongoose.model('SalesReport', SalesReportSchema);
