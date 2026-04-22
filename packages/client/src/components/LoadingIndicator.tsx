interface LoadingIndicatorProps {
  className?: string;
  label?: string;
}

export function LoadingIndicator({
  className,
  label = "Loading",
}: LoadingIndicatorProps) {
  const classes = ["loading-indicator", className].filter(Boolean).join(" ");

  return (
    <div className={classes} role="status" aria-label={label}>
      <div className="loading-indicator__bars" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
