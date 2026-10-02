export function formatTime(seconds: number): string {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(value / 60);
  return `${minutes.toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}

export interface TimeLabelProps {
  seconds: number;
  className?: string;
}

export function TimeLabel({ seconds, className = '' }: TimeLabelProps) {
  return <span className={`ui-time ${className}`.trim()}>{formatTime(seconds)}</span>;
}
