import cron from 'node-cron';
import { expireUserPoints } from './pointExpiry.js';
import { downgradeTiers } from './tierDowngrade.js';

export function startJobs() {
  cron.schedule('5 0 * * *', () => {
    console.log('[cron] pointExpiry starting');
    expireUserPoints().catch(console.error);
  });
  cron.schedule('10 0 * * *', () => {
    console.log('[cron] tierDowngrade starting');
    downgradeTiers().catch(console.error);
  });
  console.log('[cron] jobs registered: pointExpiry (00:05), tierDowngrade (00:10)');
}
