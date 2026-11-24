import { redirect } from "next/navigation";

/** Collection is the landing page; there is no separate Home. */
export default function HomePage() {
  redirect("/bottles");
}
