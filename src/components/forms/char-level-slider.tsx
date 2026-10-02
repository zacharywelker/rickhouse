"use client";

import * as React from "react";
import { CharStave } from "@/components/char/char-stave";
import { MarginTag } from "@/components/ui/margin-tag";
import { CHAR_LEVELS } from "@/db/schema";
import { CHAR_LEVEL_DETAILS, CHAR_LEVEL_UNKNOWN, isCharLevel } from "@/lib/char-levels";
import { TAPE_FONTS } from "@/lib/tape-fonts";
import { cn } from "@/lib/utils";

/**
 * The Char Level field in the label form: a stave cut into six sections, with
 * Unknown as a strip of painter's tape off to the left, off the scale.
 *
 * The visible stave only handles the pointer. A visually hidden native range
 * input owns keyboard, focus and the spoken value, so arrow keys still step
 * through the stops and screen readers hear "Char 4, alligator char…".
 */
export function CharLevelSlider({
  id,
  name,
  label,
  stops,
  value,
  onChange,
  invalid,
}: {
  id: string;
  name?: string | undefined;
  label: string;
  /** Unknown first, then the CHAR_LEVELS in order. */
  stops: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean | undefined;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const staveRef = React.useRef<HTMLDivElement>(null);

  const found = stops.findIndex((s) => s.value === value);
  const index = found === -1 ? 0 : found;
  const current = stops[index]!;
  const level = isCharLevel(current.value) ? current.value : null;
  const detail = level ? CHAR_LEVEL_DETAILS[level] : null;
  const unset = level === null;

  // Left of the stave is the tape; along it, whichever sixth the pointer is over.
  const pick = (clientX: number) => {
    const rect = staveRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = clientX < rect.left ? 0 : Math.min(stops.length - 1, Math.floor(((clientX - rect.left) / rect.width) * CHAR_LEVELS.length) + 1);
    if (stops[next] && next !== index) onChange(stops[next].value);
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "grid cursor-pointer touch-none select-none grid-cols-[3rem_minmax(0,1fr)] gap-x-2.5 gap-y-2 pt-2.5 outline-offset-[6px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
          invalid && "outline outline-1 outline-destructive",
        )}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e.clientX);
          inputRef.current?.focus({ preventScroll: true });
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.clientX);
        }}
      >
        <div className="grid items-center">
          <span
            aria-hidden="true"
            className={cn(
              "block h-[22px] bg-tape-neutral text-center text-[15px] leading-[22px] text-tape-ink transition-[opacity,transform] duration-150 motion-reduce:transition-none",
              TAPE_FONTS[1]?.className,
              unset ? "-translate-y-px -rotate-[5deg] opacity-100 outline outline-2 outline-offset-[3px] outline-foreground" : "-rotate-3 opacity-55",
            )}
            style={{ clipPath: "polygon(0 0, 100% 0, 97% 22%, 100% 46%, 96% 70%, 100% 100%, 0 100%, 4% 76%, 0 52%, 3% 26%)" }}
          >
            ?
          </span>
        </div>
        <div ref={staveRef}>
          <CharStave level={level} thickness={40} caret />
        </div>

        <span aria-hidden="true" className={cn("text-center text-xs", unset ? "font-semibold text-foreground" : "text-muted-foreground")}>
          {stops[0]?.label}
        </span>
        <div aria-hidden="true" className="grid grid-cols-6">
          {stops.slice(1).map((s, i) => (
            <span
              key={s.value}
              className={cn("whitespace-nowrap text-center text-xs", i + 1 === index ? "font-semibold text-foreground" : "text-muted-foreground")}
            >
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <div aria-hidden="true" className="flex flex-col gap-1.5">
        <dl className="flex min-h-10 flex-wrap items-end gap-x-7 gap-y-1">
          {detail ? (
            <>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Level</dt>
                <dd className="text-base">{current.label}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Flame</dt>
                <dd className="text-base tabular-nums">{detail.flame}</dd>
              </div>
              {level === "4" ? (
                <MarginTag seed={4} className="ml-auto self-center">
                  alligator!
                </MarginTag>
              ) : null}
            </>
          ) : (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="text-base text-muted-foreground">{current.label}</dd>
            </div>
          )}
        </dl>
        <p className="text-xs text-muted-foreground">{detail ? detail.line : CHAR_LEVEL_UNKNOWN.line}</p>
      </div>

      <input
        ref={inputRef}
        id={id}
        type="range"
        min={0}
        max={stops.length - 1}
        step={1}
        value={index}
        onChange={(e) => onChange(stops[Number(e.target.value)]!.value)}
        aria-label={label}
        aria-valuetext={detail ? detail.spoken : CHAR_LEVEL_UNKNOWN.spoken}
        aria-invalid={invalid || undefined}
        className="sr-only"
      />
      {name ? <input type="hidden" name={name} value={current.value} /> : null}
    </div>
  );
}
