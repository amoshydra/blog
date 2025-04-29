/**
 * Add base url prefix to a path
 * @param s path
 */
export const withBase = (s = "") => import.meta.env.BASE_URL + s;
