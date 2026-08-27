import { describe, it, expect } from "vitest";
import { profileSlugFromUrl, sanitizeSlug } from "../lib/profile.js";

describe("profileSlugFromUrl", () => {
  it("extracts the slug from a standard profile URL", () => {
    expect(profileSlugFromUrl("https://www.linkedin.com/in/jane-doe/")).toBe("jane-doe");
  });

  it("accepts a URL without trailing slash", () => {
    expect(profileSlugFromUrl("https://www.linkedin.com/in/jane-doe")).toBe("jane-doe");
  });

  it("ignores query string and hash", () => {
    expect(profileSlugFromUrl("https://www.linkedin.com/in/jane-doe?originalSubdomain=uk#about")).toBe("jane-doe");
  });

  it("accepts regional subdomains", () => {
    expect(profileSlugFromUrl("https://de.linkedin.com/in/jane-doe/")).toBe("jane-doe");
  });

  it("accepts the bare linkedin.com host", () => {
    expect(profileSlugFromUrl("https://linkedin.com/in/jane-doe")).toBe("jane-doe");
  });

  it("returns the slug still percent-encoded", () => {
    expect(profileSlugFromUrl("https://www.linkedin.com/in/%C3%A9lodie-durand/")).toBe("%C3%A9lodie-durand");
  });

  it("rejects detail subpages", () => {
    expect(profileSlugFromUrl("https://www.linkedin.com/in/jane-doe/details/experience/")).toBeNull();
  });

  it("rejects overlay subpages", () => {
    expect(profileSlugFromUrl("https://www.linkedin.com/in/jane-doe/overlay/about-this-profile/")).toBeNull();
  });

  it("rejects non-profile sections", () => {
    expect(profileSlugFromUrl("https://www.linkedin.com/feed/")).toBeNull();
    expect(profileSlugFromUrl("https://www.linkedin.com/company/acme/")).toBeNull();
  });

  it("rejects an empty slug", () => {
    expect(profileSlugFromUrl("https://www.linkedin.com/in/")).toBeNull();
  });

  it("rejects non-LinkedIn hosts, including suffix look-alikes", () => {
    expect(profileSlugFromUrl("https://evil.com/in/jane-doe")).toBeNull();
    expect(profileSlugFromUrl("https://notlinkedin.com/in/jane-doe")).toBeNull();
  });

  it("rejects non-https schemes", () => {
    expect(profileSlugFromUrl("http://www.linkedin.com/in/jane-doe")).toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(profileSlugFromUrl("not a url")).toBeNull();
  });
});

describe("sanitizeSlug", () => {
  it("passes ordinary slugs through unchanged", () => {
    expect(sanitizeSlug("jane-doe-123abc")).toBe("jane-doe-123abc");
  });

  it("percent-decodes, keeping unicode letters", () => {
    expect(sanitizeSlug("%C3%A9lodie-durand")).toBe("élodie-durand");
  });

  it("decodes %20 to a plain space", () => {
    expect(sanitizeSlug("jane%20doe")).toBe("jane doe");
  });

  it("replaces filename-forbidden characters with hyphens and collapses runs", () => {
    expect(sanitizeSlug('a<b>|c')).toBe("a-b-c");
    expect(sanitizeSlug("a??b")).toBe("a-b");
    expect(sanitizeSlug("a/b\\c:d")).toBe("a-b-c-d");
  });

  it("strips leading and trailing hyphens produced by cleaning", () => {
    expect(sanitizeSlug("<jane>")).toBe("jane");
  });

  it("caps the result at 100 characters", () => {
    expect(sanitizeSlug("x".repeat(150))).toBe("x".repeat(100));
  });

  it("keeps malformed percent-encoding as-is instead of throwing", () => {
    expect(sanitizeSlug("%E0%A4%A")).toBe("%E0%A4%A");
  });

  it("falls back to 'profile' when nothing survives cleaning", () => {
    expect(sanitizeSlug("<<>>")).toBe("profile");
  });
});
