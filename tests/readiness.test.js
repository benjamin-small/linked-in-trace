// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { waitForProfileReady } from "../lib/readiness.js";

function setBody(html) {
  document.body.innerHTML = html;
}

async function timed(promise) {
  const start = Date.now();
  const result = await promise;
  return { result, elapsed: Date.now() - start };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("waitForProfileReady", () => {
  it("resolves ready when the DOM is quiet and the selector has text", async () => {
    setBody("<main><h1>Jane Doe</h1></main>");
    const { result, elapsed } = await timed(
      waitForProfileReady({ selector: "main h1", quietMs: 120, timeoutMs: 2000 })
    );
    expect(result).toEqual({ ready: true });
    expect(elapsed).toBeLessThan(1000);
  });

  it("keeps waiting while mutations continue and resolves after they stop", async () => {
    setBody("<main><h1>Jane Doe</h1><section></section></main>");
    const section = document.querySelector("section");
    const mutator = setInterval(() => {
      section.appendChild(document.createElement("div"));
    }, 50);
    setTimeout(() => clearInterval(mutator), 400);
    const { result, elapsed } = await timed(
      waitForProfileReady({ selector: "main h1", quietMs: 150, timeoutMs: 5000 })
    );
    expect(result).toEqual({ ready: true });
    expect(elapsed).toBeGreaterThanOrEqual(400);
  });

  it("returns ready:false at the timeout under continuous mutation", async () => {
    setBody("<main><h1>Jane Doe</h1><section></section></main>");
    const section = document.querySelector("section");
    const mutator = setInterval(() => {
      section.appendChild(document.createElement("div"));
    }, 50);
    const { result, elapsed } = await timed(
      waitForProfileReady({ selector: "main h1", quietMs: 300, timeoutMs: 600 })
    );
    clearInterval(mutator);
    expect(result).toEqual({ ready: false });
    expect(elapsed).toBeGreaterThanOrEqual(600);
  });

  it("waits for a late-appearing selector before starting the quiet phase", async () => {
    setBody("<main></main>");
    setTimeout(() => {
      const h1 = document.createElement("h1");
      h1.textContent = "Jane Doe";
      document.querySelector("main").appendChild(h1);
    }, 200);
    const { result, elapsed } = await timed(
      waitForProfileReady({ selector: "main h1", quietMs: 100, timeoutMs: 3000 })
    );
    expect(result).toEqual({ ready: true });
    expect(elapsed).toBeGreaterThanOrEqual(200);
  });

  it("does not treat an empty selector match as essential content", async () => {
    setBody("<main><h1></h1></main>");
    const { result, elapsed } = await timed(
      waitForProfileReady({ selector: "main h1", quietMs: 100, timeoutMs: 400 })
    );
    expect(result).toEqual({ ready: false });
    expect(elapsed).toBeGreaterThanOrEqual(400);
  });

  it("falls back to body when no main element exists", async () => {
    setBody("<div><h1>Jane Doe</h1></div>");
    const { result } = await timed(
      waitForProfileReady({ selector: null, quietMs: 100, timeoutMs: 2000 })
    );
    expect(result).toEqual({ ready: true });
  });

  it("survives serialization: rebuilt from its own source with no chrome references", async () => {
    const source = String(waitForProfileReady);
    expect(source).not.toMatch(/chrome\./);
    expect(source).not.toMatch(/\brequire\b|\bimport\b/);
    const rebuilt = (0, eval)(`(${source})`);
    setBody("<main><h1>Jane Doe</h1></main>");
    const result = await rebuilt({ selector: "main h1", quietMs: 80, timeoutMs: 1000 });
    expect(result).toEqual({ ready: true });
  });
});
