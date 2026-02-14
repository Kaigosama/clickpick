const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const MenuItem = require('../models/MenuItem');

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
    cb(null, 'menu-' + uniqueSuffix + path.extname(file.originalname));
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

const uploadImageIfMultipart = (req, res, next) => {
  if (req.is('multipart/form-data')) {
    upload.single('image')(req, res, next);
    return;
  }
  next();
};

const normalizeQuantity = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.max(0, parsed);
};

// GET ALL MENU ITEMS (For Customers)
router.get('/', async (req, res) => {
  try {
    const query = req.query.stall ? { stallId: req.query.stall } : {};
    const menu = await MenuItem.find(query);
    res.status(200).json(menu);
  } catch (err) {
    res.status(500).json(err);
  }
});

// ADD MENU ITEM (For Stall Staff)
router.post('/', uploadImageIfMultipart, async (req, res) => {
  try {
    const quantity = normalizeQuantity(req.body.quantity);
    const payload = {
      ...req.body,
      quantity: quantity === null ? 0 : quantity,
      isAvailable: (quantity === null ? 0 : quantity) > 0,
      image: req.file ? `/uploads/${req.file.filename}` : req.body.image
    };
    const newItem = new MenuItem(payload);
    const savedItem = await newItem.save();
    res.status(201).json(savedItem);
  } catch (err) {
    res.status(500).json(err);
  }
});

// UPDATE AVAILABILITY (Sold Out Toggle)
router.put('/:id', uploadImageIfMultipart, async (req, res) => {
  try {
    const quantity = normalizeQuantity(req.body.quantity);
    const payload = {
      ...req.body
    };
    if (quantity !== null) {
      payload.quantity = quantity;
      payload.isAvailable = quantity > 0;
    }
    if (req.file) {
      payload.image = `/uploads/${req.file.filename}`;
    }
    const updatedItem = await MenuItem.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { returnDocument: 'after' }
    );
    res.status(200).json(updatedItem);
  } catch (err) {
    res.status(500).json(err);
  }
});

// DELETE MENU ITEM (For Stall Staff)
router.delete('/:id', async (req, res) => {
  try {
    const deletedItem = await MenuItem.findByIdAndDelete(req.params.id);
    if (!deletedItem) {
      return res.status(404).json({ message: 'Menu item not found' });
    }
    res.status(200).json({ message: 'Menu item deleted', item: deletedItem });
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;