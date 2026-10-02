import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { SITE_TITLE, SITE_DESCRIPTION } from "../consts";

export async function GET(context) {
  const posts = (await getCollection("posts")).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );

  // context.site is the bare origin with no base, so the channel link was coming
  // out as https://amoshydra.github.io/, which 404s. Readers treat it as the
  // site's homepage and resolve relative URLs against it, so the feed was
  // advertising a dead page. Item links carry the base by hand below, so the two
  // had drifted apart.
  //
  // context.config is not available here, so importBase is the supported way to
  // reach the configured base. If it is ever absent the base is empty and site
  // is the bare origin, which is the old behaviour.
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const site = new URL(context.site).href.replace(/\/$/, "") + base;
  const feedUrl = site + "/rss.xml";

  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site,
    // rss() has no option for atom:link, only customData for the channel head.
    // Without a self reference a reader has no canonical URL for the feed, so two
    // copies of it cannot be told apart.
    xmlns: { atom: "http://www.w3.org/2005/Atom" },
    customData: `<atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />`,
    items: posts.map((post) => ({
      // Named rather than spreading post.data, which handed every frontmatter key
      // to the feed. heroImage is a repo-relative path that means nothing to a
      // reader, and anything private in frontmatter would ride along unnoticed.
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/blog/posts/${post.id}/`,
    })),
  });
}