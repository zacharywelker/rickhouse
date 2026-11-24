import { redirect } from "next/navigation";

export default function SsoSettingsPage() {
  redirect("/system/users#sso");
}
