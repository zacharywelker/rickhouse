import { AdminNav } from "@/components/admin/admin-nav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-8">
      <AdminNav />
      {children}
    </div>
  );
}
