import { ImageIcon } from "lucide-react";
import { colaFormUrl } from "@/lib/cola/ids";
import { cn } from "@/lib/utils";

/**
 * A small image icon that opens TTB's printable form for an approval, which shows the approved label. It sits beside
 * the TTB ID link in every list of approvals. Only a 14-digit ID is linked, so free text never reaches the address.
 */
export function PrintableLink({ ttbId, className }: { ttbId: string; className?: string }) {
  if (!/^[0-9]{14}$/.test(ttbId)) return null;
  return (
    <a
      href={colaFormUrl(ttbId)}
      target="_blank"
      rel="noreferrer"
      title="Printable version"
      aria-label={`Printable version of ${ttbId}`}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <ImageIcon className="size-4" aria-hidden />
    </a>
  );
}
