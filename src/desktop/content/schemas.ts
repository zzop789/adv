import { z } from 'zod';

const id = z.string().regex(/^[a-zA-Z0-9_-]+$/);
export const gameSchema = z.object({
  schemaVersion: z.literal(2),
  id,
  title: z.string().min(1),
  subtitle: z.string(),
  description: z.string(),
  entryNodeId: id,
  build: z.object({
    executableName: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
      .refine((value) => !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value)),
    appId: z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/),
    icon: z.string().min(1),
  }),
});
export const assetsSchema = z.object({
  schemaVersion: z.literal(1),
  videos: z.record(id, z.object({ file: z.string().min(1) })),
});
