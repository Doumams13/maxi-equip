import Link from "next/link";
import { EmptyState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
      <EmptyState
        title="Page introuvable"
        description="Le contenu que vous cherchez n'existe pas ou a été déplacé."
        action={
          <Link href="/" className="text-sm font-semibold text-pine-700 hover:underline">
            Retour à l&apos;accueil
          </Link>
        }
      />
    </div>
  );
}
