import { requireAdmin } from "@/lib/auth";

/**
 * Admin-only settings: Users & sign-in (users, single sign-on and email, one page) and backups.
 * Reached from the admin section of the account menu, not the main nav; each
 * page and action still calls requireAdmin() itself.
 */
export default async function SystemLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <div className="flex flex-col gap-8">{children}</div>;
}
