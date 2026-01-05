// ============================================================
// CRON PARSER
// Parse and evaluate cron expressions
// ============================================================

// ============================================================
// CRON FIELD DEFINITIONS
// ============================================================

interface CronField {
  min: number;
  max: number;
  names?: Record<string, number>;
}

const FIELDS: Record<string, CronField> = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: {
    min: 1, max: 12,
    names: { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
  },
  dayOfWeek: {
    min: 0, max: 6,
    names: { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
  }
};

// ============================================================
// PARSED CRON
// ============================================================

export interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
}

// ============================================================
// CRON PARSER
// ============================================================

export function parseCron(expression: string): ParsedCron {
  // Handle common aliases
  const aliases: Record<string, string> = {
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *'
  };

  const normalized = aliases[expression.toLowerCase()] || expression;
  const parts = normalized.trim().split(/\s+/);

  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${parts.length}`);
  }

  return {
    minutes: parseField(parts[0], FIELDS.minute),
    hours: parseField(parts[1], FIELDS.hour),
    daysOfMonth: parseField(parts[2], FIELDS.dayOfMonth),
    months: parseField(parts[3], FIELDS.month),
    daysOfWeek: parseField(parts[4], FIELDS.dayOfWeek)
  };
}

function parseField(field: string, def: CronField): Set<number> {
  const values = new Set<number>();

  // Handle list (comma-separated)
  const parts = field.split(',');

  for (const part of parts) {
    // Handle step values (*/5, 1-10/2)
    const [range, stepStr] = part.split('/');
    const step = stepStr ? parseInt(stepStr, 10) : 1;

    if (range === '*') {
      // All values
      for (let i = def.min; i <= def.max; i += step) {
        values.add(i);
      }
    } else if (range.includes('-')) {
      // Range (1-5)
      const [startStr, endStr] = range.split('-');
      const start = parseValue(startStr, def);
      const end = parseValue(endStr, def);

      for (let i = start; i <= end; i += step) {
        values.add(i);
      }
    } else {
      // Single value
      values.add(parseValue(range, def));
    }
  }

  return values;
}

function parseValue(value: string, def: CronField): number {
  // Check for named values
  const lower = value.toLowerCase();
  if (def.names && lower in def.names) {
    return def.names[lower];
  }

  const num = parseInt(value, 10);
  if (isNaN(num) || num < def.min || num > def.max) {
    throw new Error(`Invalid cron value: ${value} (expected ${def.min}-${def.max})`);
  }

  return num;
}

// ============================================================
// CRON MATCHING
// ============================================================

export function matchesCron(cron: ParsedCron, date: Date): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1;
  const dayOfWeek = date.getDay();

  return (
    cron.minutes.has(minute) &&
    cron.hours.has(hour) &&
    cron.months.has(month) &&
    // Day matching: either day of month OR day of week
    (cron.daysOfMonth.has(dayOfMonth) || cron.daysOfWeek.has(dayOfWeek))
  );
}

// ============================================================
// NEXT OCCURRENCE
// ============================================================

export function getNextOccurrence(cron: ParsedCron, from: Date = new Date()): Date {
  // Start from the next minute
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  // Search for next matching time (max 2 years ahead)
  const maxIterations = 365 * 24 * 60 * 2;
  let iterations = 0;

  while (iterations < maxIterations) {
    if (matchesCron(cron, next)) {
      return next;
    }

    // Advance by 1 minute
    next.setMinutes(next.getMinutes() + 1);
    iterations++;
  }

  throw new Error('Could not find next occurrence within 2 years');
}

// ============================================================
// HUMAN-READABLE DESCRIPTION
// ============================================================

export function describeCron(expression: string): string {
  // Handle aliases
  const aliasDescriptions: Record<string, string> = {
    '@yearly': 'Once a year at midnight on January 1st',
    '@annually': 'Once a year at midnight on January 1st',
    '@monthly': 'Once a month at midnight on the 1st',
    '@weekly': 'Once a week at midnight on Sunday',
    '@daily': 'Once a day at midnight',
    '@midnight': 'Once a day at midnight',
    '@hourly': 'Once an hour at the start of the hour'
  };

  if (aliasDescriptions[expression.toLowerCase()]) {
    return aliasDescriptions[expression.toLowerCase()];
  }

  try {
    const cron = parseCron(expression);
    const parts: string[] = [];

    // Minutes
    if (cron.minutes.size === 60) {
      parts.push('every minute');
    } else if (cron.minutes.size === 1) {
      const minute = Array.from(cron.minutes)[0];
      parts.push(`at minute ${minute}`);
    } else {
      parts.push(`at minutes ${Array.from(cron.minutes).join(', ')}`);
    }

    // Hours
    if (cron.hours.size === 24) {
      parts.push('every hour');
    } else if (cron.hours.size === 1) {
      const hour = Array.from(cron.hours)[0];
      parts.push(`at ${hour}:00`);
    } else {
      parts.push(`during hours ${Array.from(cron.hours).join(', ')}`);
    }

    // Days
    if (cron.daysOfMonth.size < 31 && cron.daysOfWeek.size === 7) {
      parts.push(`on day ${Array.from(cron.daysOfMonth).join(', ')} of the month`);
    } else if (cron.daysOfWeek.size < 7 && cron.daysOfMonth.size === 31) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const days = Array.from(cron.daysOfWeek).map(d => dayNames[d]);
      parts.push(`on ${days.join(', ')}`);
    }

    // Months
    if (cron.months.size < 12) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const months = Array.from(cron.months).map(m => monthNames[m - 1]);
      parts.push(`in ${months.join(', ')}`);
    }

    return parts.join(' ');
  } catch {
    return 'Invalid cron expression';
  }
}

// ============================================================
// VALIDATION
// ============================================================

export function isValidCron(expression: string): boolean {
  try {
    parseCron(expression);
    return true;
  } catch {
    return false;
  }
}
