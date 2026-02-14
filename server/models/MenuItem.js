const mongoose = require('mongoose');

const MenuItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, default: 0 },
  category: { type: String, required: true },
  image: { type: String }, // URL to image
  isAvailable: { type: Boolean, default: true }, // For "Sold Out" toggle
  stallId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

module.exports = mongoose.model('MenuItem', MenuItemSchema);