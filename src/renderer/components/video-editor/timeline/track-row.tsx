import TrackLabel, { type TrackLabelProps } from './track-label';
import { TIMELINE_END_PADDING } from './timeline-constants';

export const TRACK_HEIGHT = 24;
export const VIDEO_TRACK_HEIGHT = 28;

type TrackRowProps = React.HTMLAttributes<HTMLDivElement> & {
  children?: React.ReactNode;
  height?: number;
  label?: TrackLabelProps;
};

export default function TrackRow({
  children = null,
  className = '',
  height = TRACK_HEIGHT,
  style,
  label,
  ...rest
}: TrackRowProps) {
  return (
    <div
      className={`flex shrink-0 ${className}`}
      style={{ height, paddingRight: TIMELINE_END_PADDING, ...style }}
      {...rest}
    >
      {label && <TrackLabel {...label} />}
      <div className="relative min-w-0 flex-1">{children}</div>
    </div>
  );
}
