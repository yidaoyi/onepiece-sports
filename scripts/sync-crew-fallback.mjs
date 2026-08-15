// 把 crew-data.js 的兜底语料导出到眼镜端工程 roki/onepiece-coach/assets/crew-fallback.js
// 人设的唯一来源仍是 netlify/functions/crew-data.js，修改后运行：npm run sync:crew

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { CREW } = require('../netlify/functions/crew-data.js');

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const coachDir =
  process.env.COACH_DIR ||
  path.resolve(scriptDir, '..', '..', '..', 'roki', 'onepiece-coach');

const entries = CREW.map(
  ({ name, fallback }) =>
    `  { name: ${JSON.stringify(name)}, fallback: ${JSON.stringify(fallback)} },`
).join('\n');

const output = [
  '// 本文件由 onepiece-sports/scripts/sync-crew-fallback.mjs 生成，请勿手改。',
  '// 修改人设请改 netlify/functions/crew-data.js，然后运行 npm run sync:crew',
  '',
  'export const CREW_FALLBACK = [',
  entries,
  '];',
  '',
].join('\n');

const outFile = path.join(coachDir, 'assets', 'crew-fallback.js');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, output, 'utf8');
console.log(`已生成 ${outFile}`);
