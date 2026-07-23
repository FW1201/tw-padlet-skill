// Unit tests for the pure/mockable parts of padlet-client.mjs — this is the
// only surviving logic layer after the Playwright removal, so its correctness
// against Padlet's documented API quirks (empty-string-must-be-null, etc.)
// matters more than before.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.PADLET_API_KEY = "test-key-not-real";

const {
  buildPostPayload,
  createAiBoardAndWait,
  addPost,
  verifyPostWrite,
  htmlToPlainText,
  PostVerificationError,
  buildCommentPayload,
  verifyCommentWrite,
  createComment,
  createCommentsSafely,
  listComments,
  CommentVerificationError,
  RateLimitError,
  PostBoardMismatchError,
} =
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

// --- comments --------------------------------------------------------------
// These cases intentionally precede the implementation.  Padlet's official
// endpoint accepts sanitized HTML, while this Skill's teacher-facing input is
// always plain text: unsafe characters must become text rather than markup.

test("buildCommentPayload converts plain text to safely escaped paragraph HTML", () => {
  const payload = buildCommentPayload({ text: "教師：<確認> & 回覆\n第二行" });
  assert.deepEqual(payload, {
    data: {
      type: "comment",
      attributes: { htmlContent: "<p>教師：&lt;確認&gt; &amp; 回覆<br/>第二行</p>" },
    },
  });
});

test("verifyCommentWrite fails closed when returned comment belongs to another post or has different content", () => {
  const expected = { text: "請補充來源" };
  const wrongPost = {
    attributes: { htmlContent: "<p>請補充來源</p>" },
    relationships: { post: { data: { id: "post-other" } } },
  };
  const wrongContent = {
    attributes: { htmlContent: "<p>不同內容</p>" },
    relationships: { post: { data: { id: "post-1" } } },
  };
  assert.deepEqual(verifyCommentWrite("post-1", expected, wrongPost).mismatches, ["postId"]);
  assert.deepEqual(verifyCommentWrite("post-1", expected, wrongContent).mismatches, ["text"]);
});

test("listComments reads only comments related to the requested post from the board include", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      assert.match(String(url), /boards\/board-1/);
      return {
        ok: true,
        text: async () => JSON.stringify({
          data: { id: "board-1" },
          included: [
            { id: "comment-1", type: "comment", attributes: { content: "保留" }, relationships: { post: { data: { id: "post-1" } } } },
            { id: "comment-2", type: "comment", attributes: { content: "排除" }, relationships: { post: { data: { id: "post-2" } } } },
          ],
        }),
      };
    };
    const comments = await listComments("board-1", "post-1");
    assert.deepEqual(comments.map((comment) => comment.id), ["comment-1"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createComment verifies its response before reporting success", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init = {}) => {
      if ((init.method ?? "GET") === "GET") return { ok: true, text: async () => JSON.stringify({ data: { id: "board-1" }, included: [{ id: "comment-1", type: "comment", attributes: { htmlContent: "<p>已閱讀</p>" }, relationships: { post: { data: { id: "post-1" } } } }] }) };
      assert.match(String(url), /posts\/post-1\/comments/);
      assert.equal(init.method, "POST");
      assert.equal(JSON.parse(init.body).data.attributes.htmlContent, "<p>已閱讀</p>");
      return {
        ok: true,
        text: async () => JSON.stringify({
          data: {
            id: "comment-1",
            attributes: { htmlContent: "<p>已閱讀</p>" },
            relationships: { post: { data: { id: "post-1" } } },
          },
        }),
      };
    };
    const result = await createComment("board-1", "post-1", { text: "已閱讀" });
    assert.equal(result.data.id, "comment-1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createComment throws CommentVerificationError when read-back differs", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      text: async () => JSON.stringify({
        data: {
          id: "comment-2",
          attributes: { htmlContent: "<p>意外內容</p>" },
          relationships: { post: { data: { id: "post-1" } } },
        },
      }),
    });
    await assert.rejects(
      createComment("board-1", "post-1", { text: "預期內容" }),
      (err) => err instanceof CommentVerificationError && err.commentId === "comment-2",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createCommentsSafely skips existing and in-batch duplicates without issuing duplicate writes", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async (_url, init = {}) => {
      calls += 1;
      if ((init.method ?? "GET") === "GET") {
        return {
          ok: true,
          text: async () => JSON.stringify({
            data: { id: "board-1" },
            included: [
              { id: "post-1", type: "post" },
              {
                id: "existing-1", type: "comment", attributes: { content: "已存在" },
                relationships: { post: { data: { id: "post-1" } } },
              },
              ...(calls > 2 ? [{ id: "new-1", type: "comment", attributes: { htmlContent: "<p>新增</p>" }, relationships: { post: { data: { id: "post-1" } } } }] : []),
            ],
          }),
        };
      }
      return {
        ok: true,
        text: async () => JSON.stringify({
          data: {
            id: "new-1", attributes: { htmlContent: "<p>新增</p>" },
            relationships: { post: { data: { id: "post-1" } } },
          },
        }),
      };
    };
    const result = await createCommentsSafely("board-1", [
      { postId: "post-1", text: "已存在" },
      { postId: "post-1", text: "新增" },
      { postId: "post-1", text: "新增" },
    ]);
    assert.deepEqual(result, { created: [{ postId: "post-1", commentId: "new-1" }], skipped: 2 });
    assert.equal(calls, 3, "one initial read, one POST, and one readback");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createCommentsSafely stops after HTTP 429 and reports Retry-After without sending later writes", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async (_url, init = {}) => {
      calls += 1;
      if ((init.method ?? "GET") === "GET") {
        return {
          ok: true,
          text: async () => JSON.stringify({
            data: { id: "board-1" },
            included: [{ id: "post-1", type: "post" }, { id: "post-2", type: "post" }],
          }),
        };
      }
      return {
        ok: false,
        status: 429,
        headers: { get: (name) => (name.toLowerCase() === "retry-after" ? "17" : null) },
        text: async () => JSON.stringify({ errors: [{ detail: "too many requests" }] }),
      };
    };
    await assert.rejects(
      createCommentsSafely("board-1", [
        { postId: "post-1", text: "第一則" },
        { postId: "post-2", text: "不可送出" },
      ]),
      (err) => err instanceof RateLimitError && err.retryAfterSeconds === 17,
    );
    assert.equal(calls, 2, "must stop before the second POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createCommentsSafely rejects a post that is not included in the confirmed board before any POST", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async (_url, init = {}) => {
      calls += 1;
      assert.equal(init.method ?? "GET", "GET", "mismatched post must never be written");
      return {
        ok: true,
        text: async () => JSON.stringify({
          data: { id: "board-1" },
          included: [{ id: "post-1", type: "post" }],
        }),
      };
    };
    await assert.rejects(
      createCommentsSafely("board-1", [{ postId: "post-other", text: "不應送出" }]),
      (err) => err instanceof PostBoardMismatchError && err.postIds.includes("post-other"),
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
