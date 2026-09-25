import { logout } from "@/app/login/actions";
import { AppNav } from "@/components/app-nav";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth";

/**
 * The signed-in shell. Login sits outside this group so it keeps its bare
 * centred layout.
 *
 * Sign out is a server action, so it is rendered here and handed to the nav
 * rather than the (client) nav importing it.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();

  const signOut = (
    <form action={logout}>
      <Button type="submit" variant="ghost" size="sm" className="w-full justify-start md:w-auto md:justify-center">
        Sign out
      </Button>
    </form>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <KeyboardShortcuts />
      <AppNav signOut={signOut} username={user.username} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
