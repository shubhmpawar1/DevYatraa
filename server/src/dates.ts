// Calendar-date helpers working on 'YYYY-MM-DD' strings in the server's local timezone.

export function today(): string {
  if (process.env.FAKE_TODAY) return process.env.FAKE_TODAY; // handy for testing missed days
  const d = new Date();
  return toISO(d.getFullYear(), d.getMonth(), d.getDate());
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parse(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function weekday(s: string): number {
  return parse(s).getUTCDay();
}

export function diffDays(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
}

export function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

/** Next Monday on or after the given date (Monday itself counts only if strictly after). */
export function nextMonday(s: string): string {
  let d = addDays(s, 1);
  while (weekday(d) !== 1) d = addDays(d, 1);
  return d;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function pretty(s: string): string {
  const d = parse(s);
  return `${DAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function dayName(n: number): string {
  return DAYS[n];
}

/** "early August 2027" style description used in the onboarding summary. */
export function roughMonth(s: string): string {
  const d = parse(s);
  const day = d.getUTCDate();
  const part = day <= 10 ? "early" : day <= 20 ? "mid" : "late";
  const full = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${part} ${full[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
