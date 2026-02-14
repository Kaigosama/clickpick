const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const TEXTBEE_API_KEY = process.env.TEXTBEE_API_KEY;
const TEXTBEE_DEVICE_ID = process.env.TEXTBEE_DEVICE_ID;
const TEXTBEE_BASE_URL = 'https://api.textbee.dev/api/v1';

const isTextBeeConfigured = TEXTBEE_API_KEY && TEXTBEE_DEVICE_ID;

const buildStatusMessage = (status, queueNumber) => {
  switch (status) {
    case 'pending':
      return `ClickPick: Order #${queueNumber} has been received.`;
    case 'preparing':
      return `ClickPick: Order #${queueNumber} is now being prepared.`;
    case 'ready':
      return `ClickPick: Your Order #${queueNumber} is READY for pickup!`;
    case 'completed':
      return `ClickPick: Order #${queueNumber} has been completed. Thank you!`;
    case 'cancelled':
      return `ClickPick: Order #${queueNumber} was cancelled.`;
    case 'approved':
      return `ClickPick: Payment for Order #${queueNumber} has been approved.`;
    case 'rejected':
      return `ClickPick: Payment for Order #${queueNumber} was rejected.`;
    default:
      return `ClickPick: Order #${queueNumber} status updated to ${status}.`;
  }
};

const sendStatusSMS = async (phoneNumber, queueNumber, status) => {
  const messageBody = buildStatusMessage(status, queueNumber);
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