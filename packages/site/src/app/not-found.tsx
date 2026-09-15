import Link from "next/link";
import { EmptyState } from "@/components/ui/states";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[900px] px-5 py-24 text-center sm:px-10">
      <EmptyState
        title="Cette page n'existe pas"
        description="Le contenu que vous cherchez n'existe pas ou a été déplacé."
        action={
          <Link href="/" className="font-display text-lg italic text-ember hover:underline">
            Retour à l&apos;accueil
          </Link>
        }
      />
    </div>
  );
}
