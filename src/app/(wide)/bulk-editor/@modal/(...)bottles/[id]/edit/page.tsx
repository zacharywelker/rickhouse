import Page from "@/app/(app)/bottles/[id]/edit/page";
import { PopupFrame } from "@/components/popup/popup";

/** The real page, in the popup over the bulk editor. Everything it is given goes through. */
export default function Intercepted(props: React.ComponentProps<typeof Page>) {
  return (
    <PopupFrame>
      <Page {...props} />
    </PopupFrame>
  );
}
