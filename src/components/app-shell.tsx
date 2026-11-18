import { logout } from "@/app/login/actions";
import { AppNav } from "@/components/app-nav";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { CurrencyProvider } from "@/components/currency-context";
import { requireSession } from "@/lib/auth";
import { getPreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";

/**
 * The signed-in shell, shared by the `(app)` and `(wide)` route groups. Login sits outside both so it keeps its bare
 * centred layout.
 *
 * Sign out is a server action, so it is rendered here and handed to the nav
 * rather than the (client) nav importing it. It's an icon beside the user
 * menu, not an item inside it, so leaving is always one click.
 *
 * `wide` is for a page that is a workbench of its own (the bulk editor): the nav and the page run the full width of the
 * window, and from `md` up the window is also the page's height (the page scrolls only when the window is too short for
 * the sheet's minimum).
 */
export async function AppShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  const user = await requireSession();
  const { currency } = await getPreferences(user.id);

  const signOut = (
    <form action={logout}>
      <Button type="submit" variant="ghost" size="sm" aria-label="Sign out" title="Sign out">
        <LogOut className="size-4" aria-hidden />
      </Button>
    </form>
  );

  return (
    <div className={cn("flex min-h-dvh flex-col", wide && "md:h-dvh")}>
      <KeyboardShortcuts />
      <AppNav
        wide={wide}
        signOut={signOut}
        userMenu={<UserMenu name={user.name} username={user.username} isAdmin={user.role === "admin"} />}
      />
      <main className={cn("w-full flex-1 px-4 sm:px-6", wide ? "flex min-h-0 flex-col py-4" : "mx-auto max-w-page py-6 sm:py-8")}>
        <CurrencyProvider currency={currency}>{children}</CurrencyProvider>
      </main>
    </div>
  );
}
