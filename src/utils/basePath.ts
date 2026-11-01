// Astro normalises BASE_URL without a trailing slash, except for the root base
// where it is exactly "/". Concatenating a path that also starts with "/" then
// produced "//posts/...", which a browser reads as a protocol-relative URL
// pointing at a host called "posts". Dropping the separator once keeps
// "/blog/posts/x" for production and "/posts/x" for a root-mounted preview.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Add base url prefix to a path
 * @param s path
 */
export const withBase = (s = "") => BASE + s;
