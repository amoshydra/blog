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
  const blocks = rss.channel.item.map(item => {
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

await fs.writeFile("README.md", updated, "utf-8");
