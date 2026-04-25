import type { ProcessStatus } from '../../types';
import { cn } from '../../utils/cn';

const MAP: Record<ProcessStatus, string> = {
  idle: 'dot dot-idle',
  starting: 'dot dot-starting',
  running: 'dot dot-running',
  ready: 'dot dot-running',
  stopped: 'dot dot-idle',
  crashed: 'dot dot-crashed',
};

export function StatusDot({ status, className }: { status: ProcessStatus; className?: string }) {
  return <span className={cn(MAP[status], className)} aria-label={status} />;
}
