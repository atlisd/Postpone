interface PlaceholderPageProps {
  title: string;
  description?: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{title}</h2>
      {description && (
        <p className="text-gray-600 dark:text-gray-400">{description}</p>
      )}
      <div className="mt-8 text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
        <p className="text-gray-400 dark:text-gray-500">Coming in Phase 2</p>
      </div>
    </div>
  );
}
