const axios = require('axios');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

const User = require('../models/User');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const Payment = require('../models/Payment');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BASE_API_URL = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 5000}/api`;

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9s3V8hEAAAAASUVORK5CYII=';

const createImageBlob = () => {
  const imageBuffer = Buffer.from(PNG_1X1_BASE64, 'base64');
  return new Blob([imageBuffer], { type: 'image/png' });
};

const loginUser = async (email, password) => {
  const response = await axios.post(`${BASE_API_URL}/auth/login`, { email, password });
  const token = response?.data?.token;
  if (!token) {
    throw new Error(`Login failed for ${email}: missing token`);
  }
  return token;
};

const verifyApiReachable = async () => {
  try {
    await axios.get(`${BASE_API_URL}/auth/stalls`, { timeout: 5000 });
  } catch (error) {
    throw new Error(
      `API is not reachable at ${BASE_API_URL}. Start the server first (e.g., npm --prefix server run dev).`
    );
  }
};

const uploadGcashProof = async ({ customerId, stallId, menuItem, amount }) => {
  const formData = new FormData();
  formData.append('file', createImageBlob(), `proof-${Date.now()}.png`);
  formData.append('customerId', String(customerId));
  formData.append('stallId', String(stallId));
  formData.append('amount', String(amount));
  formData.append('totalAmount', String(amount));
  formData.append(
    'items',
    JSON.stringify([
      {
        menuItemId: String(menuItem._id),
        name: menuItem.name,
        quantity: 1,
        price: menuItem.price,
        variation: '',
        riceOption: ''
      }
    ])
  );

  const response = await fetch(`${BASE_API_URL}/payments/gcash-upload`, {
    method: 'POST',
    body: formData
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`GCash upload failed: ${payload?.message || response.statusText}`);
  }

  return payload;
};

async function run() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing. Add it to server/.env before running this script.');
  }

  await mongoose.connect(process.env.MONGO_URI);
  await verifyApiReachable();

  const now = Date.now();
  const suffix = `gcash-load-${now}`;
  const password = 'test-password';

  let storeA;
  let storeB;
  let customerA;
  let customerB;
  let menuItemA;
  let menuItemB;
  const createdOrderIds = [];
  const createdPaymentIds = [];

  try {
    storeA = await User.create({
      name: `Load Store A ${suffix}`,
      email: `load.store.a.${now}@example.com`,
      password,
      role: 'stall_staff',
      gcashNumber: '09170000001'
    });

    storeB = await User.create({
      name: `Load Store B ${suffix}`,
      email: `load.store.b.${now}@example.com`,
      password,
      role: 'stall_staff',
      gcashNumber: '09170000002'
    });

    customerA = await User.create({
      name: `Load Customer A ${suffix}`,
      email: `load.customer.a.${now}@example.com`,
      password,
      role: 'customer',
      phone: '09171230001'
    });

    customerB = await User.create({
      name: `Load Customer B ${suffix}`,
      email: `load.customer.b.${now}@example.com`,
      password,
      role: 'customer',
      phone: '09171230002'
    });

    menuItemA = await MenuItem.create({
      name: `Load Item A ${suffix}`,
      description: 'Load test item A',
      price: 75,
      quantity: 10,
      category: 'main',
      isAvailable: true,
      stallId: storeA._id
    });

    menuItemB = await MenuItem.create({
      name: `Load Item B ${suffix}`,
      description: 'Load test item B',
      price: 80,
      quantity: 10,
      category: 'main',
      isAvailable: true,
      stallId: storeB._id
    });

    const [uploadA, uploadB] = await Promise.all([
      uploadGcashProof({
        customerId: customerA._id,
        stallId: storeA._id,
        menuItem: menuItemA,
        amount: 75
      }),
      uploadGcashProof({
        customerId: customerB._id,
        stallId: storeB._id,
        menuItem: menuItemB,
        amount: 80
      })
    ]);

    if (uploadA?.orderDbId) createdOrderIds.push(uploadA.orderDbId);
    if (uploadB?.orderDbId) createdOrderIds.push(uploadB.orderDbId);

    const linkedPayments = await Payment.find({ orderDbId: { $in: createdOrderIds } }).select('_id stallId orderDbId');
    linkedPayments.forEach((payment) => createdPaymentIds.push(payment._id));

    const storeAToken = await loginUser(storeA.email, password);
    const storeBToken = await loginUser(storeB.email, password);

    const [pendingARes, pendingBRes] = await Promise.all([
      axios.get(`${BASE_API_URL}/payments/pending-payments?stallId=${storeA._id}`, {
        headers: { Authorization: `Bearer ${storeAToken}` }
      }),
      axios.get(`${BASE_API_URL}/payments/pending-payments?stallId=${storeB._id}`, {
        headers: { Authorization: `Bearer ${storeBToken}` }
      })
    ]);

    const pendingA = Array.isArray(pendingARes.data?.payments) ? pendingARes.data.payments : [];
    const pendingB = Array.isArray(pendingBRes.data?.payments) ? pendingBRes.data.payments : [];

    const hasStoreAOwnPayment = pendingA.some((payment) => String(payment?.orderDbId?.stallId || '') === String(storeA._id));
    const hasStoreBOwnPayment = pendingB.some((payment) => String(payment?.orderDbId?.stallId || '') === String(storeB._id));
    const storeAHasForeign = pendingA.some((payment) => String(payment?.orderDbId?.stallId || '') === String(storeB._id));
    const storeBHasForeign = pendingB.some((payment) => String(payment?.orderDbId?.stallId || '') === String(storeA._id));

    if (!hasStoreAOwnPayment || !hasStoreBOwnPayment) {
      throw new Error('One or both stores did not receive their own pending GCash payment entry.');
    }

    if (storeAHasForeign || storeBHasForeign) {
      throw new Error('Store isolation failed: a store can see another store\'s pending GCash payment.');
    }

    console.log('✅ Verification passed: concurrent GCash payments remain isolated per store.');
    console.log(`   Store A pending count: ${pendingA.length}`);
    console.log(`   Store B pending count: ${pendingB.length}`);
    console.log(`   API base URL: ${BASE_API_URL}`);
  } finally {
    if (createdPaymentIds.length > 0) {
      await Payment.deleteMany({ _id: { $in: createdPaymentIds } });
    }
    if (createdOrderIds.length > 0) {
      await Order.deleteMany({ _id: { $in: createdOrderIds } });
    }
    if (menuItemA?._id) {
      await MenuItem.findByIdAndDelete(menuItemA._id);
    }
    if (menuItemB?._id) {
      await MenuItem.findByIdAndDelete(menuItemB._id);
    }
    if (customerA?._id) {
      await User.findByIdAndDelete(customerA._id);
    }
    if (customerB?._id) {
      await User.findByIdAndDelete(customerB._id);
    }
    if (storeA?._id) {
      await User.findByIdAndDelete(storeA._id);
    }
    if (storeB?._id) {
      await User.findByIdAndDelete(storeB._id);
    }

    await mongoose.disconnect();
  }
}

run().catch((error) => {
  const message = error.response?.data || error.cause?.message || error.message;
  console.error('❌ Verification failed:', message);
  process.exit(1);
});
