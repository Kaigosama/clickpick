const router = require('express').Router();
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const User = require('../models/User');

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
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
    // 1. Check if user already exists
    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists with this email!" });
    }

    if ((req.body.role || 'customer') === 'customer' && !req.body.phone) {
      return res.status(400).json({ message: 'Phone number is required for customers.' });
    }

    // 2. Create new user
    const newUser = new User({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password, // In a real app, we would encrypt this!
      role: req.body.role || 'customer', // Default to customer
      phone: req.body.phone,
      logoUrl: req.file ? `/uploads/${req.file.filename}` : undefined,
      logoPath: req.file ? req.file.path : undefined
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
    // 1. Find user
    const user = await User.findOne({ email: req.body.email });
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

// GET ALL STALLS (For Customers)
router.get('/stalls', async (req, res) => {
  try {
    const stalls = await User.find({ role: 'stall_staff' })
      .select('_id name logoUrl')
      .sort({ createdAt: 1 });

    res.status(200).json(stalls);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching stalls' });
  }
});

// UPDATE PROFILE (Customer or Stall Staff)
router.put('/profile', uploadLogoIfMultipart, async (req, res) => {
  try {
    const { userId, name, email, phone } = req.body;
    if (!userId) {
      return res.status(400).json({ message: 'Missing userId' });
    }

    const update = {};
    if (name !== undefined) update.name = name;
    if (email !== undefined) update.email = email;
    if (phone !== undefined) update.phone = phone;
    if (req.file) {
      update.logoUrl = `/uploads/${req.file.filename}`;
      update.logoPath = req.file.path;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { password, ...userWithoutPassword } = updatedUser._doc;
    res.status(200).json({ user: userWithoutPassword });
  } catch (err) {
    res.status(500).json({ message: 'Error updating profile' });
  }
});

module.exports = router;