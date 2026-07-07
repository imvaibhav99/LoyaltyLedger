export function calculateExpiry(durationType, duration) {
  const d = new Date();
  switch (durationType) {
    case 'DAILY':           d.setDate(d.getDate() + duration);            break;
    case 'MONTHLY':         d.setMonth(d.getMonth() + duration);          break;
    case 'QUARTERLY':       d.setMonth(d.getMonth() + duration * 3);      break;
    case 'HALF_YEARLY':     d.setMonth(d.getMonth() + 6 * duration);      break;
    case 'CALENDER_YEARLY': d.setFullYear(d.getFullYear() + duration);    break;
    case 'FINANCIAL_YEARLY': {
      // Indian financial year ends March 31
      const year = d.getMonth() >= 3
        ? d.getFullYear() + duration
        : d.getFullYear() + duration - 1;
      d.setFullYear(year, 2, 31);
      break;
    }
    default: throw new Error(`Unknown durationType: ${durationType}`);
  }
  return d;
}
