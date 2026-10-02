import { XMLParser } from "fast-xml-parser";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";

const NL = "\n";
const MARK_START = "<!-- POSTS:START -->"
const MARK_END = "<!-- POSTS:END -->"

const readme = await fs.readFile("README.md", "utf-8");
const lines = readme.split(NL)
const a = lines.findIndex(x => x === MARK_START)
const b = lines.findLastIndex(x => x === MARK_END)

if (a < 0 || b < 0) {
  throw new Error(`README.md is missing the ${MARK_START} / ${MARK_END} markers.`);
}

const pre = lines.slice(0, a).join(NL);
const post = lines.slice(b + 1).join(NL);


const content = await (async () => {
  if (!existsSync("dist/rss.xml")) {
    throw new Error("this generation relies on rss.xml. Please run build first.");
  }
  const xml = await fs.readFile("dist/rss.xml", "utf-8");

  const parser = new XMLParser({

  });
  const { rss } = parser.parse(xml);

  // Sorted here rather than trusting the feed's order. The feed is sorted too,
  // but this script is the only consumer that cares, and reading a build
  // artefact should not depend on an unrelated file having sorted it first.
  const items = [...rss.channel.item].sort(
    (x, y) => new Date(y.pubDate) - new Date(x.pubDate),
  );

  const blocks = items.map(item => {
    const d = new Date(item.pubDate);
    const date = [
      d.getFullYear(),
      (d.getMonth() + 1).toString().padStart(2, "0"),
      d.getDate().toString().padStart(2, "0"),
    ].join("-");
    return `- ${date} [${item.title}](${item.link})`;
  })

  return NL + blocks.join(NL + NL) + NL;
})();


const updated = [
  pre,
  MARK_START,
  content,
  MARK_END,
  post,
].join("\n")

// --check reports staleness without touching the file, so CI can fail on a
// README that has drifted instead of silently shipping one.
if (process.argv.includes("--check")) {
  if (updated !== readme) {
    console.error("README.md post list is out of date. Run `pnpm readme` and commit.");
    process.exit(1);
  }
  console.log("README.md post list is up to date.");
} else {
  await fs.writeFile("README.md", updated, "utf-8");
  console.log("README.md post list updated.");
}