// Tiny inline SVG sparkline. No deps.
export function Sparkline({
  values, width = 96, height = 28, color = 'currentColor', max = 100,
}: { values: number[]; width?: number; height?: number; color?: string; max?: number }) {
  if (values.length === 0) return <svg width={width} height={height} />;
  const step = width / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${i * step},${height - (Math.min(max, v) / max) * height}`).join(' ');
  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <polyline
        points={`0,${height} ${pts} ${width},${height}`}
        fill="url(#sparkFill)"
        stroke="none"
      />
    </svg>
  );
}
