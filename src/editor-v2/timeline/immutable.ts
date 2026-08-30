const freezeValue = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value))
    return value;
  if (Array.isArray(value)) {
    for (const entry of value) freezeValue(entry);
    return Object.freeze(value);
  }
  for (const entry of Object.values(value)) freezeValue(entry);
  return Object.freeze(value);
};

export const cloneImmutable = <Value>(value: Value): Value =>
  freezeValue(structuredClone(value)) as Value;

export const freezeImmutable = <Value extends object>(value: Value): Value =>
  freezeValue(value) as Value;
