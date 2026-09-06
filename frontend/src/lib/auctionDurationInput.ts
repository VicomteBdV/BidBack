const SECONDS_PER_HOUR = 3_600n;
const HOURS_PER_DAY = 24n;
const SECONDS_PER_DAY = HOURS_PER_DAY * SECONDS_PER_HOUR;

export type AuctionDurationInput = {
  days: string;
  hours: string;
  durationSeconds: string;
  roundedUp: boolean;
};

export function durationInputToSeconds(days: string, hours: string): string | null {
  const normalizedDays = days.trim();
  const normalizedHours = hours.trim();

  if (!/^\d+$/.test(normalizedDays) || !/^\d+$/.test(normalizedHours)) return null;

  const dayCount = BigInt(normalizedDays);
  const hourCount = BigInt(normalizedHours);

  if (hourCount >= HOURS_PER_DAY) return null;

  return (dayCount * SECONDS_PER_DAY + hourCount * SECONDS_PER_HOUR).toString();
}

export function durationSecondsToInput(durationSeconds: string): AuctionDurationInput | null {
  const normalizedSeconds = durationSeconds.trim();

  if (!/^\d+$/.test(normalizedSeconds)) return null;

  const seconds = BigInt(normalizedSeconds);
  const totalHours = (seconds + SECONDS_PER_HOUR - 1n) / SECONDS_PER_HOUR;
  const canonicalSeconds = totalHours * SECONDS_PER_HOUR;

  return {
    days: (totalHours / HOURS_PER_DAY).toString(),
    hours: (totalHours % HOURS_PER_DAY).toString(),
    durationSeconds: canonicalSeconds.toString(),
    roundedUp: canonicalSeconds !== seconds
  };
}
