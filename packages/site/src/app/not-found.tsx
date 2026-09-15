import Link from "next/link";
import { EmptyState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[1180px] px-[18px] py-24 text-center sm:px-7">
      <EmptyState
        title="Cette page n'existe pas"
        description="Le contenu que vous cherchez n'existe pas ou a été déplacé."
        action={
          <Link href="/" className="text-sm font-semibold text-forest hover:underline">
            Retour à l&apos;accueil
          </Link>
        }
      />
    </div>
  );
}

