import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const transporter = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

export async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    console.log(`[mailer] SMTP not configured — skipped "${subject}" to ${to}`);
    return false;
  }
  try {
    const info = await transporter.sendMail({ from: env.MAIL_FROM, to, subject, html, text });
    return info.accepted?.length > 0;
  } catch (err) {
    console.error(`[mailer] failed to send "${subject}" to ${to}:`, err.message);
    return false;
  }
}
