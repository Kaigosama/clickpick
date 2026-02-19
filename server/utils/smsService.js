const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const TEXTBEE_API_KEY = process.env.TEXTBEE_API_KEY;
const TEXTBEE_DEVICE_ID = process.env.TEXTBEE_DEVICE_ID;
const TEXTBEE_BASE_URL = 'https://api.textbee.dev/api/v1';

const isTextBeeConfigured = TEXTBEE_API_KEY && TEXTBEE_DEVICE_ID;

const buildStatusMessage = (status, queueNumber, storeName) => {
  const normalizedStoreName = String(storeName || '').trim();
  const storeSuffix = normalizedStoreName ? ` from ${normalizedStoreName}` : '';

  switch (status) {
    case 'pending':
      return `ClickPick: Order #${queueNumber}${storeSuffix} has been received.`;
    case 'preparing':
      return `ClickPick: Order #${queueNumber}${storeSuffix} is now being prepared.`;
    case 'ready':
      return `ClickPick: Your Order #${queueNumber}${storeSuffix} is READY for pickup!`;
    case 'completed':
      return `ClickPick: Order #${queueNumber}${storeSuffix} has been completed. Thank you!`;
    case 'cancelled':
      return `ClickPick: Order #${queueNumber}${storeSuffix} was cancelled.`;
    case 'approved':
      return `ClickPick: Payment for Order #${queueNumber}${storeSuffix} has been approved.`;
    case 'rejected':
      return `ClickPick: Payment for Order #${queueNumber}${storeSuffix} was rejected.`;
    case 'refund_pending':
      return `ClickPick: Order #${queueNumber}${storeSuffix} was not claimed within 15 minutes and is now cancelled. Please wait for your GCash refund from the canteen staff.`;
    case 'refund_sent':
      return `ClickPick: Refund for Order #${queueNumber}${storeSuffix} has been sent via GCash by the canteen staff.`;
    default:
      return `ClickPick: Order #${queueNumber}${storeSuffix} status updated to ${status}.`;
  }
};

const sendStatusSMS = async (phoneNumber, queueNumber, status, storeName = '') => {
  const messageBody = buildStatusMessage(status, queueNumber, storeName);
  console.log(`📨 SMS trigger: ${phoneNumber} | Order #${queueNumber} | Status: ${status}`);

  if (isTextBeeConfigured) {
    try {
      const response = await axios.post(
        `${TEXTBEE_BASE_URL}/gateway/devices/${TEXTBEE_DEVICE_ID}/send-sms`,
        {
          recipients: [phoneNumber],
          message: messageBody
        },
        {
          headers: {
            'x-api-key': TEXTBEE_API_KEY,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`✅ SMS sent to ${phoneNumber} via TextBee`);
    } catch (err) {
      console.error("❌ TextBee API Error:", err.response?.data || err.message);
    }
  } else {
    // Simulation mode: This runs if TextBee credentials are missing
    console.log("--- SMS SIMULATION (TextBee not configured) ---");
    console.log(`To: ${phoneNumber}`);
    console.log(`Message: ${messageBody}`);
    console.log("--------------------------------------------------");
  }
};

module.exports = { sendStatusSMS };