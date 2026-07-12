import { env } from '../config/env.js';

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

export function welcomeEmail({ name, businessName }) {
  const subject = `Welcome to LoyaltyLedger, ${name}!`;
  const safeName = escapeHtml(name);
  const safeBusiness = escapeHtml(businessName);

  const text = [
    `Hi ${name},`,
    '',
    `Your LoyaltyLedger account for ${businessName} is ready.`,
    '',
    'You can now set up your loyalty program: create earn rules, define tiers,',
    'add your stores and staff, and start enrolling members at the POS.',
    '',
    `Log in: ${env.CLIENT_ORIGIN}/login`,
    '',
    '— The LoyaltyLedger Team',
  ].join('\n');

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1f2937;">
    <h1 style="font-size:22px;margin:0 0 16px;">Welcome to LoyaltyLedger 🎉</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">Hi ${safeName},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">
      Your account for <strong>${safeBusiness}</strong> is ready.
    </p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;">
      You can now set up your loyalty program &mdash; create earn rules, define tiers,
      add your stores and staff, and start enrolling members at the POS.
    </p>
    <a href="${env.CLIENT_ORIGIN}/login"
       style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 22px;border-radius:8px;">
      Go to your dashboard
    </a>
    <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:24px 0 0;">
      &mdash; The LoyaltyLedger Team
    </p>
  </div>`;

  return { subject, html, text };
}
