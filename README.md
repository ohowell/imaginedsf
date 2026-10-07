# Imagined San Francisco

Static rebuild of https://github.com/cestastanford/imaginedsf, deployed on GitHub Pages.

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

Layers and groups say where they're listed with `parent`, which names another item by its file name: `parent: burnham-plan` means `content/layers/burnham-plan.md`. A group's parent is an era. A layer's parent is an era, a group, or another layer, like a plan for its details and photos. Layers under layers nest only one level. Basemaps are listed in `site.yml` instead and have no parent. Items under a parent are listed by year, then title. Anything without a parent or basemap listing isn't shown. `wordpressId` keeps each item's ID from the old WordPress site, for matching up old links.

The title in the front matter is each item's top-level heading, so headings in the body start at `##` and don't skip levels. Use headings only for sections, like "Further Reading", not to make text bigger.

The build checks all content and fails with a list of problems if anything is wrong, such as a misspelled field, a parent that doesn't exist, an empty group or era, or a heading at the wrong level. The dev server shows the same errors in the browser, and reloads when content changes.

## Deployment

The deploy workflow runs lint, tests and build on every push and pull request, and deploys `main` to GitHub Pages.
