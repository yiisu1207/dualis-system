const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');

const isTsx = (file) => file.endsWith('.tsx') || file.endsWith('.jsx');

const listFiles = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (entry.isFile() && isTsx(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
};

const hasOnClick = (tag) => /\bonClick\s*=/.test(tag);
const hasSubmitType = (tag) => /\btype\s*=\s*{?\s*["']submit["']\s*}?/.test(tag);

const scanFile = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const matches = content.matchAll(/<button[\s\S]*?>/g);
  const results = [];

  for (const match of matches) {
    const tag = match[0];
    const index = match.index ?? 0;
    const line = content.slice(0, index).split('\n').length;
    const ok = hasOnClick(tag) || hasSubmitType(tag);
    results.push({
      filePath,
      line,
      ok,
      tag: tag.replace(/\s+/g, ' ').trim().slice(0, 120),
    });
  }

  return results;
};

const files = listFiles(SRC_DIR);
const all = files.flatMap(scanFile);
const needsReview = all.filter((item) => !item.ok);

if (needsReview.length === 0) {
  console.log('Button audit: no unhandled <button> tags found.');
  process.exit(0);
}

console.log('Button audit: review buttons without onClick or type="submit".');
for (const item of needsReview) {
  const rel = path.relative(ROOT, item.filePath).replace(/\\/g, '/');
  console.log(`- ${rel}:${item.line} ${item.tag}`);
}
