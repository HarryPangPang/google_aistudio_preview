import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 回退两层到 preview 根目录，然后进入 .tmp
export const PROJECT_ROOT = path.resolve(__dirname, '../../');
export const TMP_DIR = path.join(PROJECT_ROOT, '.tmp');
export const PLAYGROUND_DIST_DIR = path.join(PROJECT_ROOT, 'playground-dist');
export const PORT = 1234;
