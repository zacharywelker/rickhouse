/**
 * The name of the Alt key on this computer: "Option" on a Mac, "Alt" elsewhere. Read from the browser, and only used to
 * say the key's name in the page; the key itself is the same everywhere. Where there is no `navigator` (the server
 * render) it is "Alt", and the page says "Option" once it has loaded on a Mac.
 */
export function platformKeyName(): "Option" | "Alt" {
  if (typeof navigator === "undefined") return "Alt";
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = data?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad/i.test(platform) ? "Option" : "Alt";
}
