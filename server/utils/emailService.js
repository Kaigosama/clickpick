const nodemailer = require('nodemailer');

const maskEmail = (value) => {
  const email = String(value || '').trim().toLowerCase();
  if (!email.includes('@')) return email;

  const [localPart, domainPart] = email.split('@');
  const localVisible = localPart.slice(0, Math.min(2, localPart.length));
  const maskedLocal = `${localVisible}${'*'.repeat(Math.max(0, localPart.length - localVisible.length))}`;

  return `${maskedLocal}@${domainPart}`;
};

const getSmtpConfig = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
    isConfigured: Boolean(host && user && pass)
  };
};

const getTransporter = () => {
  const config = getSmtpConfig();

  if (!config.isConfigured) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });
};

const sendEmailMessage = async ({ to, subject, text }) => {
  const config = getSmtpConfig();

  if (!to) {
    throw new Error('Recipient email is required.');
  }

  const message = {
    from: config.from,
    to,
    subject,
    text
  };

  const transporter = getTransporter();

  if (!transporter) {
    console.log('--- EMAIL SIMULATION (SMTP not configured) ---');
    console.log(`To: ${maskEmail(to)}`);
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

const sendTestEmail = async (recipientEmail) => {
  await sendEmailMessage({
    to: recipientEmail,
    subject: 'ClickPick SMTP Test Email',
    text: `SMTP test successful for ClickPick at ${new Date().toISOString()}.`
  });
};

module.exports = {
  sendPasswordResetEmail,
  sendSignupVerificationEmail,
  sendTestEmail
};
