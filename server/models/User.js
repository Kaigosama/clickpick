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
  logoPath: { type: String },
  emailVerified: { type: Boolean, default: false },
  emailVerificationCode: { type: String },
  emailVerificationCodeExpiresAt: { type: Date },
  emailVerificationCodeSentAt: { type: Date },
  passwordResetCode: { type: String },
  passwordResetCodeExpiresAt: { type: Date },
  passwordResetCodeSentAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);