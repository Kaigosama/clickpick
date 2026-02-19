const axios = require('axios');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

const User = require('../models/User');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BASE_API_URL = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5000}/api`;

async function run() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing. Add it to server/.env before running this script.');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const now = Date.now();
  const seedTag = `verify-${now}`;
  let createdOrderId;
  let createdMenuItemId;
  let createdCustomerId;
  let createdStallId;

  try {
    const customer = await User.create({
      name: `Verifier Customer ${seedTag}`,
      email: `verifier.customer.${now}@example.com`,
      password: 'test-password',
      role: 'customer',
      phone: '09171234567'
    });

    const stall = await User.create({
      name: `Verifier Stall ${seedTag}`,
      email: `verifier.stall.${now}@example.com`,
      password: 'test-password',
      role: 'stall_staff'
    });

    createdCustomerId = customer._id;
    createdStallId = stall._id;

    const menuItem = await MenuItem.create({
      name: `Verifier Item ${seedTag}`,
      description: 'Inventory deduction verifier item',
      price: 100,
      quantity: 10,
      category: 'main',
      isAvailable: true,
      stallId: stall._id
    });

    createdMenuItemId = menuItem._id;

    const orderPayload = {
      customerId: customer._id,
      items: [
        {
          menuItemId: menuItem._id,
          name: menuItem.name,
          quantity: 3,
          price: menuItem.price
        }
      ],
      totalAmount: 300,
      paymentMethod: 'cash'
    };

    const createdOrder = await axios.post(`${BASE_API_URL}/orders`, orderPayload);
    createdOrderId = createdOrder.data._id;

    let currentMenuItem = await MenuItem.findById(menuItem._id);
    if (!currentMenuItem || currentMenuItem.quantity !== 10) {
      throw new Error(`Expected quantity 10 after order creation, got ${currentMenuItem?.quantity}`);
    }

    await axios.put(`${BASE_API_URL}/orders/${createdOrderId}`, { status: 'preparing' });
    currentMenuItem = await MenuItem.findById(menuItem._id);
    if (!currentMenuItem || currentMenuItem.quantity !== 10) {
      throw new Error(`Expected quantity 10 after non-complete status update, got ${currentMenuItem?.quantity}`);
    }

    await axios.put(`${BASE_API_URL}/orders/${createdOrderId}`, { status: 'completed' });
    currentMenuItem = await MenuItem.findById(menuItem._id);
    if (!currentMenuItem || currentMenuItem.quantity !== 7) {
      throw new Error(`Expected quantity 7 after completion, got ${currentMenuItem?.quantity}`);
    }

    await axios.put(`${BASE_API_URL}/orders/${createdOrderId}`, { status: 'completed' });
    currentMenuItem = await MenuItem.findById(menuItem._id);
    if (!currentMenuItem || currentMenuItem.quantity !== 7) {
      throw new Error(`Expected quantity to remain 7 on repeated completion, got ${currentMenuItem?.quantity}`);
    }

    console.log('✅ Verification passed: inventory deducts only when order becomes completed.');
    console.log(`   API base URL: ${BASE_API_URL}`);
    console.log(`   Order ID: ${createdOrderId}`);
    console.log(`   MenuItem ID: ${createdMenuItemId}`);
  } finally {
    if (createdOrderId) {
      await Order.findByIdAndDelete(createdOrderId);
    }
    if (createdMenuItemId) {
      await MenuItem.findByIdAndDelete(createdMenuItemId);
    }
    if (createdCustomerId) {
      await User.findByIdAndDelete(createdCustomerId);
    }
    if (createdStallId) {
      await User.findByIdAndDelete(createdStallId);
    }
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  const message = error.response?.data || error.message;
  console.error('❌ Verification failed:', message);
  process.exit(1);
});
