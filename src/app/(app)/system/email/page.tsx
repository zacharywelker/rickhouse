import { redirect } from "next/navigation";

export default function EmailSettingsPage() {
  redirect("/system/users#email");
}
