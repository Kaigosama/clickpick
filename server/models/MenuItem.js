const mongoose = require('mongoose');

const MenuItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  variation: { type: String, default: '' },
  variationOptions: [
    {
      name: { type: String, required: true },
      price: { type: Number, required: true, min: 0 },
      quantity: { type: Number, required: true, min: 0, default: 0 }
    }
  ],
  quantity: { type: Number, required: true, default: 0 },
  category: { type: String, required: true },
  noRiceAvailable: { type: Boolean, default: false },
  withRiceAvailable: { type: Boolean, default: false },
  withRiceAdditionalPrice: { type: Number, default: 15 },
  image: { type: String }, // URL to image
  isAvailable: { type: Boolean, default: true }, // For "Sold Out" toggle
  stallId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

module.exports = mongoose.model('MenuItem', MenuItemSchema);