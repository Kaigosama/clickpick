const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['customer', 'stall_staff', 'admin'], 
    default: 'customer' 
  },
  phone: { type: String },
  gcashNumber: { type: String },
  logoUrl: { type: String },
  logoPath: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);