/**
 * Migration: split `name` into `firstName` + `lastName` for existing customers.
 * Staff accounts are skipped.
 * Run once: node server/scripts/migrate-name-to-firstname-lastname.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const customers = await User.find({ role: 'customer', firstName: { $exists: false } });
  console.log(`Found ${customers.length} customer(s) to migrate.`);

  let updated = 0;
  for (const user of customers) {
    const parts = (user.name || '').trim().split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';
    await User.updateOne({ _id: user._id }, { $set: { firstName, lastName } });
    updated++;
  }

  console.log(`Migrated ${updated} customer(s).`);
  await mongoose.disconnect();
}

migrate().catch(err => { console.error(err); process.exit(1); });
