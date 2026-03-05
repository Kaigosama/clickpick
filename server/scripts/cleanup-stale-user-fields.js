/**
 * One-time migration: removes stale password-reset and emailVerified fields
 * from all user documents that still have them.
 *
 * Run with:  node server/scripts/cleanup-stale-user-fields.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('No MONGO_URI found in environment.');
  process.exit(1);
}

(async () => {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.');

  const result = await mongoose.connection.db.collection('users').updateMany(
    {
      $or: [
        { emailVerified: { $exists: true } },
        { passwordResetCode: { $exists: true } },
        { passwordResetCodeExpiresAt: { $exists: true } },
        { passwordResetCodeSentAt: { $exists: true } },
      ],
    },
    {
      $unset: {
        emailVerified: '',
        passwordResetCode: '',
        passwordResetCodeExpiresAt: '',
        passwordResetCodeSentAt: '',
      },
    }
  );

  console.log(`Done. ${result.modifiedCount} document(s) cleaned up.`);
  await mongoose.disconnect();
})();
