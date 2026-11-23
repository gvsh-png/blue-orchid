/**
 * Checks the docs agents rely on: every page in docs/ is linked from docs/README.md, and every relative link in
 * docs/, AGENTS.md files and skills points at a file that exists.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const root = join(import.meta.dirname, "../..");
const skip = new Set(["node_modules", ".git", ".void", "dist", ".cloudflare", ".alchemy"]);

const walk = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (skip.has(entry.name)) {
      return [];
    }
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });

const markdown = walk(root).filter(
  (path) =>
    path.endsWith(".md") && (path.includes("/docs/") || path.endsWith("AGENTS.md") || path.includes("/.claude/")),
);

const problems: Array<string> = [];

for (const file of markdown) {
  for (const [, target = ""] of readFileSync(file, "utf8").matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
    if (/^[a-z]+:/i.test(target)) {
      continue;
    }
    if (!existsSync(join(dirname(file), target))) {
      problems.push(
        `${relative(root, file)} links to ${target}, which does not exist. Fix the path or remove the link.`,
      );
    }
  }
}

const index = readFileSync(join(root, "docs/README.md"), "utf8");
for (const page of markdown.filter((path) => path.includes("/docs/") && !path.endsWith("docs/README.md"))) {
  const link = relative(join(root, "docs"), page);
  if (!index.includes(`(${link})`)) {
    problems.push(`docs/${link} is not linked from docs/README.md. Add a line for it there, so agents can find it.`);
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join("\n")}\n`);
  process.exitCode = 1;
}
