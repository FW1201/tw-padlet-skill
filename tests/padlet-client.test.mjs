// Unit tests for the pure/mockable parts of padlet-client.mjs — this is the
// only surviving logic layer after the Playwright removal, so its correctness
// against Padlet's documented API quirks (empty-string-must-be-null, etc.)
// matters more than before.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.PADLET_API_KEY = "test-key-not-real";

const { buildPostPayload, createAiBoardAndWait, addPost, verifyPostWrite, htmlToPlainText, PostVerificationError } =
  await import("../scripts/lib/padlet-client.mjs");

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

// --- htmlToPlainText -------------------------------------------------------

test("htmlToPlainText strips tags, decodes common entities, and collapses whitespace", () => {
  assert.equal(htmlToPlainText("<p>Hello &amp; welcome</p>"), "Hello & welcome");
  assert.equal(htmlToPlainText("<p>line one</p><p>line two</p>"), "line one line two");
  assert.equal(htmlToPlainText("a&nbsp;&nbsp;b"), "a b");
  assert.equal(htmlToPlainText("&lt;tag&gt; &quot;quoted&quot; &#39;apos&#39;"), '<tag> "quoted" \'apos\'');
  assert.equal(htmlToPlainText(null), "");
  assert.equal(htmlToPlainText(undefined), "");
});

// --- verifyPostWrite --------------------------------------------------------
// This is the fix for the reported bug: Padlet's response schema names the
// body field "bodyHtml" (confirmed via https://docs.padlet.dev/reference/post-object),
// not "body" — a naive reader checking response.content.body always sees
// empty regardless of whether the write worked. verifyPostWrite compares
// against the correct field, normalized to plain text.

test("verifyPostWrite: ok when subject/body match exactly (no HTML wrapping)", () => {
  const expected = { subject: "S", body: "B" };
  const response = { attributes: { content: { subject: "S", bodyHtml: "B" } } };
  const result = verifyPostWrite(expected, response);
  assert.equal(result.ok, true);
  assert.deepEqual(result.mismatches, []);
});

test("verifyPostWrite: ok when bodyHtml is plain text wrapped in <p> tags (genuine success)", () => {
  const expected = { subject: "S", body: "測試內容" };
  const response = { attributes: { content: { subject: "S", bodyHtml: "<p>測試內容</p>" } } };
  const result = verifyPostWrite(expected, response);
  assert.equal(result.ok, true);
});

test("verifyPostWrite: fails closed on a genuine body mismatch", () => {
  const expected = { subject: "S", body: "what was sent" };
  const response = { attributes: { content: { subject: "S", bodyHtml: "" } } };
  const result = verifyPostWrite(expected, response);
  assert.equal(result.ok, false);
  assert.ok(result.mismatches.includes("body"));
  assert.equal(result.verification.expected.body, "what was sent");
  assert.equal(result.verification.actual.body, "");
});

test("verifyPostWrite: checks sectionId only when a section was requested", () => {
  const withSection = { subject: "S", body: "B", section: "sec_1" };
  const matchingResponse = { attributes: { content: { subject: "S", bodyHtml: "B" } }, relationships: { section: { data: { id: "sec_1" } } } };
  assert.equal(verifyPostWrite(withSection, matchingResponse).ok, true);

  const mismatchedResponse = { attributes: { content: { subject: "S", bodyHtml: "B" } }, relationships: { section: { data: { id: "sec_2" } } } };
  const mismatchResult = verifyPostWrite(withSection, mismatchedResponse);
  assert.equal(mismatchResult.ok, false);
  assert.ok(mismatchResult.mismatches.includes("sectionId"));

  // No section requested -> sectionId is never checked, even if the response has one.
  const noSectionExpected = { subject: "S", body: "B" };
  assert.equal(verifyPostWrite(noSectionExpected, mismatchedResponse).ok, true);
});

// --- addPost (mocked fetch) --------------------------------------------------

test("addPost resolves normally when the response content verifies", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({ data: { id: "post1", attributes: { content: { subject: "S", bodyHtml: "<p>B</p>" } } } }),
    });
    const res = await addPost("board1", { subject: "S", body: "B" });
    assert.equal(res.data.id, "post1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("addPost throws PostVerificationError (with verification + postId) when read-back doesn't match", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({ data: { id: "post2", attributes: { content: { subject: "S", bodyHtml: "" } } } }),
    });
    await assert.rejects(
      addPost("board1", { subject: "S", body: "content that should have been saved" }),
      (err) => {
        assert.ok(err instanceof PostVerificationError);
        assert.equal(err.postId, "post2");
        assert.ok(err.verification.expected.body.includes("content that should"));
        assert.equal(err.verification.actual.body, "");
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
