export const TRACK_HEIGHT = 24;
export const VIDEO_TRACK_HEIGHT = 28;

type TrackRowProps = React.HTMLAttributes<HTMLDivElement> & {
  children?: React.ReactNode;
  height?: number;
};

export default function TrackRow({
  children = null,
  className = '',
  height = TRACK_HEIGHT,
  style,
  ...rest
}: TrackRowProps) {
  return (
    <div
      className={`shrink-0 ${className}`}
      style={{ height, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
