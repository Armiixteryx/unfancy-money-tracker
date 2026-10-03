import { z } from "zod";
import {
  calendarDateSchema,
  transactionInputSchema,
  uuidSchema,
} from "../domain/validation";

export const MAX_AUDIO_BYTES = 1024 * 1024;
export const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
export const voiceRequestSchema = z
  .object({
    requestId: uuidSchema,
    audio: z
      .string()
      .min(4)
      .max(Math.ceil(MAX_AUDIO_BYTES / 3) * 4)
      .regex(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
      ),
    mimeType: z.enum([
      "audio/mp4",
      "audio/m4a",
      "audio/webm",
      "audio/webm;codecs=opus",
      "audio/ogg",
      "audio/ogg;codecs=opus",
    ]),
    durationMs: z.number().int().min(250).max(16000),
    localDate: calendarDateSchema.refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
      );
    }),
    categories: z
      .array(
        z
          .object({
            id: uuidSchema,
            name: z.string().trim().min(1).max(80),
            // Identifies expense Uncategorized, independent of local category protection.
            isFallback: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(255),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.categories.map((c) => c.id)).size !==
        value.categories.length ||
      value.categories.filter((c) => c.isFallback).length !== 1
    ) {
      ctx.addIssue({ code: "custom", message: "Invalid category choices" });
    }
  });
export const voiceResponseSchema = z
  .object({
    requestId: uuidSchema,
    transaction: transactionInputSchema.refine(
      (value) => value.type === "expense",
    ),
  })
  .strict();
export type VoiceRequest = z.infer<typeof voiceRequestSchema>;
export type VoiceResponse = z.infer<typeof voiceResponseSchema>;
export const voiceErrorMessages = {
  invalid_audio: "Recording could not be read. Record again or enter manually.",
  misunderstood:
    "Say one expense with a description, amount, and currency. Record again or enter manually.",
  unsupported_currency:
    "Voice entry supports Colombian pesos, US dollars, and bolívares. Enter other currencies manually.",
  throttled:
    "Voice entry is busy. Wait a moment, then record again or enter manually.",
  credits_exhausted: "Voice entry is temporarily unavailable. Enter manually.",
  unavailable:
    "Voice processing is unavailable. Check your connection or enter manually.",
  timeout: "Voice processing took too long. Record again or enter manually.",
  too_many_categories:
    "There are too many categories for voice entry. Enter manually.",
} as const;
export type VoiceErrorCode = keyof typeof voiceErrorMessages;
