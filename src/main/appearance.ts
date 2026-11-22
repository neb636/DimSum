import { nativeTheme } from "electron";

/** The window canvas (--wb-bg-app) in the current appearance, so a first or resized frame matches the page. */
export function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? "#161618" : "#ececee";
}
