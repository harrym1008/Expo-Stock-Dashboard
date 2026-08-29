/**
 * Formats elapsed time since a timestamp into human-readable text.
 * Examples:
 * - 0-1s: '0 sec ago' or '1 sec ago'
 * - 2-59s: '2 secs ago', '30 secs ago'
 * - 1m 40s: '1 min 40 sec ago'
 * - 2h 15m: '2 hrs 15 mins ago'
 * - >24h: '24 hrs ago' (hours as max unit)
 */
export function formatTimeAgo(timestamp) {
  if (!timestamp || typeof timestamp !== 'number' || timestamp <= 0) {
    return 'recently';
  }

  const now = Date.now();
  const diffSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));

  if (diffSeconds < 1) {
    return '0 sec ago';
  }

  if (diffSeconds === 1) {
    return '1 sec ago';
  }

  if (diffSeconds < 60) {
    return `${diffSeconds} secs ago`;
  }

  const days = Math.floor(diffSeconds / 86400);
  const hours = Math.floor((diffSeconds % 86400) / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;

  // >= 1 day
  if (days > 0) {
    const dayText = days === 1 ? '1 day' : `${days} days`;
    if (hours > 0) {
      const hrText = hours === 1 ? '1 hr' : `${hours} hrs`;
      return `${dayText} ${hrText} ago`;
    }
    return `${dayText} ago`;
  }

  // Under 1 day
  if (hours > 0) {
    const hrText = hours === 1 ? '1 hr' : `${hours} hrs`;
    if (minutes > 0) {
      const minText = minutes === 1 ? '1 min' : `${minutes} mins`;
      return `${hrText} ${minText} ago`;
    }
    return `${hrText} ago`;
  }

  // Under 1 hour
  const minText = minutes === 1 ? '1 min' : `${minutes} mins`;
  if (seconds > 0) {
    const secText = seconds === 1 ? '1 sec' : `${seconds} sec`;
    return `${minText} ${secText} ago`;
  }

  return `${minText} ago`;
}
