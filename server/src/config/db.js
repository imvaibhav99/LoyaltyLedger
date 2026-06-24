import mongoose from 'mongoose';
import { env } from './env.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3000;

export async function connectDB() {
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const conn = await mongoose.connect(env.MONGODB_URI);
      console.log(`MongoDB connected: ${conn.connection.host}`);
      return;
    } catch (err) {
      attempt++;
      if (attempt >= MAX_RETRIES) {
        console.error(`MongoDB connection failed after ${MAX_RETRIES} attempts.`);
        throw err;
      }
      console.warn(`MongoDB connection attempt ${attempt} failed. Retrying in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

