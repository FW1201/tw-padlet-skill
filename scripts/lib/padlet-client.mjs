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
      `再 export PADLET_API_KEY=... 或寫入 ${CONFIG_PATH}。沒有 key 時可改用本 skill 的 Playwright 路徑（scripts/pw/）。`,
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
    // Status + Padlet error message only — never request headers.
    throw new Error(`Padlet API ${res.status}: ${detail}`);
  }
  return body;
}

/** Map a core BoardPost to the Padlet JSON:API post body. No network I/O. */
export function buildPostPayload(post) {
  const content = { body: post.body };
  if (post.subject !== undefined) content.subject = post.subject;
  if (post.media !== undefined) {
    const caption = post.media.title ?? post.media.altText;
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

export async function addPost(boardId, post) {
  return request(`${PADLET_BASE_URL}/boards/${boardId}/posts`, {
    method: "POST",
    json: buildPostPayload(post),
  });
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

/** Create an AI recipe board and poll until ready (3s × 40 ≈ 2 min). */
export async function createAiBoardAndWait(params, { intervalMs = 3000, maxAttempts = 40 } = {}) {
  const created = await createAiBoard(params);
  const statusUrl = created.data.attributes.statusUrl;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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
    await sleep(intervalMs);
  }
  throw new Error(`Padlet AI board creation did not complete within ${(intervalMs * maxAttempts) / 1000}s.`);
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
