# Recommendation API

## Getting Started

### Installation
Install the dependencies
```
npm install
```

### Running
```
npm start
```

This starts an HTTP server listening on `localhost:6927`. There are several
routes you may query (with a browser, or `curl` and friends):

* `http://localhost:6927/{domain}/v1/article/morelike/translation/{title}`

### Tests

The template also includes a test suite a small set of executable tests. To fire
them up, simply run:

```
npm test
```

If you haven't changed anything in the code (and you have a working Internet
connection), you should see all the tests passing. As testing most of the code
is an important aspect of service development, there is also a bundled tool
reporting the percentage of code covered. Start it with:

```
npm run-script coverage
```

### Troubleshooting

In a lot of cases when there is an issue with node it helps to recreate the
`node_modules` directory:

```
rm -r node_modules
npm install
```

## Data
### SQL
    SQL files are at scripts/. Once you have a database, you can use the
    *.sql files to create the needed tables.

### Languages
    List of Wikipedia languages are at
    https://github.com/wikimedia/research-translation-recommendation-models/blob/master/wikipedia.langlist

    This list can be used to populate the `language` table. Use the
    following command to do so:
    `python article-recommendation-data-importer.py --load=languages --tsv=wikipedia.langlist`


### Wikidata items
    List of Wikidata items that link to Wikipedia entries on the Main
    namespace is at
    https://github.com/wikimedia/research-translation-recommendation-predictions/blob/master/02012018-07312018/wikidata_items.tsv.tar.gz

    This lis can be used to populate the `wikidata` table. Use the
    following command to do so:
    `python article-recommendation-data-importer.py --load=wikidata_items --tsv=wikidata_items.tsv`


### Article recommendation scores
    Recommendation scores for article creation are at
    https://github.com/wikimedia/research-translation-recommendation-predictions/tree/master/02012018-07312018

    You'll need to remove 'Q' from wikidata ID's first (This way we
    don't have to create a separate table for Wikidata items):

    `sed 's/Q//' predictions-02012018-07312018_ruwiki-uzwiki.tsv > ruwiki-uzwiki.tsv`

    Once languages and wikidata items are in the database, you can load
    the scores into the article_recommendation table like so:

    `python article-recommendation-data-importer.py --load=scores --source='ru' --target='uz' --tsv=ruwiki-uzwiki.tsv`

Enjoy!

