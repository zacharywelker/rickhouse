/** The bulk editor with the popup slot beside it: the real label and bottle pages open over the sheet through `@modal`. */
export default function BulkEditorLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
