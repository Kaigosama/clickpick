const nodemailer = require('nodemailer');

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM || smtpUser || 'no-reply@clickpick.local';

const isSmtpConfigured = Boolean(smtpHost && smtpUser && smtpPass);

const getTransporter = () => {
  if (!isSmtpConfigured) {
    return null;
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });
};

const sendEmailMessage = async ({ to, subject, text }) => {
  const message = {
    from: smtpFrom,
    to,
    subject,
    text
  };

  const transporter = getTransporter();

  if (!transporter) {
    console.log('--- EMAIL SIMULATION (SMTP not configured) ---');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Message: ${text}`);
    console.log('---------------------------------------------');
    return;
  }

  await transporter.sendMail(message);
};

const sendPasswordResetEmail = async (recipientEmail, code) => {
  await sendEmailMessage({
    to: recipientEmail,
    subject: 'ClickPick Password Reset Verification Code',
    text: `Your ClickPick password reset code is: ${code}. It expires in 10 minutes.`
  });
};

const sendSignupVerificationEmail = async (recipientEmail, code) => {
  await sendEmailMessage({
    to: recipientEmail,
    subject: 'ClickPick Email Verification Code',
    text: `Your ClickPick email verification code is: ${code}. It expires in 10 minutes.`
  });
};

module.exports = {
  sendPasswordResetEmail,
  sendSignupVerificationEmail
};
