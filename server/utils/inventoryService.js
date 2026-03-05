const MenuItem = require('../models/MenuItem');

const toVariationMap = (items = []) => {
  const requiredByItemId = new Map();
  const requiredByItemVariation = new Map();

  for (const item of items) {
    if (!item?.menuItemId || !item?.quantity) continue;

    const itemId = String(item.menuItemId);
    const qty = Number(item.quantity || 0);
    if (!qty) continue;

    requiredByItemId.set(itemId, (requiredByItemId.get(itemId) || 0) + qty);

    const selectedVariation = String(item.variation || '').trim();
    if (selectedVariation) {
      const variationKey = `${itemId}::${selectedVariation}`;
      requiredByItemVariation.set(variationKey, (requiredByItemVariation.get(variationKey) || 0) + qty);
    }
  }

  return { requiredByItemId, requiredByItemVariation };
};

const deductInventoryForOrder = async (order) => {
  const orderItems = order?.items || [];
  if (!orderItems.length) return;

  const { requiredByItemId, requiredByItemVariation } = toVariationMap(orderItems);
  const itemIds = Array.from(requiredByItemId.keys());
  if (!itemIds.length) return;

  const menuItems = await MenuItem.find({ _id: { $in: itemIds } });
  const menuItemsById = new Map(menuItems.map((menuItem) => [String(menuItem._id), menuItem]));

  for (const itemId of itemIds) {
    const menuItem = menuItemsById.get(itemId);
    const requiredQty = requiredByItemId.get(itemId) || 0;

    if (!menuItem) {
      throw new Error('One or more food items no longer exist');
    }

    if (menuItem.quantity < requiredQty) {
      throw new Error(`Insufficient stock for ${menuItem.name}`);
    }

    const options = Array.isArray(menuItem.variationOptions) ? menuItem.variationOptions : [];
    if (!options.length) continue;

    for (const [variationKey, variationQty] of requiredByItemVariation.entries()) {
      const [variationItemId, variationName] = variationKey.split('::');
      if (variationItemId !== itemId) continue;

      const matchedOption = options.find((option) => String(option.name).trim() === variationName);
      if (!matchedOption) {
        throw new Error(`Variation ${variationName} is unavailable for ${menuItem.name}`);
      }

      if (Number(matchedOption.quantity || 0) < variationQty) {
        throw new Error(`Insufficient stock for ${menuItem.name} (${variationName})`);
      }
    }
  }

  for (const itemId of itemIds) {
    const requiredQty = requiredByItemId.get(itemId) || 0;
    const menuItem = menuItemsById.get(itemId);
    const nextQuantity = menuItem.quantity - requiredQty;
    const options = Array.isArray(menuItem.variationOptions) ? menuItem.variationOptions : [];

    if (options.length) {
      menuItem.variationOptions = options.map((option) => {
        const variationKey = `${itemId}::${String(option.name).trim()}`;
        const requiredVariationQty = requiredByItemVariation.get(variationKey) || 0;
        if (!requiredVariationQty) return option;

        return {
          ...(option.toObject?.() || option),
          quantity: Math.max(0, Number(option.quantity || 0) - requiredVariationQty)
        };
      });
    }

    menuItem.quantity = Math.max(0, nextQuantity);
    menuItem.isAvailable = nextQuantity > 0;
    await menuItem.save();
  }
};

const restoreInventoryForOrder = async (order) => {
  const orderItems = order?.items || [];
  if (!orderItems.length) return;

  const { requiredByItemId, requiredByItemVariation } = toVariationMap(orderItems);
  const itemIds = Array.from(requiredByItemId.keys());
  if (!itemIds.length) return;

  const menuItems = await MenuItem.find({ _id: { $in: itemIds } });
  const menuItemsById = new Map(menuItems.map((menuItem) => [String(menuItem._id), menuItem]));

  for (const itemId of itemIds) {
    const menuItem = menuItemsById.get(itemId);
    const restoreQty = requiredByItemId.get(itemId) || 0;

    if (!menuItem) {
      continue;
    }

    const options = Array.isArray(menuItem.variationOptions) ? menuItem.variationOptions : [];
    if (options.length) {
      menuItem.variationOptions = options.map((option) => {
        const variationKey = `${itemId}::${String(option.name).trim()}`;
        const restoreVariationQty = requiredByItemVariation.get(variationKey) || 0;
        if (!restoreVariationQty) return option;

        return {
          ...(option.toObject?.() || option),
          quantity: Number(option.quantity || 0) + restoreVariationQty
        };
      });
    }

    menuItem.quantity = Number(menuItem.quantity || 0) + restoreQty;
    menuItem.isAvailable = menuItem.quantity > 0;
    await menuItem.save();
  }
};

module.exports = {
  deductInventoryForOrder,
  restoreInventoryForOrder
};
