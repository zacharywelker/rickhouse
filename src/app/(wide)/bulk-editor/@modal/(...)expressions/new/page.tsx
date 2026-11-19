import Page from "@/app/(app)/expressions/new/page";
import { PopupFrame } from "@/components/popup/popup";

/** The real page, in the popup over the bulk editor. It takes no props yet; Duplicate label and the prefill will pass `searchParams` through. */
export default function Intercepted() {
  return (
    <PopupFrame>
      <Page />
    </PopupFrame>
  );
}
