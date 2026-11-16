import { permanentRedirect } from "next/navigation";

/** The old Bulk add page. The Bulk editor adds, edits and deletes in one sheet, so old links and bookmarks go there. */
export default function Page() {
  permanentRedirect("/bulk-editor");
}
