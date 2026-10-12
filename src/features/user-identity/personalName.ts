export interface PersonalNameSources {
  profileFullName?: string | null;
  userMetadata?: Record<string, unknown> | null;
  email?: string | null;
  businessNames?: Array<string | null | undefined>;
}

const MAX_NAME_LENGTH = 80;

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function asValidName(value: unknown, blocked: Set<string>): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  if (name.includes('@')) return null;
  if (!/\p{L}/u.test(name)) return null;
  if (blocked.has(normalize(name))) return null;
  return name;
}

// Order matters: the profile is user-owned data; auth metadata comes from the identity provider.
export function resolvePersonalName({
  profileFullName,
  userMetadata,
  email,
  businessNames = [],
}: PersonalNameSources): string | null {
  const blocked = new Set<string>();
  for (const b of businessNames) if (b && b.trim()) blocked.add(normalize(b));
  if (email) {
    blocked.add(normalize(email));
    blocked.add(normalize(email.split('@')[0]));
  }

  const candidates: unknown[] = [
    profileFullName,
    userMetadata?.full_name,
    userMetadata?.name,
  ];
  for (const candidate of candidates) {
    const name = asValidName(candidate, blocked);
    if (name) return name;
  }
  return null;
}

export type DayPart = 'morning' | 'afternoon' | 'evening';

export function dayPartFor(hour: number): DayPart {
  if (hour < 7) return 'evening';
  if (hour < 13) return 'morning';
  if (hour < 20) return 'afternoon';
  return 'evening';
}
