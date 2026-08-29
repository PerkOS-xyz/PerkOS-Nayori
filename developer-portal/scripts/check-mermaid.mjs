import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
const { default: mermaid } = await import('mermaid');

const root = new URL('../content/docs/', import.meta.url).pathname;

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory)) {
    const path = join(directory, entry);
    if ((await stat(path)).isDirectory()) files.push(...(await walk(path)));
    else if (/\.mdx$/.test(entry)) files.push(path);
  }
  return files;
}

const diagrams = [];
for (const file of await walk(root)) {
  const content = await readFile(file, 'utf8');
  for (const match of content.matchAll(/<Mermaid[\s\S]*?chart=\{`([\s\S]*?)`\}[\s\S]*?\/>/g)) {
    diagrams.push({ file, chart: match[1] });
  }
}

if (diagrams.length === 0) throw new Error('No Mermaid diagrams found.');

for (const diagram of diagrams) {
  await mermaid.parse(diagram.chart);
}

const component = await readFile(new URL('../components/mermaid.tsx', import.meta.url), 'utf8');
if (!component.includes("const STACKS_ORANGE = '#FC6432'")) {
  throw new Error('Mermaid component does not use the canonical Stacks orange #FC6432.');
}

console.log(`Mermaid valid · ${diagrams.length} diagrams · Stacks orange #FC6432`);
