const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

export const env = {
  NODE_ENV:           process.env.NODE_ENV || 'development',
  PORT:               process.env.PORT || 5000,
  MONGODB_URI:        required('MONGODB_URI'),
  JWT_ACCESS_SECRET:  required('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: required('JWT_REFRESH_SECRET'),
  CLIENT_ORIGIN:      process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  // mail is optional — when SMTP_HOST is unset, emails are logged instead of sent
  SMTP_HOST:      process.env.SMTP_HOST || '',
  SMTP_PORT:      Number(process.env.SMTP_PORT) || 587,
  SMTP_SECURE:    process.env.SMTP_SECURE === 'true',
  SMTP_USER:      process.env.SMTP_USER || '',
  SMTP_PASS:      process.env.SMTP_PASS || '',
  MAIL_FROM:      process.env.MAIL_FROM || 'LoyaltyLedger <no-reply@loyaltyledger.app>',
};
