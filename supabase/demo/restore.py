"""Restore schema + content into the demo project in one transaction.

The schema is sent as a single simple-query batch (one network round trip)
instead of thousands of separate statements. Content is loaded with COPY.
Only ever connects to BH_DEMO_DB_URL.
"""
import os
import re
import sys

import psycopg

schema_path, content_path = sys.argv[1], sys.argv[2]
url = os.environ["DEMO_DB_URL"]
if "lvkmkgjpcbdyzdkbqcgc" not in url or "sozodkxwhubespiedgxm" in url:
    sys.exit("refusing: DEMO_DB_URL is not the demo project")

# psql meta-commands (e.g. \restrict / \unrestrict from newer pg_dump) are not SQL.
meta = re.compile(r"^\\\S.*$", re.M)
schema = meta.sub("", open(schema_path, encoding="utf-8").read())

copy_re = re.compile(r"^COPY (.+?) FROM stdin;$", re.M)


def copy_blocks(text):
    """Yield ('sql', stmt_text) and ('copy', header, rows) chunks from a pg_dump data file."""
    pos = 0
    for m in copy_re.finditer(text):
        yield ("sql", text[pos:m.start()])
        end = text.index("\n\\.\n", m.end())
        yield ("copy", m.group(0)[:-len(" FROM stdin;")] + " FROM STDIN", text[m.end() + 1:end + 1])
        pos = end + len("\n\\.\n")
    yield ("sql", text[pos:])


content = open(content_path, encoding="utf-8").read()

with psycopg.connect(url, autocommit=False, prepare_threshold=None) as conn:
    conn.execute("set statement_timeout = 0")
    print(f"schema: {len(schema):,} bytes in one batch", flush=True)
    conn.execute(schema.encode("utf-8"))
    conn.execute("set session_replication_role = replica")
    copied = 0
    for kind, *rest in copy_blocks(content):
        if kind == "sql":
            sql = meta.sub("", rest[0]).strip()
            if sql:
                conn.execute(sql.encode("utf-8"))
        else:
            header, rows = rest
            with conn.cursor().copy(header.encode("utf-8")) as cp:
                cp.write(rows.encode("utf-8"))
            copied += 1
    conn.execute("set session_replication_role = origin")
    conn.commit()
    print(f"restored schema and {copied} content tables", flush=True)
