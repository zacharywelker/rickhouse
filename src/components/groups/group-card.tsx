import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { GroupSummary } from "@/lib/groups/queries";

/** A slight, deterministic stagger per stack position — mirrors the family cluster on the Gallery. */
const STACK_TILT = ["-rotate-3", "rotate-2", "-rotate-1"];

function CoverCollage({ thumbs }: { thumbs: string[] }) {
  if (thumbs.length === 0) {
    return <p className="px-6 text-center text-sm text-muted-foreground">Nothing added yet.</p>;
  }
  return (
    <div className="relative flex size-full items-center justify-center p-6">
      {thumbs.map((thumb, i) => (
        <div
          key={thumb}
          className={cn(
            "absolute inset-6 overflow-hidden rounded-md border border-border bg-card shadow-md",
            STACK_TILT[i % STACK_TILT.length],
          )}
          style={{ zIndex: i }}
        >
          <Image src={`/api/images/${thumb}`} alt="" fill unoptimized className="object-cover" />
        </div>
      ))}
    </div>
  );
}

export function GroupCard({ group }: { group: GroupSummary }) {
  return (
    <Link
      href={`/groups/${group.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/50"
    >
      <div className="relative flex aspect-[3/2] items-center justify-center overflow-hidden bg-muted/40">
        {group.coverImagePath ? (
          <Image src={`/api/images/${group.coverImagePath}`} alt="" fill unoptimized className="object-cover" />
        ) : (
          <CoverCollage thumbs={group.memberThumbs} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="text-lg font-medium leading-tight group-hover:text-accent">{group.name}</p>
        {group.description ? <p className="line-clamp-2 text-sm text-muted-foreground">{group.description}</p> : null}
        <p className="mt-auto pt-2 text-xs uppercase tracking-wide text-muted-foreground">
          {group.bottleCount} {group.bottleCount === 1 ? "bottle" : "bottles"}
        </p>
      </div>
    </Link>
  );
}
