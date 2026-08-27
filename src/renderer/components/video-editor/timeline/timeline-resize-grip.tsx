import { cn } from '@/renderer/lib/utils';

interface TimelineResizeGripProps {
  isResizing: boolean;
  onStartResize: (e: React.MouseEvent) => void;
}

export default function TimelineResizeGrip({
  isResizing,
  onStartResize,
}: TimelineResizeGripProps) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      onMouseDown={onStartResize}
      className={cn(
        'group flex h-1.5 shrink-0 cursor-ns-resize items-center justify-center',
        isResizing ? 'bg-primary/40' : 'hover:bg-primary/20'
      )}
    >
      <div
        className={cn(
          'h-0.5 w-8 rounded-full transition-colors',
          isResizing
            ? 'bg-primary'
            : 'bg-muted-foreground/30 group-hover:bg-muted-foreground/50'
        )}
      />
    </div>
  );
}
