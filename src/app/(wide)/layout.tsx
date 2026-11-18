import { AppShell } from "@/components/app-shell";

/** Pages that use the whole window (the bulk editor). Same shell as `(app)`, without the page column. */
export default function WideLayout({ children }: { children: React.ReactNode }) {
  return <AppShell wide>{children}</AppShell>;
}
