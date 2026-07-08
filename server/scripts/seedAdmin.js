import 'dotenv/config';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDB } from '../src/config/db.js';
import User from '../src/models/User.js';
import { USER_ROLES } from '../src/config/constants.js';

const ADMIN_EMAIL    = process.env.PLATFORM_ADMIN_EMAIL;
const ADMIN_NAME     = process.env.PLATFORM_ADMIN_NAME || 'Platform Admin';
const ADMIN_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Missing PLATFORM_ADMIN_EMAIL or PLATFORM_ADMIN_PASSWORD in .env');
  process.exit(1);
}

async function seed() {
  await connectDB();

  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    console.log('Platform Admin already exists. Skipping.');
    await mongoose.disconnect();
    return;
  }

  const admin = new User({
    tenantId:     null,
    name:         ADMIN_NAME,
    email:        ADMIN_EMAIL,
    role:         USER_ROLES.PLATFORM_ADMIN,
    passwordHash: 'placeholder',
  });

  await admin.setPassword(ADMIN_PASSWORD);
  await admin.save();

  console.log(`Platform Admin created: ${ADMIN_EMAIL}`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
