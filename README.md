# Recommendation API

## Getting Started

### Installation
Install the dependencies

```
npm install
```

### Database setup
Create a MySQL database (in MySQL console):
```
create database recommendationapi;
```

Configure your database username and password in config.yaml.

### Download data
Download data from `https://analytics.wikimedia.org/datasets/one-off/article-recommender/20181130.tar.gz`.

### Download data import script and import data into MySQL
```
git clone https://gerrit.wikimedia.org/r/research/article-recommender/deploy
```
Extract the .tar.gz file from the previous step and follow the import
instructions in README.org.

Add language pairs (file names of the extracted files) to
`article['translation_models']` in config.yaml.

### Running
```
npm start server.js | bunyan
```

This starts an HTTP server listening on `localhost:6927`. There are several
routes you may query (with a browser, or `curl` and friends):

* `http://localhost:6927/{domain}/v1/article/creation/morelike/{title}`

Make sure the domain language is one from the keys of the
`article['translation_models']` configuration option (config.yaml).

### Tests

The template also includes a test suite a small set of executable tests. To fire
them up, simply run:

```
npm run test | bunyan
```

If you haven't changed anything in the code (and you have a working Internet
connection), you should see all the tests passing. As testing most of the code
is an important aspect of service development, there is also a bundled tool
reporting the percentage of code covered. Start it with:

```
npm run-script coverage | bunyan
```

### Troubleshooting

In a lot of cases when there is an issue with node it helps to recreate the
`node_modules` directory:

```
rm -r node_modules
npm install
```

Enjoy!

