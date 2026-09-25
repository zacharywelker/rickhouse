import { AdminNav } from "@/components/admin/admin-nav";
import { requireSession } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  return (
    <div className="flex flex-col gap-8">
      <AdminNav isAdmin={user.role === "admin"} />
      {children}
    </div>
  );
}
