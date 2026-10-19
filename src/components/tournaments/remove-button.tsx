"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BracketActions } from "./use-bracket-actions";

/** A draft only: takes this one bottle out of the tournament at once (no confirmation; the other flights keep their shape). */
export function RemoveButton({ entryId, name, id, actions, onRemove }: { entryId: number; name: string; id: string; actions: BracketActions; onRemove: () => void }) {
  return (
    <Button
      id={id}
      type="button"
      variant="ghost"
      className="size-11 p-0"
      aria-label={`Remove ${name} from the tournament`}
      title="Remove from the tournament"
      disabled={actions.pending}
      onClick={() => {
        onRemove();
        actions.remove(entryId);
      }}
    >
      <X className="size-4" aria-hidden />
    </Button>
  );
}
