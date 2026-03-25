export function TaskListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="animate-pulse opacity-0 animate-[fade-in_0s_ease-in_150ms_forwards]">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800"
        >
          {/* Checkbox */}
          <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
          {/* Title */}
          <div className="flex-1 space-y-1.5">
            <div
              className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded"
              style={{ width: `${55 + (i * 13) % 35}%` }}
            />
            {i % 3 === 0 && (
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
            )}
          </div>
          {/* Date badge */}
          {i % 2 === 0 && (
            <div className="w-14 h-4 bg-gray-100 dark:bg-gray-800 rounded flex-shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}
