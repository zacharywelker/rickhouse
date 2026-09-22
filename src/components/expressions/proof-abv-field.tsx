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
}: {
  idPrefix: string;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  error?: string | undefined;
}) {
  const proofValue = String(value ?? "");
  const [source, setSource] = React.useState<"proof" | "abv" | null>(proofValue === "" ? null : "proof");
  const [abvText, setAbvText] = React.useState(() => proofToAbv(proofValue));

  // The proof value can change from outside this component too (form reset,
  // loading a different bottle). Follow it, unless ABV is the one driving.
  React.useEffect(() => {
    if (source !== "abv") setAbvText(proofToAbv(proofValue));
  }, [proofValue, source]);

  const proofId = `${idPrefix}-proof`;
  const abvId = `${idPrefix}-abv`;
  const proofDisabled = source === "abv" && abvText !== "";
  const abvDisabled = source === "proof" && proofValue !== "";

  return (
    <>
      <div className="flex flex-col gap-1.5 sm:col-span-1">
        <Label htmlFor={proofId}>Proof</Label>
        <Input
          id={proofId}
          name="proof"
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

      <div className="flex flex-col gap-1.5 sm:col-span-1">
        <Label htmlFor={abvId}>ABV</Label>
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
            setAbvText(next);
            onChange(abvToProof(next));
          }}
        />
        <p className="text-xs text-muted-foreground">Half of proof, with a % sign. Calculates the other way too.</p>
      </div>
    </>
  );
}
