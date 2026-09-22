"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { setBottleFavoriteAction } from "@/app/(app)/bottles/actions";
import { cn } from "@/lib/utils";

/**
 * Replaces the old dedicated favorite checkbox in the edit form (SPEC M11):
 * a heart next to the name is both the indicator and the control.
 */
export function FavoriteToggle({ bottleId, isFavorite }: { bottleId: number; isFavorite: boolean }) {
  const router = useRouter();
  const [favorite, setFavorite] = React.useState(isFavorite);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => setFavorite(isFavorite), [isFavorite]);

  async function toggle() {
    const next = !favorite;
    setFavorite(next);
    setPending(true);
    await setBottleFavoriteAction(bottleId, next);
    setPending(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={pending}
      aria-pressed={favorite}
      aria-label={favorite ? "Remove from favorites" : "Mark as favorite"}
      className="rounded p-1 text-muted-foreground transition-colors hover:text-accent disabled:opacity-60"
    >
      <Heart className={cn("size-6", favorite && "fill-accent text-accent")} />
    </button>
  );
}
