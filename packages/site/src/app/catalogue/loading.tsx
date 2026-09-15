import { LoadingGrid } from "@/components/ui/states";

export default function LoadingCatalogue() {
  return (
    <div className="mx-auto max-w-[1180px] px-[18px] py-16 sm:px-7">
      <div className="mb-8 h-10 w-48 animate-pulse rounded bg-surface-soft" />
      <LoadingGrid count={8} />
    </div>
  );
}
