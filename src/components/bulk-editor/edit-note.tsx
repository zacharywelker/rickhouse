/**
 * The short note under a value cell while it is being edited: who the edit is for ("2025A vintage · 2 bottles", "Label ·
 * 6 bottles", "Only this bottle"), and the key that steps to the next level. Clicking it steps on too. It never takes
 * focus from the cell being typed in, and it is not there at rest.
 */
export function EditNote({ text, keyName, onStep }: { text: string; keyName: "Option" | "Alt"; /** Absent where there is no choice to make (a new row's own vintage): no key is shown. */ onStep?: (step: 1 | -1) => void }) {
  return (
    <p data-edit-note="" role="status" className="absolute left-0 top-full z-30 mt-px flex items-center gap-2 whitespace-nowrap border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground">
      <span>{text}</span>
      {onStep ? (
      <button
        type="button"
        // Keep the focus where it is: stepping is not clicking away from the cell.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onStep(1)}
        aria-label={`Change what this edit changes (${keyName} and the down or up arrow)`}
        className="border border-border px-1 text-[10px] leading-4 text-foreground"
      >
        {keyName} ↕
      </button>
      ) : null}
    </p>
  );
}
