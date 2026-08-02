export default function DashboardSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8 animate-pulse" aria-busy="true" aria-label="Cargando dashboard">
      {/* Hero skeleton */}
      <div className="bg-white rounded-v2-2xl border border-v2-border p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start gap-5 sm:gap-8">
          <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-v2-neutral-100 shrink-0 self-center sm:self-start" />
          <div className="flex-1 space-y-3 text-center sm:text-left">
            <div className="h-8 bg-v2-neutral-100 rounded-v2-lg w-64 mx-auto sm:mx-0" />
            <div className="h-5 bg-v2-neutral-100 rounded-v2-md w-40 mx-auto sm:mx-0" />
            <div className="flex gap-2 justify-center sm:justify-start pt-2">
              <div className="h-7 bg-v2-neutral-100 rounded-full w-36" />
              <div className="h-7 bg-v2-neutral-100 rounded-full w-28" />
              <div className="h-7 bg-v2-neutral-100 rounded-full w-32" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick stats skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-v2-xl border border-v2-border p-4">
            <div className="h-4 bg-v2-neutral-100 rounded w-16 mb-3" />
            <div className="h-6 bg-v2-neutral-100 rounded w-12" />
          </div>
        ))}
      </div>

      {/* Main content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-v2-2xl border border-v2-border p-6 space-y-4">
            <div className="h-5 bg-v2-neutral-100 rounded w-32" />
            <div className="h-6 bg-v2-neutral-100 rounded w-3/4" />
            <div className="h-4 bg-v2-neutral-100 rounded w-full" />
            <div className="h-4 bg-v2-neutral-100 rounded w-2/3" />
          </div>
        </div>
        <div className="space-y-5">
          <div className="bg-white rounded-v2-2xl border border-v2-border p-6 space-y-3">
            <div className="h-5 bg-v2-neutral-100 rounded w-28" />
            <div className="h-8 bg-v2-neutral-100 rounded w-16" />
            <div className="h-3 bg-v2-neutral-100 rounded w-40" />
          </div>
        </div>
      </div>
    </div>
  );
}
