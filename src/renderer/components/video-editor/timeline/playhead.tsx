interface PlayheadProps {
  positionPixels: number;
}

export default function Playhead({ positionPixels }: PlayheadProps) {
  return (
    <div
      className="bg-playhead shadow-playhead/60 pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 shadow-[0_0_6px]"
      style={{ left: `${positionPixels}px` }}
    >
      <div className="bg-playhead absolute -top-1 left-1/2 size-2.5 -translate-x-1/2 rotate-45 rounded-xs" />
    </div>
  );
}
