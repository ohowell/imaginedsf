# Imagined San Francisco

Static rebuild of https://github.com/cestastanford/imaginedsf, deployed on GitHub Pages. To edit the content, see [Editing online](#editing-online) below.

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

After building, you can run a server over the built files with:

```sh
npm run preview
```

### Testing

The content pipeline has unit tests, which you can run with:

```sh
npm test
```

## Content

Site content lives in `content/` as Markdown files with YAML front matter, one file per item:

- `layers/`: anything with data to draw on the map, like a scanned map, a set of photo pins, or a basemap. The front matter sets the title, year, source and bounding box, and the body is the description.
- `groups/`: titled, described sets of layers, with no data of their own.
- `eras/`: proposal eras, each with a title, start and end year, and description.
- `pages/`: the introduction, maps and plans intro, bibliography, credits and feedback pages.
- `site.yml`: the basemaps, and which one shows first.

Eras, groups and layers list what's under them, naming other files by file name: `layers: [burnham-plan.md]` means `content/layers/burnham-plan.md`. Eras list `groups` and `layers`, groups list `layers`, and layers can list `layers` too, like a plan's details and photos. Layers under layers nest only one level. Each item is listed in one place, and basemaps are listed in `site.yml` instead. Items are shown by year, then title, whatever order they're listed in. Anything that isn't listed isn't shown. A layer's `showWith` names a layer the same way. `wordpressId` keeps each item's ID from the old WordPress site, for matching up old links.

The address keeps up with the map, so it can be copied and shared, and file names are part of it: `#layers=burnham-plan:0.5,existing-city&basemap=aerial-imagery&bbox=-122.48,37.76,-122.39,37.81` shows those layers from bottom to top, the first at half opacity, on aerial imagery, fitted to that box (west, south, east, north). Each part is optional, and links can be written by hand: `#layers=burnham-plan` zooms to that layer's bounding box. Renaming a layer's file breaks links to it, and links naming layers that don't exist leave them out. Links from the old site, which encoded its state in base64 and named items by WordPress ID, still open and turn into new ones, so changing or removing a `wordpressId` breaks those.

The title in the front matter is each item's top-level heading, so headings in the body start at `##` and don't skip levels. Use headings only for sections, like "Further Reading", not to make text bigger.

The build checks all content and fails with a list of problems if anything is wrong, such as a misspelled field, a listed file that doesn't exist, an empty group or era, or a heading at the wrong level. The dev server shows the same errors in the browser, and reloads when content changes.

### Editing online

Content can also be edited in the browser with [Pages CMS](https://pagescms.org), set up by `.pages.yml`. To use it, sign in at [app.pagescms.org/ohowell/imaginedsf](https://app.pagescms.org/ohowell/imaginedsf) with GitHub. Each save is a commit to `main`, which deploys like any other, so an edit the build rejects leaves the site as it was until it's fixed; the failed run's log lists the problems.

Pages CMS removes front matter fields it doesn't know about when it saves a file, so a new field has to be added to `.pages.yml` along with `plugins/content/schema.ts`. Saving also rewrites the front matter in its own style, like putting each number in `bbox` on its own line, which doesn't change what it says.

Descriptions are edited as rich text and saved as Markdown, but editing one rewrites all of it in the editor's own Markdown, which drops any HTML and deletes backslash escapes along with what they escape: `\[sic\]` becomes `sic`. So descriptions use neither. An image's caption is the paragraph after it, and brackets are left unescaped, which Markdown shows as written unless they make a link.

## Deployment

The deploy workflow runs lint, tests and build on every push and pull request, and deploys `main` to GitHub Pages.
