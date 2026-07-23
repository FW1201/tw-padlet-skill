// Ported from edu-agent-kit packages/core/src/models/{common,board}.ts @ a7eaa0f
// Keep field-compatible; edu-agent-kit remains the source of truth.
import { z } from "zod";

export const MediaRef = z
  .object({
    kind: z.enum(["image", "video", "audio", "link", "drive_file", "youtube"]),
    url: z.string().url(),
    title: z.string().max(300).optional(),
    altText: z.string().max(500).optional(),
  })
  .passthrough();

export const BoardPost = z
  .object({
    subject: z.string().max(300).optional(),
    body: z.string().max(8000).default(""),
    media: MediaRef.optional(),
    section: z.string().max(200).optional(),
    color: z.enum(["red", "orange", "green", "blue", "purple"]).optional(),
  })
  .passthrough();

// Teacher comments intentionally accept plain text only.  The API endpoint
// accepts HTML, but letting caller-provided markup through would turn a
// feedback note into an injection surface and makes duplicate detection less
// reliable.  padlet-client.mjs escapes this text before it reaches Padlet.
export const TeacherComment = z
  .object({
    text: z.string().trim().min(1).max(8000),
  })
  .passthrough();

export const TeacherCommentBatch = z
  .array(
    z
      .object({
        postId: z.string().trim().min(1).max(200),
        text: z.string().trim().min(1).max(8000),
      })
      .passthrough(),
  )
  .min(1);

export const Board = z
  .object({
    title: z.string().min(1).max(300),
    description: z.string().max(2000).optional(),
    format: z.enum(["wall", "grid", "columns", "stream", "canvas"]).default("columns"),
    sections: z.array(z.string().min(1).max(200)).default([]),
    seedPosts: z.array(BoardPost).default([]),
  })
  .passthrough();
