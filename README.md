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

## Deployment

The deploy workflow runs lint and build on every push and pull request, and deploys `main` to GitHub Pages.
