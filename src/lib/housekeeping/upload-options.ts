import { HOUSEKEEPING_MIN_LONG_SIDE, type StoreOptions } from "@/lib/images";

/**
 * The image-store options for an upload request. Only a request that says it comes from the Housekeeping page
 * (`source=housekeeping`) gets the minimum-size rule; the label form, vintage page and bottle page send no `source`.
 */
export function housekeepingStoreOptions(formData: FormData): StoreOptions {
  return formData.get("source") === "housekeeping" ? { minLongSide: HOUSEKEEPING_MIN_LONG_SIDE } : {};
}
