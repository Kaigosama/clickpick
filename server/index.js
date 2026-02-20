const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const path = require('path');

dotenv.config();

// Import Routes
const authRoute = require('./routes/auth');
const menuRoute = require('./routes/menu');
const orderRoute = require('./routes/orders');
const paymentsRoute = require('./routes/payments');
const { processExpiredReadyOrders } = require('./utils/orderGraceService');
const { setSocketServer } = require('./socket');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// Use Routes
app.use('/api/auth', authRoute);
app.use('/api/menu', menuRoute);
app.use('/api/orders', orderRoute);
app.use('/api/payments', paymentsRoute);

setSocketServer(server);

setInterval(async () => {
  try {
    const { processedCount } = await processExpiredReadyOrders();
    if (processedCount > 0) {
      console.log(`⏰ Auto-cancelled ${processedCount} expired ready order(s).`);
    }
  } catch (err) {
    console.error('Grace period processor error:', err.message);
  }
}, 60 * 1000);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});