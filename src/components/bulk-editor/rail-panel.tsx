"use client";

import * as React from "react";
import Image from "next/image";
import { categoryColor } from "@/lib/bottles/category-palette";
import type { Rail, RailFact } from "@/lib/bulk-editor/rail";
import type { Shelf } from "@/lib/bulk-editor/shelf";
import { cn } from "@/lib/utils";

/** The photo frame's flat offset shadow and the darker floor a cutout stands on (DESIGN.md §4.2), as the Collection's gallery draws them. */
const FRAME_SHADOW = "shadow-[2px_2px_0_rgb(20_33_61/0.18)]";
const FLOOR_INK = "#14213D"; // also the text on a light frame: the frame is the same colour in both themes, so the text cannot follow the theme

/**
 * The photo in a frame in the category's colour, which is the one place the rail uses colour. A cutout stands on a floor;
 * another photo fills a mat; with no photo the frame says so (the category's name stays in the text beside it).
 */
function Frame({ category, photo }: { category: string; photo: Rail["photo"] }) {
  const color = categoryColor(category || "other");
  const standing = photo !== null && (photo.isCutout ?? true);
  return (
    <div className={cn("relative aspect-[3/4] w-28 shrink-0 overflow-hidden border border-foreground", FRAME_SHADOW, photo !== null && !standing && "p-1.5")} style={{ backgroundColor: color.hex }}>
      {photo !== null && standing ? (
        <>
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-[24%] border-t border-foreground" style={{ backgroundColor: `color-mix(in srgb, ${color.hex} 78%, ${FLOOR_INK})` }} />
          <div className="absolute inset-x-1.5 bottom-[7%] top-[9%]">
            <Image src={`/api/images/${photo.path}`} alt="" fill unoptimized className="object-contain object-bottom" />
          </div>
        </>
      ) : photo !== null ? (
        <div className="relative size-full overflow-hidden">
          <Image src={`/api/images/${photo.path}`} alt="" fill unoptimized className="object-cover" />
        </div>
      ) : (
        <div className={cn("flex size-full items-center justify-center px-2 text-center text-[11px] font-medium", color.dark ? "text-white" : "text-[#14213D]")}>No photo</div>
      )}
    </div>
  );
}

function Facts({ title, facts }: { title: string; facts: RailFact[] }) {
  if (facts.length === 0) return null;
  return (
    <section>
      <h3 className="border-b border-border pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        {facts.map((fact) => (
          <React.Fragment key={fact.label}>
            <dt className="text-muted-foreground">{fact.label}</dt>
            <dd className="min-w-0 text-right tabular-nums">
              <span className="break-words">{fact.value}</span>
              {fact.source === "own" ? (
                <span className="block text-xs text-muted-foreground">
                  This bottle&rsquo;s own{fact.alongside ? `; the label says ${fact.alongside}` : ""}
                </span>
              ) : null}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </section>
  );
}

/**
 * What the person already has from the brand and label: counts, ordinals and the brand's labels. Plain words; the
 * numbers being true is the point. Worked out from the whole collection, never from what the sheet is filtered to.
 */
function OnYourShelf({ shelf }: { shelf: Shelf }) {
  return (
    <section>
      <h3 className="border-b border-border pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">On your shelf</h3>
      {shelf.badge ? (
        <div className="mt-1.5">
          <span className="inline-block border border-foreground px-1.5 text-[11px] font-semibold uppercase leading-5 tracking-wide">{shelf.badge.text}</span>
          <p className="mt-1 text-sm">{shelf.badge.note}</p>
        </div>
      ) : null}
      {shelf.summary ? <p className={cn("text-sm", shelf.badge ? "mt-2 text-muted-foreground" : "mt-1.5")}>{shelf.summary}</p> : null}
      {shelf.lines.map((line) => (
        <p key={line} className="mt-1 text-sm font-medium">
          {line}
        </p>
      ))}
      {shelf.labels.length > 0 ? (
        <ul className="mt-2 text-sm">
          {shelf.labels.map((l) => (
            <li key={`${l.isNew ? "new:" : ""}${l.name}`} className={cn("flex items-baseline justify-between gap-3 px-1.5 py-0.5", l.chosen && "bg-muted font-medium")} aria-current={l.chosen || undefined}>
              <span className="min-w-0 truncate">
                {l.name}
                {l.isNew ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">new</span> : null}
              </span>
              <span className="shrink-0 tabular-nums">
                {l.owned}
                {l.unsaved > 0 ? <span className="ml-1 text-xs font-normal text-muted-foreground">+ {l.unsaved} not saved</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {shelf.more > 0 ? <p className="mt-1 px-1.5 text-sm text-muted-foreground">+{shelf.more} more {shelf.more === 1 ? "label" : "labels"}</p> : null}
    </section>
  );
}

/**
 * The rail's contents: display only, nothing in it can be typed into. It follows the row the cursor is in. It is not a
 * live region: it changes on every cell move, so a screen reader is not told of it. The sheet carries each row's
 * information for anyone who is not looking at the rail.
 */
export const RailContent = React.memo(function RailContent({ rail, shelf, reach }: { rail: Rail | null; shelf: Shelf | null; reach: number | null }) {
  if (rail === null) return <p className="text-sm text-muted-foreground">Click a cell to see its row here.</p>;
  const name = rail.label || rail.brand;
  const kindText = rail.kind === "new" ? "New row" : rail.kind === "label" ? `Label · ${rail.bottleCount ?? 0} ${rail.bottleCount === 1 ? "bottle" : "bottles"}` : "Bottle";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <Frame category={rail.category} photo={rail.photo} />
        <div className="min-w-0 pt-0.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{kindText}</p>
          <p className="mt-1 break-words text-sm text-muted-foreground">{rail.label ? rail.brand : ""}</p>
          <p className={cn("break-words text-lg font-semibold leading-snug", name === "" && "text-muted-foreground")}>{name || "Nothing chosen yet"}</p>
          {rail.category ? <p className="mt-1 text-sm text-muted-foreground">{rail.category}</p> : null}
        </div>
      </div>
      {reach !== null ? (
        <p className="border border-foreground px-2 py-1.5 text-sm">
          Editing this changes {reach} {reach === 1 ? "bottle" : "bottles"}: it belongs to the label.
        </p>
      ) : null}
      {shelf ? <OnYourShelf shelf={shelf} /> : null}
      <Facts title="From the label" facts={rail.facts.filter((f) => f.source !== "bottle")} />
      <Facts title="This bottle" facts={rail.facts.filter((f) => f.source === "bottle")} />
      {rail.blank.length > 0 ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Still blank: </span>
          {rail.blank.join(", ")}
        </p>
      ) : null}
    </div>
  );
});
