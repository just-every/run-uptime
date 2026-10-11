import { cp, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { privateDirectory, writePrivateFile } from '../base-onboarding/private-files.mjs';

export const ownerProduct = '.rer/deploy/product';
export async function prepareOwnerBuild(root) {
  const directory = await privateDirectory(root, ['.rer', 'deploy']);
  await writePrivateFile(join(directory, '.gitignore'), '*\n');
  const stage = await mkdtemp(join(directory, 'prepare-'));
  try {
    const product = join(stage, 'product');
    await mkdir(join(product, 'migrations', 'core'), { recursive: true });
    await cp(join(root, 'dist'), join(product, 'dist'), { recursive: true });
    await cp(join(root, 'migrations'), join(product, 'migrations', 'core'), { recursive: true });
    await rm(join(root, ownerProduct), { recursive: true, force: true });
    await rename(product, join(root, ownerProduct));
    return ownerProduct;
  } finally { await rm(stage, { recursive: true, force: true }); }
}
