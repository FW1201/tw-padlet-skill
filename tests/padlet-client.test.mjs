// Unit tests for the pure/mockable parts of padlet-client.mjs — this is the
// only surviving logic layer after the Playwright removal, so its correctness
// against Padlet's documented API quirks (empty-string-must-be-null, etc.)
// matters more than before.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.PADLET_API_KEY = "test-key-not-real";

const { buildPostPayload, createAiBoardAndWait } = await import("../scripts/lib/padlet-client.mjs");

test("buildPostPayload converts an empty body to null (Padlet rejects empty strings)", () => {
  const payload = buildPostPayload({ body: "" });
  assert.equal(payload.data.attributes.content.body, null);
});

test("buildPostPayload converts an empty subject to null, leaves a real subject untouched", () => {
  const empty = buildPostPayload({ body: "hi", subject: "" });
  assert.equal(empty.data.attributes.content.subject, null);
  const real = buildPostPayload({ body: "hi", subject: "Title" });
  assert.equal(real.data.attributes.content.subject, "Title");
});

test("buildPostPayload passes a non-empty body through unchanged", () => {
  const payload = buildPostPayload({ body: "real content" });
  assert.equal(payload.data.attributes.content.body, "real content");
});

test("buildPostPayload builds attachment shape from media", () => {
  const payload = buildPostPayload({ body: "b", media: { kind: "image", url: "https://x/y.png", title: "cap" } });
  assert.deepEqual(payload.data.attributes.content.attachment, { url: "https://x/y.png", caption: "cap" });
});

// createAiBoardAndWait polling resilience: a transient fetch error during one
// poll attempt must not abort the whole wait — only an explicit `failed`
// status should. Mock global fetch to control the sequence deterministically.
function mockFetchSequence(responses) {
  let call = 0;
  globalThis.fetch = async () => {
    const r = responses[Math.min(call, responses.length - 1)];
    call += 1;
    if (r.networkError) throw new Error("simulated network blip");
    return {
      ok: true,
      text: async () => JSON.stringify(r.body),
    };
  };
  return () => call;
}

test("a transient network error during polling does not abort createAiBoardAndWait", async () => {
  const originalFetch = globalThis.fetch;
  try {
    mockFetchSequence([
      { body: { data: { attributes: { statusUrl: "https://x/status" } } } }, // createAiBoard
      { networkError: true }, // 1st poll: transient failure
      { body: { data: { attributes: { status: "success", board: { id: "b1", attributes: { title: "T", webUrl: { live: "https://x/b1" } } } } } } }, // 2nd poll: success
    ]);
    const result = await createAiBoardAndWait({ prompt: "p", role: "teacher" }, { intervalMs: 1, maxAttempts: 5 });
    assert.equal(result.boardId, "b1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an explicit failed status aborts immediately without exhausting retries", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const getCallCount = mockFetchSequence([
      { body: { data: { attributes: { statusUrl: "https://x/status" } } } }, // createAiBoard
      { body: { data: { attributes: { status: "failed" } } } }, // 1st poll: failed
    ]);
    await assert.rejects(
      createAiBoardAndWait({ prompt: "p", role: "teacher" }, { intervalMs: 1, maxAttempts: 40 }),
      /Padlet AI board creation failed/,
    );
    // createAiBoard (1) + exactly one poll attempt (1) = 2 fetch calls, not 40.
    assert.equal(getCallCount(), 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
