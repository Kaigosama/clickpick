const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const MenuItem = require('../models/MenuItem');
const { emitMenuUpdated } = require('../socket');

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

const normalizeVariation = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
};

const normalizeVariationOptions = (value) => {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  let parsedValue = value;
  if (typeof value === 'string') {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      return String(value)
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((name) => ({ name, price: null, quantity: null }))
        .filter((option) => option.name.length > 0);
    }
  }

  if (!Array.isArray(parsedValue)) {
    return [];
  }

  return parsedValue
    .map((option) => {
      const name = String(option?.name || '').trim();
      if (!name) return null;
      const rawPrice = option?.price;
      const rawQuantity = option?.quantity;
      const numericPrice = rawPrice === null || rawPrice === undefined || rawPrice === '' ? null : Number(rawPrice);
      const numericQuantity = rawQuantity === null || rawQuantity === undefined || rawQuantity === '' ? null : Number(rawQuantity);
      return {
        name,
        price: Number.isNaN(numericPrice) ? null : Math.max(0, numericPrice),
        quantity: Number.isNaN(numericQuantity) ? null : Math.max(0, numericQuantity)
      };
    })
    .filter(Boolean);
};

const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const lower = String(value).toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on';
};

const normalizePrice = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
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
    const isMainCategory = String(req.body.category || '').toLowerCase() === 'main';
    const withRiceAvailable = isMainCategory ? normalizeBoolean(req.body.withRiceAvailable, false) : false;
    const variationOptions = normalizeVariationOptions(req.body.variationOptions);
    const fallbackPrice = normalizePrice(req.body.price, 0);
    const normalizedVariationOptions = variationOptions.map((option) => ({
      ...option,
      price: option.price === null ? fallbackPrice : option.price,
      quantity: option.quantity === null ? 0 : option.quantity
    }));
    const variationBasedQuantity = normalizedVariationOptions.reduce((sum, option) => sum + Number(option.quantity || 0), 0);
    const effectiveQuantity = normalizedVariationOptions.length > 0
      ? variationBasedQuantity
      : (quantity === null ? 0 : quantity);
    const effectivePrice = normalizedVariationOptions.length > 0
      ? Number(normalizedVariationOptions[0]?.price || fallbackPrice)
      : fallbackPrice;
    const variationNames = normalizedVariationOptions.map((option) => option.name).join(', ');
    const payload = {
      ...req.body,
      quantity: effectiveQuantity,
      price: effectivePrice,
      isAvailable: effectiveQuantity > 0,
      variation: variationNames || normalizeVariation(req.body.variation),
      variationOptions: normalizedVariationOptions,
      noRiceAvailable: isMainCategory ? normalizeBoolean(req.body.noRiceAvailable, true) : false,
      withRiceAvailable,
      withRiceAdditionalPrice: isMainCategory && withRiceAvailable
        ? normalizePrice(req.body.withRiceAdditionalPrice, 15)
        : 0,
      image: req.file ? `/uploads/${req.file.filename}` : req.body.image
    };
    const newItem = new MenuItem(payload);
    const savedItem = await newItem.save();
    emitMenuUpdated({
      stallId: savedItem.stallId,
      action: 'created',
      item: savedItem
    });
    res.status(201).json(savedItem);
  } catch (err) {
    res.status(500).json(err);
  }
});

// UPDATE AVAILABILITY (Sold Out Toggle)
router.put('/:id', uploadImageIfMultipart, async (req, res) => {
  try {
    const quantity = normalizeQuantity(req.body.quantity);
    const categoryValue = req.body.category === undefined ? null : String(req.body.category || '').toLowerCase();
    const hasVariationOptions = req.body.variationOptions !== undefined;
    const parsedVariationOptions = hasVariationOptions ? normalizeVariationOptions(req.body.variationOptions) : null;
    const payload = {
      ...req.body
    };
    if (req.body.variation !== undefined) {
      payload.variation = normalizeVariation(req.body.variation);
    }
    if (hasVariationOptions) {
      const fallbackPrice = req.body.price !== undefined ? normalizePrice(req.body.price, 0) : null;
      const normalizedVariationOptions = parsedVariationOptions.map((option) => ({
        ...option,
        price: option.price === null ? (fallbackPrice === null ? 0 : fallbackPrice) : option.price,
        quantity: option.quantity === null ? 0 : option.quantity
      }));
      payload.variationOptions = normalizedVariationOptions;
      payload.variation = normalizedVariationOptions.map((option) => option.name).join(', ');
      if (normalizedVariationOptions.length > 0) {
        payload.price = Number(normalizedVariationOptions[0]?.price || 0);
        payload.quantity = normalizedVariationOptions.reduce((sum, option) => sum + Number(option.quantity || 0), 0);
        payload.isAvailable = payload.quantity > 0;
      } else {
        payload.variation = '';
      }
    }
    if (req.body.noRiceAvailable !== undefined) {
      payload.noRiceAvailable = normalizeBoolean(req.body.noRiceAvailable, true);
    }
    if (req.body.withRiceAvailable !== undefined) {
      payload.withRiceAvailable = normalizeBoolean(req.body.withRiceAvailable, false);
    }
    if (req.body.withRiceAdditionalPrice !== undefined) {
      payload.withRiceAdditionalPrice = normalizePrice(req.body.withRiceAdditionalPrice, 15);
    }
    if (categoryValue && categoryValue !== 'main') {
      payload.noRiceAvailable = false;
      payload.withRiceAvailable = false;
      payload.withRiceAdditionalPrice = 0;
    } else if (payload.withRiceAvailable === false) {
      payload.withRiceAdditionalPrice = 0;
    }
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
    if (updatedItem) {
      emitMenuUpdated({
        stallId: updatedItem.stallId,
        action: 'updated',
        item: updatedItem
      });
    }
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
    emitMenuUpdated({
      stallId: deletedItem.stallId,
      action: 'deleted',
      item: deletedItem
    });
    res.status(200).json({ message: 'Menu item deleted', item: deletedItem });
  } catch (err) {
    res.status(500).json(err);
  }
});

module.exports = router;