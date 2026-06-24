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
};
