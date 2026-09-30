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

- `maps/`: map layers. The front matter sets the title, year, map source and bounding box, and the body is the description.
- `groups/`: groups of maps, listed under `maps`.
- `eras/`: proposal eras, listing maps and groups under `items`.
- `narratives/`: narratives.
- `pages/`: the introduction, maps and plans intro, bibliography, credits and feedback pages.
- `site.yml`: the basemaps, the default basemap, and the order of narratives.

Items refer to each other by file name, so listing `fulton-circle` in an era means `content/maps/fulton-circle.md`. A map only appears on the site once it's listed in an era, a group or the basemaps. `wordpressId` keeps each item's ID from the old WordPress site, for matching up old links.

The title in the front matter is each item's top-level heading, so headings in the body start at `##` and don't skip levels. Use headings only for sections, like "Further Reading", not to make text bigger.

The build checks all content and fails with a list of problems if anything is wrong, such as a misspelled field, a reference to a missing map, a map listed in two places, or a heading at the wrong level. The dev server shows the same errors in the browser, and reloads when content changes.

### Importing from WordPress

`content/` was generated from the WordPress site by `scripts/import-wordpress.ts`. Running the import again replaces everything in `content/`, so don't run it once content has been edited here:

```sh
npm run import-wordpress
```

## Deployment

The deploy workflow runs lint, tests and build on every push and pull request, and deploys `main` to GitHub Pages.
