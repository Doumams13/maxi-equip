import { LoadingGrid } from "@/components/ui/states";

export default function LoadingCatalogue() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-ink-100" />
      <LoadingGrid count={6} />
    </div>
  );
}
