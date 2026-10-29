export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Chargement de la page</span>
      <div className="space-y-2">
        <div className="h-8 w-64 max-w-full rounded bg-slate-200" />
        <div className="h-4 w-96 max-w-full rounded bg-slate-100" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-40 rounded-xl bg-slate-100" />
        <div className="h-40 rounded-xl bg-slate-100" />
      </div>
      <div className="h-56 rounded-xl bg-slate-100" />
    </div>
  );
}

export default function Loading() {
  return <PageSkeleton />;
}
