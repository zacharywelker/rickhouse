/** A generated password, shown once, set apart so it's easy to copy. */
export function TemporaryPassword({ label, password }: { label: string; password: string }) {
  return (
    <div role="status" className="flex flex-col gap-1 border-l-2 border-accent pl-3 text-sm">
      <span>{label}</span>
      <code className="select-all font-mono text-base tracking-wide text-foreground">{password}</code>
      <span className="text-xs text-muted-foreground">
        Shown once. They&rsquo;ll choose their own password when they first sign in with it.
      </span>
    </div>
  );
}
