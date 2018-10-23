#!/usr/bin/python3

# Data is currently available at:
# https://github.com/wikimedia/research-translation-recommendation-predictions

import argparse
import mysql.connector


HOST = 'localhost'
PORT = '3306'
USER = 'root'
PASSWORD = 'root'
DATABASE = 'recommendationapi'
REC_TABLE = 'article_recommendation'
LANG_TABLE = 'language'


def get_cmd_options():
    parser = argparse.ArgumentParser(
        description='Imports recommendations to MySQL.')
    parser.add_argument(
        '--load',
        help='Load "languages" or "scores" into the database')
    parser.add_argument('--source', help='Source language')
    parser.add_argument('--target', help='Target language')
    parser.add_argument('--tsv', help='TSV file with recommendations')
    return parser.parse_args()


def get_lang_id(cursor, lang):
    cursor.execute("SELECT id FROM %s WHERE code='%s' LIMIT 1;" %
                   (LANG_TABLE, lang))
    try:
        return cursor.fetchone()[0]
    except TypeError:
        print("No such language: %s" % lang)
        return None


def load_languages(cursor, tsv_file):
    """Load languages into the database"""
    load_data = "LOAD DATA LOCAL INFILE '%s' INTO TABLE %s "\
        "FIELDS TERMINATED BY '\t' LINES TERMINATED BY '\n' "\
        "(code) "\
        "SET id=NULL" %\
        (tsv_file, LANG_TABLE)
    cursor.execute(load_data)


def load_scores(cursor, tsv_file, source_id, target_id):
    """Load recommendation scores into the database"""
    load_data = "LOAD DATA LOCAL INFILE '%s' INTO TABLE %s "\
        "FIELDS TERMINATED BY '\t' LINES TERMINATED BY '\n' "\
        "IGNORE 1 LINES "\
        "(wikidata_id, score) "\
        "SET id=NULL, source_id=%d, target_id=%d;" %\
        (tsv_file, REC_TABLE, source_id, target_id)
    cursor.execute(load_data)


def main():
    ctx = mysql.connector.connect(
        host=HOST, port=PORT, user=USER, passwd=PASSWORD, database=DATABASE)
    cursor = ctx.cursor()
    options = get_cmd_options()

    if options.load == "languages":
        load_languages(cursor, options.tsv)
    elif options.load == "scores":
        source_id = get_lang_id(cursor, options.source)
        target_id = get_lang_id(cursor, options.target)
        if not source_id or not target_id:
            exit()
        load_scores(cursor, options.tsv, source_id, target_id)
    else:
        print('Wrong --load option.')
        exit()

    ctx.commit()
    cursor.close()
    ctx.close()


if __name__ == '__main__':
    main()
