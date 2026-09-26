import { requireAdmin } from "@/lib/auth";

/**
 * Admin-only settings: accounts and backups, later email and single sign-on.
 * Reached from the admin section of the user menu, not the main nav; each
 * page and action still calls requireAdmin() itself.
 */
export default async function SystemLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <div className="flex flex-col gap-8">{children}</div>;
}
