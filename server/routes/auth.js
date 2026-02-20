const router = require('express').Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const User = require('../models/User');
const { sendPasswordResetEmail, sendSignupVerificationEmail } = require('../utils/emailService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const uploadLogoIfMultipart = (req, res, next) => {
  if (req.is('multipart/form-data')) {
    upload.single('logo')(req, res, next);
    return;
  }
  next();
};

const toImageDataUrl = (file) => {
  if (!file || !file.buffer || !file.mimetype) {
    return null;
  }
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const generateResetCode = () => String(Math.floor(100000 + Math.random() * 900000));
const generateVerificationCode = () => String(Math.floor(100000 + Math.random() * 900000));
const RESET_CODE_COOLDOWN_MS = 30 * 1000;
const EMAIL_VERIFICATION_COOLDOWN_MS = 30 * 1000;

const applyEmailVerificationCode = (user) => {
  user.emailVerificationCode = generateVerificationCode();
  user.emailVerificationCodeExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  user.emailVerificationCodeSentAt = new Date();
};

// Helper function to generate JWT
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET || 'your_secret_key_here',
    { expiresIn: '7d' }
  );
};

// REGISTER
router.post('/register', uploadLogoIfMultipart, async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body.email);
    if (!normalizedEmail) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    // 1. Check if user already exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists with this email!" });
    }

    if ((req.body.role || 'customer') === 'customer' && !req.body.phone) {
      return res.status(400).json({ message: 'Phone number is required for customers.' });
    }

    // 2. Create new user
    const newUser = new User({
      name: req.body.name,
      email: normalizedEmail,
      password: req.body.password, // In a real app, we would encrypt this!
      role: req.body.role || 'customer', // Default to customer
      phone: req.body.phone,
      gcashNumber: req.body.gcashNumber,
      logoUrl: req.file ? toImageDataUrl(req.file) : undefined,
      emailVerified: false
    });

    applyEmailVerificationCode(newUser);

    // 3. Save to Database
    const savedUser = await newUser.save();

    await sendSignupVerificationEmail(savedUser.email, savedUser.emailVerificationCode);

    res.status(201).json({
      requiresEmailVerification: true,
      email: savedUser.email,
      message: 'Registration successful. Verification code sent to your email.'
    });
  } catch (err) {
    res.status(500).json(err);
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body.email);
    if (!normalizedEmail) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    // 1. Find user
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ message: "User not found!" });
    }

    // 2. Check password (Simple check for now)
    if (user.password !== req.body.password) {
      return res.status(400).json({ message: "Wrong credentials!" });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        message: 'Please verify your email before signing in.',
        needsEmailVerification: true,
        email: user.email
      });
    }

    // 3. Generate token and return user info (excluding password)
    const { password, ...userWithoutPassword } = user._doc;
    const token = generateToken(user._id);
    res.status(200).json({ token, user: userWithoutPassword });
  } catch (err) {
    res.status(500).json(err);
  }
});

// VERIFY SIGNUP EMAIL CODE
router.post('/verify-email', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || '').trim();

    if (!email || !code) {
      return res.status(400).json({ message: 'Email and code are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (user.emailVerified) {
      return res.status(200).json({ message: 'Email is already verified.' });
    }

    const isCodeMatch = String(user.emailVerificationCode || '') === code;
    const isCodeExpired = !user.emailVerificationCodeExpiresAt || new Date(user.emailVerificationCodeExpiresAt).getTime() < Date.now();

    if (!isCodeMatch || isCodeExpired) {
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    user.emailVerified = true;
    user.emailVerificationCode = null;
    user.emailVerificationCodeExpiresAt = null;
    user.emailVerificationCodeSentAt = null;
    await user.save();

    res.status(200).json({ message: 'Email verified successfully. You can now sign in.' });
  } catch (err) {
    res.status(500).json({ message: 'Error verifying email.' });
  }
});

// RESEND SIGNUP EMAIL VERIFICATION CODE
router.post('/resend-verification-code', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (user.emailVerified) {
      return res.status(400).json({ message: 'Email is already verified.' });
    }

    const lastSentAtMs = user.emailVerificationCodeSentAt
      ? new Date(user.emailVerificationCodeSentAt).getTime()
      : 0;
    const elapsedMs = Date.now() - lastSentAtMs;

    if (lastSentAtMs && elapsedMs < EMAIL_VERIFICATION_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((EMAIL_VERIFICATION_COOLDOWN_MS - elapsedMs) / 1000);
      return res.status(429).json({
        message: `Please wait ${retryAfterSeconds}s before requesting another code.`
      });
    }

    applyEmailVerificationCode(user);
    await user.save();

    await sendSignupVerificationEmail(user.email, user.emailVerificationCode);

    res.status(200).json({ message: 'Verification code sent to your email.' });
  } catch (err) {
    res.status(500).json({ message: 'Error sending verification code.' });
  }
});

// REQUEST PASSWORD RESET CODE (Customer or Stall Staff)
router.post('/forgot-password/request-code', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const lastSentAtMs = user.passwordResetCodeSentAt
      ? new Date(user.passwordResetCodeSentAt).getTime()
      : 0;
    const elapsedMs = Date.now() - lastSentAtMs;

    if (lastSentAtMs && elapsedMs < RESET_CODE_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((RESET_CODE_COOLDOWN_MS - elapsedMs) / 1000);
      return res.status(429).json({
        message: `Please wait ${retryAfterSeconds}s before requesting another code.`
      });
    }

    const resetCode = generateResetCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    user.passwordResetCode = resetCode;
    user.passwordResetCodeExpiresAt = expiresAt;
    user.passwordResetCodeSentAt = new Date();
    await user.save();

    await sendPasswordResetEmail(user.email, resetCode);

    res.status(200).json({ message: 'Verification code sent to your email.' });
  } catch (err) {
    res.status(500).json({ message: 'Error sending verification code.' });
  }
});

// VERIFY PASSWORD RESET CODE AND UPDATE PASSWORD
router.post('/forgot-password/verify-code', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = String(req.body.code || '').trim();
    const newPassword = String(req.body.newPassword || '').trim();

    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'Email, code, and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const isCodeMatch = String(user.passwordResetCode || '') === code;
    const isCodeExpired = !user.passwordResetCodeExpiresAt || new Date(user.passwordResetCodeExpiresAt).getTime() < Date.now();

    if (!isCodeMatch || isCodeExpired) {
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    user.password = newPassword;
    user.passwordResetCode = null;
    user.passwordResetCodeExpiresAt = null;
    await user.save();

    res.status(200).json({ message: 'Password has been reset successfully. Please sign in.' });
  } catch (err) {
    res.status(500).json({ message: 'Error resetting password.' });
  }
});

// GET ALL STALLS (For Customers)
router.get('/stalls', async (req, res) => {
  try {
    const stalls = await User.find({ role: 'stall_staff' })
      .select('_id name logoUrl gcashNumber')
      .sort({ createdAt: 1 });

    res.status(200).json(stalls);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching stalls' });
  }
});

// UPDATE PROFILE (Customer or Stall Staff)
router.put('/profile', uploadLogoIfMultipart, async (req, res) => {
  try {
    const { userId, name, email, phone, gcashNumber, password: newPassword } = req.body;
    if (!userId) {
      return res.status(400).json({ message: 'Missing userId' });
    }

    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (email !== undefined && email !== existingUser.email) {
      return res.status(400).json({ message: 'Email change is not allowed.' });
    }

    const update = {};
    if (name !== undefined) update.name = name;
    if (phone !== undefined) update.phone = phone;
    if (gcashNumber !== undefined) {
      update.gcashNumber = String(gcashNumber).trim();
    }
    if (newPassword !== undefined && String(newPassword).trim() !== '') {
      if (String(newPassword).trim().length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters.' });
      }
      update.password = String(newPassword).trim();
    }
    if (req.file) {
      update.logoUrl = toImageDataUrl(req.file);
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { password: savedPassword, ...userWithoutPassword } = updatedUser._doc;
    res.status(200).json({ user: userWithoutPassword });
  } catch (err) {
    res.status(500).json({ message: 'Error updating profile' });
  }
});

module.exports = router;