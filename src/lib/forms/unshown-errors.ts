export type FieldError = { key: string; label: string; message: string };

/**
 * The errors no field on the page is showing, as "Label (message)". `shown` is
 * the text of every error the form drew; each one accounts for one error, so
 * two fields failing with the same words are not both hidden by one drawn.
 * Asking the page rather than the form's hiding rules means a field hidden for
 * the category, drawn without an error slot, or added later is caught the same way.
 */
export function unshownErrors(errors: FieldError[], shown: string[]): string[] {
  const left = [...shown];
  const unshown: string[] = [];
  for (const { label, message } of errors) {
    const at = left.indexOf(message);
    if (at >= 0) left.splice(at, 1);
    else unshown.push(`${label} (${message})`);
  }
  return unshown;
}
