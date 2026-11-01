# [amoshydra's blog](https://amoshydra.github.io/blog)

<!-- POSTS:START -->

- 2026-09-30 [Overriding `env(safe-area-inset-*)` in a WebView: Android and iOS](https://amoshydra.github.io/blog/posts/webview-safe-area-inset-override/)

- 2026-09-19 [Why `USD123.45` becomes “US dollars” but `SGD123.45` gets spelled out](https://amoshydra.github.io/blog/posts/screen-reader-currency-announcements/)

- 2026-09-14 [Locating elements in a WebView: a pattern-by-pattern playbook](https://amoshydra.github.io/blog/posts/webview-testing-locators/)

- 2026-09-10 [WebView in `uiautomator dump`: what your HTML actually turns into](https://amoshydra.github.io/blog/posts/webview-uiautomator-dump/)

- 2026-08-27 [HTTP ETags and content-encoding: how Apache's gzip breaks revalidation (a hands-on study)](https://amoshydra.github.io/blog/posts/http-etag-content-encoding-study/)

- 2026-08-18 [HTTP cache validators: ETag vs Last-Modified (a hands-on study)](https://amoshydra.github.io/blog/posts/http-etag-last-modified-study/)

- 2025-07-21 [A visual guide of Node.js module resolution](https://amoshydra.github.io/blog/posts/nodejs-module-resolution/)

- 2025-07-18 [ES Module Import Syntax Change: From `assert` to `with`](https://amoshydra.github.io/blog/posts/es-module-import-syntax-change-from-assert-to-with/)

<!-- POSTS:END -->

<br /><br /><br /><br />

## Development


This project is built on [astro](https://docs.astro.build/en/getting-started/).

```bash
pnpm i
pnpm dev
```

### Pull request previews

Every pull request builds the site, and once a maintainer adds the `preview`
label it deploys to
`https://pr-<number>.amoshydra-github-io-blog-preview.pages.dev`. The link is
posted as a single comment on the PR and updates on every push, so it keeps
pointing at the latest commit.

A preview is only deployed when **both** hold:

- the opener is a collaborator (or `OWNER`/`MEMBER`), or is listed in
  [`.github/preview-allowlist.txt`](./.github/preview-allowlist.txt), which is
  read from the default branch so a PR cannot approve itself; and
- a maintainer added the `preview` label. Labels survive new pushes, so an
  approved PR keeps its preview while the contributor iterates.

The build runs with no secrets. Only `.github/workflows/preview-deploy.yml`
can read the Cloudflare token, and it never executes anything from the PR — it
downloads the build artifact and uploads the static files.

One-time setup, all under repository settings:

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | your Cloudflare account ID (environment `preview`) |
| Variable | `PREVIEW_HOST` | `amoshydra-github-io-blog-preview.pages.dev` (repository) |
| Environment secret | `preview` → `CLOUDFLARE_API_TOKEN` | a custom token with **Account → Cloudflare Pages → Edit** only |

`PREVIEW_HOST` has to be a repository variable, not an environment variable:
the build job deliberately does not enter the `preview` environment, so it
cannot read environment-scoped variables.

There is nothing to click in the Pages dashboard. Do **not** use *Create
application → Connect GitHub*: that sets up a Workers Build, which builds from
a GitHub App and cannot gate on who opened the pull request. The deploy job is a
direct upload that creates the `amoshydra-github-io-blog-preview` project on
first run.

Keep that Pages project on `pages.dev` with no custom domain. A leaked token
can then only publish junk to a throwaway subdomain, and previews are sent with
`X-Robots-Tag: noindex`.

Previews are not deleted automatically. To remove one:

```bash
npx wrangler pages deployment list --project-name=amoshydra-github-io-blog-preview
npx wrangler pages deployment delete <deployment-id>
```

<br /><br /><br /><br />


## License

See [LICENSE](./LICENSE)

<br /><br /><br /><br />
