import { LoadingGrid } from "@/components/ui/states";

export default function LoadingCatalogue() {
  return (
    <div className="mx-auto max-w-[1400px] px-5 py-16 sm:px-10">
      <div className="mb-10 h-16 w-72 animate-pulse bg-ink/5" />
      <LoadingGrid count={6} />
    </div>
  );
}
