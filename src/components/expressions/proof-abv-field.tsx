"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { abvToProof, proofToAbv } from "@/lib/bottles/proof";
import type { FieldValue } from "@/lib/forms/values";

/**
 * Proof and ABV, linked (SPEC #12). Enter either one and the other computes
 * itself; whichever you didn't type into goes read-only, so there is never a
 * moment where the two disagree. Clearing the one you were editing frees both
 * again.
 *
 * Only `proof` is a real column — ABV is derived in Postgres — so this is the
 * only field that submits.
 */
export function ProofAbvFields({
  idPrefix,
  value,
  onChange,
  error,
  name = "proof",
  hint = true,
  className = "sm:col-span-1",
  labelClassName,
}: {
  idPrefix: string;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  error?: string | undefined;
  /** The submitted field's name; null when a parent serialises the value itself. */
  name?: string | null;
  /** The "half of proof" line under ABV. */
  hint?: boolean;
  /** Wrapper classes for each of the two fields. */
  className?: string;
  labelClassName?: string;
}) {
  const proofValue = String(value ?? "");
  const [source, setSource] = React.useState<"proof" | "abv" | null>(proofValue === "" ? null : "proof");
  const [typedAbv, setTypedAbv] = React.useState("");

  // ABV shows what was typed into it while it is the one driving. Otherwise
  // it follows proof, which can also change from outside this component
  // (form reset, loading a different bottle).
  const abvText = source === "abv" ? typedAbv : proofToAbv(proofValue);

  const proofId = `${idPrefix}-proof`;
  const abvId = `${idPrefix}-abv`;
  const proofDisabled = source === "abv" && abvText !== "";
  const abvDisabled = source === "proof" && proofValue !== "";

  return (
    <>
      <div className={cn("flex flex-col gap-1.5", className)}>
        <Label htmlFor={proofId} className={labelClassName}>
          Proof
        </Label>
        <Input
          id={proofId}
          name={name ?? undefined}
          type="number"
          min={0}
          max={200}
          step={0.01}
          value={proofValue}
          disabled={proofDisabled}
          onChange={(e) => {
            const next = e.target.value;
            setSource(next === "" ? null : "proof");
            onChange(next);
          }}
          aria-invalid={error ? true : undefined}
          className={cn(error && "border-destructive")}
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <div className={cn("flex flex-col gap-1.5", className)}>
        <Label htmlFor={abvId} className={labelClassName}>
          ABV
        </Label>
        <Input
          id={abvId}
          type="number"
          min={0}
          max={100}
          step={0.01}
          value={abvText}
          disabled={abvDisabled}
          onChange={(e) => {
            const next = e.target.value;
            setSource(next === "" ? null : "abv");
            setTypedAbv(next);
            onChange(abvToProof(next));
          }}
        />
        {hint ? (
          <p className="text-xs text-muted-foreground">Half of proof, with a % sign. Calculates the other way too.</p>
        ) : null}
      </div>
    </>
  );
}
