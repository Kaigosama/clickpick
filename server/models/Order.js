const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [
    {
      menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
      name: { type: String },
      quantity: { type: Number, required: true },
      price: { type: Number, required: true }
    }
  ],
  totalAmount: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['gcash', 'cash'], required: true },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
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