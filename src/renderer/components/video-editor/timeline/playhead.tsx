interface PlayheadProps {
  positionPixels: number;
}

export default function Playhead({ positionPixels }: PlayheadProps) {
  return (
    <div
      className="bg-playhead pointer-events-none absolute top-1 bottom-0 z-20 w-px"
      style={{ left: `${positionPixels}px` }}
    >
      <div className="bg-playhead absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full" />
    </div>
  );
}
