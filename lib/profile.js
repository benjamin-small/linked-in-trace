// Pure logic for linked-in-trace. No Chrome APIs here — this file runs in
// Node under vitest exactly as it runs in the service worker.

const PROFILE_PATH_RE = /^\/in\/([^/]+)\/?$/;

export function profileSlugFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname;
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
  const match = PROFILE_PATH_RE.exec(parsed.pathname);
  return match ? match[1] : null;
}
