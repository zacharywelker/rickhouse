import Link from "next/link";
import { BarChart3, FlaskConical, House, Library, SlidersHorizontal } from "lucide-react";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth";

/**
 * The signed-in shell. Login sits outside this group so it keeps its bare
 * centred layout.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <Link href="/" className="font-display text-xl text-rye-gold">
            Rickhouse
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <House className="size-4" />
              Home
            </Link>
            <Link
              href="/bottles"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Library className="size-4" />
              Collection
            </Link>
            <Link
              href="/expressions"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <FlaskConical className="size-4" />
              Expressions
            </Link>
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <BarChart3 className="size-4" />
              Dashboard
            </Link>
            <Link
              href="/admin"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <SlidersHorizontal className="size-4" />
              Configuration
            </Link>
          </nav>
          <form action={logout} className="ml-auto">
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
