interface TrimPinProps {
  seconds: number;
  positionPixels: number;
  edge: 'start' | 'end';
}

export default function TrimPin({
  seconds,
  positionPixels,
  edge,
}: TrimPinProps) {
  const label =
    seconds < 10 ? `${Number(seconds.toFixed(1))}s` : `${Math.round(seconds)}s`;

  return (
    <div
      className="pointer-events-none absolute z-30 -translate-x-1/2"
      style={{ left: Math.max(positionPixels, 12), top: -13 }}
      title={`${label} trimmed from the ${edge}`}
    >
      <div className="bg-trim-pin flex size-6 -rotate-45 items-center justify-center rounded-full rounded-bl-none shadow-sm">
        <span className="rotate-45 text-xs font-semibold text-black/80">
          {label}
        </span>
      </div>
    </div>
  );
}
