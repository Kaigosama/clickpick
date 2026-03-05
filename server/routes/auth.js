const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const User = require('../models/User');
const { emitStoreStatusUpdated } = require('../socket');

const SALT_ROUNDS = 10;

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
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const normalizeBoolean = (value, fallback = true) => {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'open', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'closed', 'no'].includes(normalized)) return false;
  return fallback;
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
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
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
    const hashedPassword = await bcrypt.hash(req.body.password, SALT_ROUNDS);
    const role = req.body.role || 'customer';
    let firstName, lastName, fullName;
    if (role === 'customer') {
      firstName = String(req.body.firstName || '').trim();
      lastName = String(req.body.lastName || '').trim();
      if (!firstName || !lastName) {
        return res.status(400).json({ message: 'First name and last name are required.' });
      }
      fullName = `${firstName} ${lastName}`;
    } else {
      fullName = String(req.body.name || '').trim();
      if (!fullName) {
        return res.status(400).json({ message: 'Store name is required.' });
      }
    }
    const newUser = new User({
      firstName: role === 'customer' ? firstName : undefined,
      lastName: role === 'customer' ? lastName : undefined,
      name: fullName,
      email: normalizedEmail,
      password: hashedPassword,
      role,
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
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    // 1. Find user
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ message: "User not found!" });
    }

    // 2. Check password
    const isMatch = await bcrypt.compare(req.body.password, user.password);
    if (!isMatch) {
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

// RESET PASSWORD (Customer or Stall Staff)
router.post('/forgot-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const newPassword = String(req.body.newPassword || '').trim();

    if (!email || !newPassword) {
      return res.status(400).json({ message: 'Email and new password are required.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Email does not exist.' });
    }

    user.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
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
      .select('_id name logoUrl gcashNumber storeOpen')
      .sort({ createdAt: 1 });

    res.status(200).json(stalls);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching stalls' });
  }
});

// UPDATE PROFILE (Customer or Stall Staff)
router.put('/profile', uploadLogoIfMultipart, async (req, res) => {
  try {
    const { userId, name, firstName, lastName, email, phone, gcashNumber, password: newPassword, storeOpen } = req.body;
    if (!userId) {
      return res.status(400).json({ message: 'Missing userId' });
    }

    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const previousStoreOpen = normalizeBoolean(existingUser.storeOpen, true);

    if (email !== undefined && email !== existingUser.email) {
      return res.status(400).json({ message: 'Email change is not allowed.' });
    }

    const update = {};
    if (existingUser.role === 'customer' && firstName !== undefined && lastName !== undefined) {
      const trimFirst = String(firstName).trim();
      const trimLast = String(lastName).trim();
      update.firstName = trimFirst;
      update.lastName = trimLast;
      update.name = `${trimFirst} ${trimLast}`;
    } else if (name !== undefined) {
      update.name = name;
    }
    if (phone !== undefined) update.phone = phone;
    if (gcashNumber !== undefined) {
      update.gcashNumber = String(gcashNumber).trim();
    }
    if (storeOpen !== undefined && existingUser.role === 'stall_staff') {
      update.storeOpen = normalizeBoolean(storeOpen, previousStoreOpen);
    }
    if (newPassword !== undefined && String(newPassword).trim() !== '') {
      if (String(newPassword).trim().length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters.' });
      }
      update.password = await bcrypt.hash(String(newPassword).trim(), SALT_ROUNDS);
    }
    if (req.file) {
      update.logoUrl = toImageDataUrl(req.file);
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: update },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentStoreOpen = normalizeBoolean(updatedUser.storeOpen, true);
    const storeOpenWasSubmitted = storeOpen !== undefined;
    if (existingUser.role === 'stall_staff' && (storeOpenWasSubmitted || previousStoreOpen !== currentStoreOpen)) {
      emitStoreStatusUpdated({
        stallId: updatedUser._id,
        storeOpen: currentStoreOpen
      });
    }

    const { password: savedPassword, ...userWithoutPassword } = updatedUser._doc;
    res.status(200).json({ user: userWithoutPassword });
  } catch (err) {
    res.status(500).json({ message: 'Error updating profile' });
  }
});

// CHANGE PASSWORD (verifies current password first)
router.post('/change-password', async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;

    if (!userId || !currentPassword || !newPassword) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    if (String(newPassword).trim().length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters.' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Wrong current password.' });
    }

    user.password = await bcrypt.hash(String(newPassword).trim(), SALT_ROUNDS);
    await user.save();

    res.status(200).json({ message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Error changing password.' });
  }
});

module.exports = router;