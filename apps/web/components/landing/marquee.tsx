// Infinite horizontal scroller: the track holds two identical halves and
// slides -50%, so the loop is seamless. Edge-fade mask + pause on hover.
// Pure CSS (globals.css), renders on the server, respects reduced motion.
export function Marquee({
  children,
  reverse = false,
  duration = 40,
  className = "",
}: {
  children: React.ReactNode;
  reverse?: boolean;
  duration?: number;
  className?: string;
}) {
  return (
    <div className={`edge-fade overflow-hidden ${className}`}>
      <div
        className={`marquee-track flex w-max ${reverse ? "marquee-reverse" : ""}`}
        style={{ "--marquee-duration": `${duration}s` } as React.CSSProperties}
      >
        <div className="flex shrink-0 items-center gap-4 pr-4">{children}</div>
        <div className="flex shrink-0 items-center gap-4 pr-4" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}
