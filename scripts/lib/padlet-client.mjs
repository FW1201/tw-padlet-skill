// Ported from edu-agent-kit packages/adapters/padlet/src/client.ts @ a7eaa0f
// httpRequest → native fetch; resolveCredential → env PADLET_API_KEY,
// fallback ~/.tw-edu-skills/padlet/config.json ({"apiKey":"..."}).
// The key is read internally and MUST never appear in any output.
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const PADLET_BASE_URL = "https://api.padlet.dev/v1";
const JSON_API_CONTENT_TYPE = "application/vnd.api+json";
const CONFIG_PATH = path.join(os.homedir(), ".tw-edu-skills", "padlet", "config.json");

export class MissingCredentialError extends Error {}

/** A 429 is intentionally terminal for a batch: callers must report it and
 * wait for Padlet's declared interval before a new, explicit run. */
export class RateLimitError extends Error {
  constructor(message, { retryAfterSeconds } = {}) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds ?? null;
  }
}

export async function hasApiKey() {
  try {
    await apiKey();
    return true;
  } catch {
    return false;
  }
}

async function apiKey() {
  if (process.env.PADLET_API_KEY) return process.env.PADLET_API_KEY;
  try {
    const cfg = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
    if (cfg.apiKey) return cfg.apiKey;
  } catch {
    // fall through
  }
  throw new MissingCredentialError(
    "缺少 PADLET_API_KEY。請至 https://padlet.com/dashboard/settings/developers 申請（需付費方案），" +
      `再 export PADLET_API_KEY=... 或寫入 ${CONFIG_PATH}。本 skill 只走官方 API，無 key 則無法使用。`,
  );
}

async function request(url, { method = "GET", json, query } = {}) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(query ?? {})) u.searchParams.set(k, String(v));
  const headers = { "X-API-KEY": await apiKey() };
  if (json !== undefined) headers["Content-Type"] = JSON_API_CONTENT_TYPE;
  const res = await fetch(u, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (!res.ok) {
    const detail =
      body?.errors?.map((e) => e.detail ?? e.title).join("; ") ?? text.slice(0, 300);
    if (res.status === 429) {
      const retryAfter = res.headers?.get?.("retry-after") ?? null;
      const retryAfterSeconds = /^\d+$/.test(retryAfter ?? "")
        ? Number(retryAfter)
        : Number.isFinite(Date.parse(retryAfter ?? ""))
          ? Math.max(0, Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000))
          : null;
      throw new RateLimitError(
        `Padlet API 429: ${detail || "rate limited"}${retryAfterSeconds != null ? `；請至少等待 ${retryAfterSeconds} 秒後，以新的明確確認重新執行。` : "；請依 Padlet 的速率限制稍後再試。"}`,
        { retryAfterSeconds },
      );
    }
    // Status + Padlet error message only — never request headers (except the
    // Retry-After value on 429, which is surfaced as a duration only).
    throw new Error(`Padlet API ${res.status}: ${detail}`);
  }
  return body;
}

// Padlet's API docs state string fields must not be sent as empty strings —
// use null instead. BoardPost.body defaults to "" via zod (a form-friendly
// default, not a network-friendly one), so this was a known but unimplemented
// gap: an empty body/subject would previously be sent as "" verbatim.
const nullIfEmpty = (s) => (s === "" ? null : s);

/** Map a core BoardPost to the Padlet JSON:API post body. No network I/O. */
export function buildPostPayload(post) {
  const content = { body: nullIfEmpty(post.body) };
  if (post.subject !== undefined) content.subject = nullIfEmpty(post.subject);
  if (post.media !== undefined) {
    const caption = post.media.title ?? post.media.altText;
    // Padlet's attachment endpoint behavior for non-image media kinds isn't
    // fully documented (platform-features.md only confirms the shape below
    // for images); pass the URL/caption through uniformly but let the caller
    // (add-post.mjs / seed-board.mjs) decide whether to warn on non-image
    // kinds rather than guessing at kind-specific handling here.
    content.attachment = {
      url: post.media.url,
      ...(caption !== undefined ? { caption } : {}),
    };
  }
  const body = { data: { type: "post", attributes: { content } } };
  if (post.color !== undefined) body.data.attributes.color = post.color;
  if (post.section !== undefined) {
    body.data.relationships = {
      section: { data: { id: post.section, type: "section" } },
    };
  }
  return body;
}

// Strip HTML tags and decode the handful of entities Padlet's rendered
// bodyHtml is expected to contain, then collapse/trim whitespace. Used both
// for post-write verification (comparing plain-text input against the
// HTML-rendered response) and as the plain-text `body` field callers expect
// from listPosts.
export function htmlToPlainText(html) {
  if (html == null) return "";
  return String(html)
    // Replace with a space, not "", so adjacent block tags (e.g. </p><p>)
    // don't glue two words together with no separator.
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const normalizeText = (s) => (s == null ? "" : String(s).replace(/\s+/g, " ").trim());

export class PostVerificationError extends Error {
  constructor(message, { verification, postId } = {}) {
    super(message);
    this.name = "PostVerificationError";
    this.verification = verification;
    this.postId = postId;
  }
}

/**
 * Compare the post as sent (`expectedPost`, the flat BoardPost shape passed
 * to buildPostPayload) against the post resource Padlet's API returned
 * (`responsePostResource`, i.e. `res.data` from the POST response — no
 * separate GET needed, the create response already echoes the full content).
 * bodyHtml is normalized to plain text before comparison since Padlet wraps
 * plain input in HTML (e.g. "text" -> "<p>text</p>") on a genuine success —
 * comparing raw strings would false-fail every correct write.
 */
export function verifyPostWrite(expectedPost, responsePostResource) {
  const actualContent = responsePostResource?.attributes?.content ?? {};
  const mismatches = [];

  const expectedSubject = normalizeText(expectedPost.subject);
  const actualSubject = normalizeText(actualContent.subject);
  if (expectedSubject !== actualSubject) mismatches.push("subject");

  const expectedBody = normalizeText(expectedPost.body);
  const actualBody = normalizeText(htmlToPlainText(actualContent.bodyHtml));
  if (expectedBody !== actualBody) mismatches.push("body");

  if (expectedPost.section !== undefined) {
    const actualSectionId = responsePostResource?.relationships?.section?.data?.id ?? null;
    if (actualSectionId !== expectedPost.section) mismatches.push("sectionId");
  }

  return {
    ok: mismatches.length === 0,
    mismatches,
    verification: {
      expected: {
        subject: expectedPost.subject,
        body: expectedPost.body,
        ...(expectedPost.section !== undefined ? { sectionId: expectedPost.section } : {}),
      },
      actual: {
        subject: actualContent.subject ?? null,
        body: htmlToPlainText(actualContent.bodyHtml),
        ...(expectedPost.section !== undefined
          ? { sectionId: responsePostResource?.relationships?.section?.data?.id ?? null }
          : {}),
      },
    },
  };
}

export async function getBoard(boardId) {
  return request(`${PADLET_BASE_URL}/boards/${boardId}`, {
    query: { include: "posts,sections,comments" },
  });
}

export async function listPosts(boardId) {
  const board = await getBoard(boardId);
  return (board.included ?? []).filter((e) => e.type === "post");
}

export async function listSections(boardId) {
  const board = await getBoard(boardId);
  return (board.included ?? [])
    .filter((e) => e.type === "section")
    .map((s) => ({ id: s.id, title: s.attributes?.title ?? "" }));
}

const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Convert a teacher's plain-text feedback to the API's sanitized HTML field. */
export function plainTextToCommentHtml(text) {
  return `<p>${escapeHtml(text).replace(/\r?\n/g, "<br/>")}</p>`;
}

/** Map a plain-text teacher comment to Padlet's JSON:API resource body. */
export function buildCommentPayload(comment) {
  return {
    data: {
      type: "comment",
      attributes: { htmlContent: plainTextToCommentHtml(comment.text) },
    },
  };
}

export class CommentVerificationError extends Error {
  constructor(message, { verification, commentId } = {}) {
    super(message);
    this.name = "CommentVerificationError";
    this.verification = verification;
    this.commentId = commentId;
  }
}

export class PostBoardMismatchError extends Error {
  constructor(boardId, postIds) {
    super(`指定的貼文不屬於已確認的看板 ${boardId}：${postIds.join("、")}。已停止，未送出任何留言。`);
    this.name = "PostBoardMismatchError";
    this.boardId = boardId;
    this.postIds = postIds;
  }
}

/** Verify the response against both feedback text and its intended post. */
export function verifyCommentWrite(postId, expectedComment, responseCommentResource) {
  const attrs = responseCommentResource?.attributes ?? {};
  const actualPostId = responseCommentResource?.relationships?.post?.data?.id ?? null;
  const actualText = htmlToPlainText(attrs.htmlContent ?? attrs.content ?? "");
  const expectedText = normalizeText(expectedComment.text);
  const mismatches = [];
  if (actualPostId !== postId) mismatches.push("postId");
  if (normalizeText(actualText) !== expectedText) mismatches.push("text");
  return {
    ok: mismatches.length === 0,
    mismatches,
    verification: {
      expected: { postId, text: expectedComment.text },
      actual: { postId: actualPostId, text: actualText },
    },
  };
}

/**
 * Board reads include comments.  Padlet does not document a separate comment
 * listing endpoint, so this is the official read path used for duplicate
 * detection and teacher inspection.
 */
export async function listComments(boardId, postId) {
  const board = await getBoard(boardId);
  return (board.included ?? []).filter(
    (entry) => entry.type === "comment" && entry.relationships?.post?.data?.id === postId,
  );
}

/** POST a comment then fail closed unless Padlet's returned object verifies. */
export async function createComment(boardId, postId, comment) {
  const res = await request(`${PADLET_BASE_URL}/posts/${encodeURIComponent(postId)}/comments`, {
    method: "POST",
    json: buildCommentPayload(comment),
  });
  const check = verifyCommentWrite(postId, comment, res.data);
  if (!check.ok) {
    throw new CommentVerificationError(
      `Padlet 回報寫入成功（comment ${res.data?.id}），但讀回內容或所屬貼文不符（${check.mismatches.join("、")}）——請先到看板確認，勿直接重送。`,
      { verification: check.verification, commentId: res.data?.id },
    );
  }
  const persisted = (await listComments(boardId, postId)).find((entry) => entry.id === res.data?.id);
  const readback = verifyCommentWrite(postId, comment, persisted);
  if (!readback.ok) {
    throw new CommentVerificationError(
      `Padlet 回報寫入成功（comment ${res.data?.id}），但看板讀回找不到或不符（${readback.mismatches.join("、")}）——請先到看板確認，勿直接重送。`,
      { verification: readback.verification, commentId: res.data?.id },
    );
  }
  return res;
}

const commentDuplicateKey = (postId, text) => JSON.stringify([postId, normalizeText(text)]);

/**
 * Serial, fail-closed batch writer.  Existing board comments and earlier
 * entries in the same batch share one duplicate set.  A RateLimitError is
 * deliberately propagated immediately, so no later write is attempted.
 */
export async function createCommentsSafely(boardId, comments) {
  const board = await getBoard(boardId);
  const boardPostIds = new Set(
    (board.included ?? []).filter((entry) => entry.type === "post").map((entry) => entry.id),
  );
  const unknownPostIds = [...new Set(comments.map((comment) => comment.postId))].filter(
    (postId) => !boardPostIds.has(postId),
  );
  if (unknownPostIds.length > 0) throw new PostBoardMismatchError(boardId, unknownPostIds);
  const known = new Set(
    (board.included ?? [])
      .filter((entry) => entry.type === "comment")
      .map((entry) =>
        commentDuplicateKey(
          entry.relationships?.post?.data?.id ?? "",
          htmlToPlainText(entry.attributes?.htmlContent ?? entry.attributes?.content ?? ""),
        ),
      ),
  );
  const created = [];
  let skipped = 0;
  for (const comment of comments) {
    const key = commentDuplicateKey(comment.postId, comment.text);
    if (known.has(key)) {
      skipped += 1;
      continue;
    }
    let res;
    try {
      res = await createComment(boardId, comment.postId, comment);
    } catch (err) {
      if (err instanceof RateLimitError) err.batch = { created, skipped };
      throw err;
    }
    known.add(key);
    created.push({ postId: comment.postId, commentId: res.data.id });
  }
  return { created, skipped };
}

// Padlet's API accepts a 2xx write whose content doesn't actually match what
// was sent (confirmed root cause: the response echoes the body under
// `content.bodyHtml`, a different field name than the `content.body` used to
// write it — a naive reader checking `content.body` on the response always
// sees empty, regardless of whether the write worked). addPost is fail-closed
// by default: a 2xx response that doesn't verify throws PostVerificationError
// rather than being reported as success.
export async function addPost(boardId, post) {
  const res = await request(`${PADLET_BASE_URL}/boards/${boardId}/posts`, {
    method: "POST",
    json: buildPostPayload(post),
  });
  const check = verifyPostWrite(post, res.data);
  if (!check.ok) {
    throw new PostVerificationError(
      `Padlet 回報寫入成功（post ${res.data?.id}），但讀回內容與送出內容不符（${check.mismatches.join("、")}）——寫入可能未完整生效。`,
      { verification: check.verification, postId: res.data?.id },
    );
  }
  return res;
}

export async function createAiBoard({ prompt, role, workspaceId }) {
  return request(`${PADLET_BASE_URL}/ai-recipe-boards`, {
    method: "POST",
    json: {
      data: {
        type: "ai_recipe_board",
        attributes: {
          boardCreationInstructions: prompt,
          role,
          ...(workspaceId !== undefined ? { workspaceId } : {}),
        },
      },
    },
  });
}

export async function pollAiBoardStatus(statusUrl) {
  return request(statusUrl);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Create an AI recipe board and poll until ready (3s × 40 ≈ 2 min).
 * A transient network error during one poll attempt no longer aborts the
 * whole ~2-minute wait — only an explicit `status: "failed"` from Padlet does.
 */
export async function createAiBoardAndWait(params, { intervalMs = 3000, maxAttempts = 40 } = {}) {
  const created = await createAiBoard(params);
  const statusUrl = created.data.attributes.statusUrl;
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const status = await pollAiBoardStatus(statusUrl);
      const attrs = status.data.attributes;
      if (attrs.status === "success" && attrs.board) {
        return {
          boardId: attrs.board.id,
          title: attrs.board.attributes?.title,
          url: attrs.board.attributes?.webUrl?.live,
        };
      }
      if (attrs.status === "failed") throw new Error("Padlet AI board creation failed.");
      lastError = undefined;
    } catch (err) {
      if (/Padlet AI board creation failed/.test(err.message)) throw err;
      lastError = err; // transient (network/parse) — keep polling
    }
    await sleep(intervalMs);
  }
  throw lastError ?? new Error(`Padlet AI board creation did not complete within ${(intervalMs * maxAttempts) / 1000}s.`);
}

/**
 * Rewrite seed-post section LABELS into real Padlet section ids.
 * Unmatched labels are dropped (post goes unsectioned) and reported.
 */
export function resolveSeedSections(posts, sections) {
  const labelToId = new Map(sections.map((s) => [s.title, s.id]));
  const sectionIds = new Set(sections.map((s) => s.id));
  const unmatched = new Set();
  const rewritten = posts.map((post) => {
    const label = post.section;
    if (!label) return post;
    if (sectionIds.has(label)) return post;
    const id = labelToId.get(label);
    if (id) return { ...post, section: id };
    unmatched.add(label);
    const { section: _dropped, ...rest } = post;
    return rest;
  });
  return { posts: rewritten, unmatchedLabels: [...unmatched] };
}
