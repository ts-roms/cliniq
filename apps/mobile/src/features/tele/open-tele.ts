import * as WebBrowser from 'expo-web-browser';

/**
 * Open a tele join URL in the in-app browser (Chrome Custom Tabs on Android,
 * SFSafariViewController on iOS). The room is browser-only by design — RN's
 * WebView has flaky camera/mic permissions and no `getDisplayMedia` for
 * screen-share, so we offload to the system browser which already handles
 * WebRTC properly.
 *
 * Returns the WebBrowser result so callers can react to dismiss/cancel.
 */
export async function openTeleSession(url: string) {
  // dismissButtonStyle 'close' makes the X clearer than 'done' for "leave call".
  return WebBrowser.openBrowserAsync(url, {
    dismissButtonStyle: 'close',
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    showTitle: true,
    enableBarCollapsing: true,
    // We DO want JS, cookies, and the "share" affordance disabled — the
    // patient should consume not redistribute. Available options vary by
    // platform; safe defaults below.
    controlsColor: undefined,
  });
}
