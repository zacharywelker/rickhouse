import { logout } from "@/app/login/actions";
import { AppNav } from "@/components/app-nav";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { requireSession } from "@/lib/auth";

/**
 * The signed-in shell. Login sits outside this group so it keeps its bare
 * centred layout.
 *
 * Sign out is a server action, so it is rendered here and handed to the nav
 * rather than the (client) nav importing it. It's an icon beside the user
 * menu, not an item inside it, so leaving is always one click.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();

  const signOut = (
    <form action={logout}>
      <Button type="submit" variant="ghost" size="sm" aria-label="Sign out" title="Sign out">
        <LogOut className="size-4" aria-hidden />
      </Button>
    </form>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <KeyboardShortcuts />
      <AppNav
        signOut={signOut}
        userMenu={<UserMenu name={user.name} username={user.username} isAdmin={user.role === "admin"} />}
      />
      <main className="mx-auto w-full max-w-page flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
