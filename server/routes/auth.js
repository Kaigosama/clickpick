const router = require('express').Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const User = require('../models/User');

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
      logoUrl: req.file ? toImageDataUrl(req.file) : undefined
    });

    // 3. Save to Database
    const savedUser = await newUser.save();
    const { password, ...userWithoutPassword } = savedUser._doc;
    
    // 4. Generate and return token
    const token = generateToken(savedUser._id);
    res.status(201).json({ token, user: userWithoutPassword });
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

    // 3. Generate token and return user info (excluding password)
    const { password, ...userWithoutPassword } = user._doc;
    const token = generateToken(user._id);
    res.status(200).json({ token, user: userWithoutPassword });
  } catch (err) {
    res.status(500).json(err);
  }
});

// FORGOT PASSWORD (Customer or Stall Staff)
router.post('/forgot-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const newPassword = String(req.body.newPassword || '').trim();

    if (!email || !newPassword) {
      return res.status(400).json({ message: 'Email and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    user.password = newPassword;
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