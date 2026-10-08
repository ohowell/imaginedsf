# Imagined San Francisco

Static rebuild of [the original CESTA project](https://github.com/cestastanford/imaginedsf), deployed on GitHub Pages. To edit content, see [Editing online](#editing-online) below.

## Content

Site content lives in `content/` as Markdown files with YAML front matter, one file per item:

- `eras/`: top-level groups shown in the sidebar with a description.
- `layers/`: anything with data to draw on the map, like a scanned map, a set of photo pins, or a basemap.
- `groups/`: have a title, description, and a list of layers, but no map data of their own.
- `pages/`: content for the introduction, bibliography, credits and feedback pages.

Eras, groups and layers list what's under them, naming other files by file name: `layers: [burnham-plan.md]` means `content/layers/burnham-plan.md`. Eras list `groups` and `layers`, groups list `layers`, and layers can list `layers` too (e.g. a map that has a nested layer of photos). Items in the sidebar are ordered by year, then title. Anything that isn't listed as a child of another item isn't shown. `wordpressId` keeps each item's ID from the old WordPress site, so that old links to the site still work.

Each page, and each layer and group with a description, has an address of its own named after its file, like `/layers/burnham-plan/`, which opens it over the map. The build makes an HTML page at each address with its title, description and text, for search engines and link previews, and lists them in `sitemap.xml`. Addresses from the old site, like `/description/569`, lead to the same pages.

The build checks all content and fails with a list of problems if anything is wrong, such as a misspelled field, a listed file that doesn't exist, an empty group or era, or a heading at the wrong level. The dev server shows the same errors in the browser, and reloads when content changes.

### Editing online

> [!WARNING]
> Saving a rich text description in Pages CMS rewrites it in its own style, which drops any HTML and deletes backslash escapes along with what they escape: `\[sic\]` becomes `sic`. Brackets should be entered literally instead of escaped.

Content is edited in the browser with [Pages CMS](https://pagescms.org), configured by `.pages.yml`. To use it, sign in at [app.pagescms.org/ohowell/imaginedsf](https://app.pagescms.org/ohowell/imaginedsf) with GitHub. When you save a file, it gets committed to `main`. If this results in a build error, the deployed site won't change, because the workflow only deploys if the build succeeds.

Each content item uses its title from the front matter as a top-level heading (`h1`), so headings in the body description should start at `h2` and not skip levels. There's no way to enforce this using Pages CMS, but the build checks for it and will fail if it finds a heading at the wrong level. If you made changes but they didn't show up in the deployed site, this might be why – check [the build log in GitHub Actions](https://github.com/ohowell/imaginedsf/actions) for errors.

## Development

Requires [Node.js](https://nodejs.org/en/download). Install dependencies:

```sh
npm install
```

Then, you can run a live dev server:

```sh
npm run dev
```

### Formatting

Code is linted with oxlint and prettier. To check code style:

```sh
npm run lint
```

To reformat everything:

```sh
npm run format
```

### Building

You can build the site for production with:

```sh
npm run build
```

Pages link to themselves and their preview images by full URL, so the build takes the address the site will be deployed at from `SITE_URL`, like `SITE_URL=https://imaginedsanfrancisco.org npm run build`. The deploy workflow sets it to the GitHub Pages address.

After building, you can run a server over the built files with:

```sh
npm run preview
```

### Testing

The content pipeline has unit tests, which you can run with:

```sh
npm test
```

## Deployment

The deploy workflow runs lint, tests and build on every push and pull request, and deploys `main` to GitHub Pages.
