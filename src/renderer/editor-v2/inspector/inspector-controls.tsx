import React from 'react';

interface NumberControlProps {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step?: number;
  onChange: (value: number) => void;
}

export function NumberControl({
  label,
  value,
  minimum,
  maximum,
  step = 1,
  onChange,
}: NumberControlProps) {
  return (
    <label className="block space-y-1">
      <span className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {Number(value.toFixed(2))}
        </span>
      </span>
      <input
        aria-label={label}
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        className="accent-primary w-full"
        onChange={event => onChange(Number(event.target.value))}
      />
    </label>
  );
}

interface SelectControlProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function SelectControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectControlProps<T>) {
  return (
    <label className="block space-y-1 text-xs">
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        className="border-input bg-background h-8 w-full rounded-md border px-2"
        onChange={event => onChange(event.target.value as T)}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ToggleControlProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleControl({
  label,
  checked,
  onChange,
}: ToggleControlProps) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span>{label}</span>
      <input
        aria-label={label}
        type="checkbox"
        checked={checked}
        className="accent-primary size-4"
        onChange={event => onChange(event.target.checked)}
      />
    </label>
  );
}
