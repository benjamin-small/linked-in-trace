# Configuration

linked-in-trace has no server, environment variables, API keys, or build-time
configuration. Chrome stores its state locally under the extension's private
storage area:

- `enabled` controls automatic capture and defaults to `true`. Click the
  extension icon to pause or resume it; the badge shows `OFF` while paused.
- `savedProfiles` maps each raw LinkedIn profile slug to its most recent local
  capture date. This prevents duplicate captures on the same day.

Captured pages are downloaded to `linkedin-profiles/` beneath Chrome's current
download directory. Chrome may uniquify a filename if one already exists.

## Browser permissions

The manifest requests `pageCapture`, `downloads`, `storage`, `scripting`, and
`webNavigation`, with host access limited to `https://*.linkedin.com/*`.
These permissions let the extension detect profile navigation, wait for the
page to settle, capture MHTML, download it locally, and remember capture dates.
The extension does not transmit captured content to a remote service.
