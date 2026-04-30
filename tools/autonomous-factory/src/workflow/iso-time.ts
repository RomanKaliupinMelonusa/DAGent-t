/**
 * src/workflow/iso-time.ts — Pure ms→ISO formatter.
 *
 * Workflow-scoped ISO-8601 formatter. The determinism ESLint rule bans
 * the `Date` global outright (see [eslint.config.js](../../../eslint.config.js)),
 * but reducers like `applyFail` / `applyResetNodes` require ISO timestamps
 * stamped into `errorLog` entries. The workflow body sources millisecond
 * input from `Workflow.now()` (Temporal's deterministic clock) and pipes
 * it through this formatter.
 *
 * Output shape matches `new Date(ms).toISOString()` exactly:
 *   YYYY-MM-DDTHH:mm:ss.sssZ
 *
 * Negative epoch (pre-1970) and far-future inputs are supported. The
 * implementation is a pure function — no module-level state, no globals,
 * no `Date` reference — and therefore replay-safe.
 */

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Pad a non-negative integer with leading zeros to `width`. */
function pad(n: number, width: number): string {
  const s = String(n);
  if (s.length >= width) return s;
  return "0".repeat(width - s.length) + s;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Convert milliseconds since the Unix epoch to an ISO-8601 string in UTC.
 *
 * Algorithm: split `ms` into a calendar tuple by integer division, then
 * format. Avoids any reliance on `Date` while producing byte-identical
 * output for valid inputs in the supported range.
 */
export function formatIsoFromMs(ms: number): string {
  if (!Number.isFinite(ms)) {
    throw new RangeError(`formatIsoFromMs: non-finite input (${ms})`);
  }
  // Floor toward negative infinity so `-1` ms → 1969-12-31T23:59:59.999Z.
  const totalMs = Math.floor(ms);
  const msPerDay = 86_400_000;
  let days = Math.floor(totalMs / msPerDay);
  let remainder = totalMs - days * msPerDay;
  if (remainder < 0) {
    remainder += msPerDay;
    days -= 1;
  }

  const millis = remainder % 1000;
  const totalSeconds = Math.floor(remainder / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  // Civil-from-days: derive (year, month, day) from days-since-1970-01-01.
  // Algorithm adapted from Howard Hinnant's date library — handles the
  // proleptic Gregorian calendar over the full Number range.
  const z = days + 719_468;
  const era = Math.floor((z >= 0 ? z : z - 146_096) / 146_097);
  const doe = z - era * 146_097; // [0, 146096]
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365,
  ); // [0, 399]
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)); // [0, 365]
  const mp = Math.floor((5 * doy + 2) / 153); // [0, 11]
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1; // [1, 31]
  const month = mp < 10 ? mp + 3 : mp - 9; // [1, 12]
  const year = month <= 2 ? y + 1 : y;

  // Validation guards — defensive; the algorithm above is correct over
  // the JS Number range, but assertion-style checks document invariants.
  if (month < 1 || month > 12) {
    throw new RangeError(`formatIsoFromMs: derived invalid month ${month} from ${ms}`);
  }
  const dim = month === 2 && isLeapYear(year) ? 29 : DAYS_PER_MONTH[month - 1]!;
  if (day < 1 || day > dim) {
    throw new RangeError(`formatIsoFromMs: derived invalid day ${day} from ${ms}`);
  }

  const yearStr = year >= 0 && year <= 9999 ? pad(year, 4) : (year < 0 ? "-" + pad(-year, 6) : "+" + pad(year, 6));
  return `${yearStr}-${pad(month, 2)}-${pad(day, 2)}T${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(millis, 3)}Z`;
}
