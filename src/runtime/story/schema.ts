import { z } from 'zod';

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
export const nodeEffectSchema = z.object({
  preset: z.enum(['none', 'fade', 'slide-up']),
  durationMs: z.number().finite().min(0).max(10_000),
}).strict();
const effect = nodeEffectSchema.optional();
const videoNodeSchema = z.object({ id, type: z.literal('video'), mediaId: id, next: id, effect }).strict();
const choiceNodeSchema = z.object({
  id, type: z.literal('choice'), prompt: z.string().min(1), effect,
  options: z.array(z.object({ id, label: z.string().min(1), description: z.string().optional(), next: id }).strict()).min(1),
}).strict();
const endNodeSchema = z.object({ id, type: z.literal('end'), title: z.string().min(1), description: z.string(), effect }).strict();

export const storySchema = z.object({
  schemaVersion: z.literal(1),
  nodes: z.array(z.discriminatedUnion('type', [videoNodeSchema, choiceNodeSchema, endNodeSchema])).min(1),
}).strict();
