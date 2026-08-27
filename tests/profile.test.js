import { describe, it, expect } from "vitest";
import { profileSlugFromUrl } from "../lib/profile.js";

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
