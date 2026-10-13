import { lstat } from 'node:fs/promises';
import { join } from 'node:path';

export const LOCAL_MODELS_FILE = '.rer/local/models.json';
/** Refuse presence, including symlinks: never read this key to build a plan. */
export async function refuseLocalModels(root) {
  try { await lstat(join(root, LOCAL_MODELS_FILE)); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  throw new Error('local-only-models-file');
}
