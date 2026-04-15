interface LoadingSkeletonProps {
  rows?: number;
  className?: string;
}

export function LoadingSkeleton({ rows = 3, className = '' }: LoadingSkeletonProps) {
  return (
    <div className={`space-y-3 ${className}`} aria-live="polite" aria-busy="true">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="skeleton h-12 w-full rounded-xl" />
      ))}
    </div>
  );
}
