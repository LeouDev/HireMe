// Turns Supabase/PostgREST/Postgres errors into messages that are safe and useful to show people.
// Our database functions raise human-readable messages; raw constraint errors are translated here.
interface PgLikeError {
  message?: string;
  code?: string;
  details?: string | null;
  status?: number;
}

const TECHNICAL = /violates|relation |column |syntax|function .*does not exist|null value|invalid input syntax|JWT|PGRST/i;

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  const e = error as PgLikeError;
  const message = e.message ?? '';
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return 'Network error. Check your connection and try again.';
  switch (e.code) {
    case '23505':
      if (/slug/.test(message)) return 'That page address is already taken. Choose another.';
      return TECHNICAL.test(message) ? 'This already exists.' : message;
    case '23P01':
      return 'That time slot is no longer available. Choose another time.';
    case '23514':
      return TECHNICAL.test(message) ? 'Some of the values entered are not valid.' : message;
    case '23503':
      return 'This item is linked to other records and cannot be removed.';
    case '42501':
      return /permission denied|row-level security/i.test(message) ? 'You do not have permission to do that.' : message;
    case 'PGRST116':
      return 'Not found.';
    case '54000':
      return message;
  }
  if (/Invalid login credentials/i.test(message)) return 'Incorrect email or password.';
  if (/Email not confirmed/i.test(message)) return 'Confirm your email address first. Check your inbox for the link.';
  if (/User already registered/i.test(message)) return 'An account with this email already exists. Try signing in.';
  if (/rate limit/i.test(message)) return 'Too many attempts. Wait a moment and try again.';
  if (!message || TECHNICAL.test(message)) return fallback;
  return message;
}
