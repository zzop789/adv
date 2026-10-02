import fs from 'node:fs/promises';
import path from 'node:path';

export async function configurationBytes(root: string): Promise<[Buffer, Buffer]> {
  return Promise.all([fs.readFile(path.join(root, 'game.json')), fs.readFile(path.join(root, 'assets.json'))]);
}

export async function cleanTemporary(file: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.unlink(file);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return;
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '') || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}
