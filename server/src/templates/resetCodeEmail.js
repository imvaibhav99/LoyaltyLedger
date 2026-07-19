const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

export function resetCodeEmail({ name, code }) {
  const subject = 'Your LoyaltyLedger password reset code';
  const safeName = escapeHtml(name);

  const text = [
    `Hi ${name},`,
    '',
    `Your password reset code is: ${code}`,
    '',
    'It expires in 10 minutes. If you did not request a reset, you can ignore this email — your password will not change.',
    '',
    '— The LoyaltyLedger Team',
  ].join('\n');

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1f2937;">
    <h1 style="font-size:20px;margin:0 0 16px;">Password reset code</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 12px;">Hi ${safeName},</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;">
      Use this code to reset your LoyaltyLedger password:
    </p>
    <div style="display:inline-block;background:#f3f4f6;border-radius:10px;padding:14px 28px;font-size:30px;font-weight:700;letter-spacing:10px;color:#111827;">
      ${code}
    </div>
    <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:20px 0 0;">
      The code expires in 10 minutes. If you didn't request a reset, you can ignore
      this email &mdash; your password will not change.
    </p>
    <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:24px 0 0;">
      &mdash; The LoyaltyLedger Team
    </p>
  </div>`;

  return { subject, html, text };
}
