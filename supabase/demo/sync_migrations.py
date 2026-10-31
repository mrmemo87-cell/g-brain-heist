"""Bring the demo database up to date with production database changes.

Reads (never writes) production's applied migration history, and applies every
migration the demo has not seen yet, in order, each in its own transaction on the
demo. Applied versions are recorded in private.demo_applied_migrations on the demo.
"""
import os
import sys

import psycopg

prod_url = os.environ["PROD_DB_URL"]
demo_url = os.environ["DEMO_DB_URL"]
if "sozodkxwhubespiedgxm" not in prod_url:
    sys.exit("refusing: PROD_DB_URL is not the production project")
if "lvkmkgjpcbdyzdkbqcgc" not in demo_url or "sozodkxwhubespiedgxm" in demo_url:
    sys.exit("refusing: DEMO_DB_URL is not the demo project")

with psycopg.connect(demo_url, autocommit=True) as demo:
    marker = demo.execute("select to_regclass('private.demo_environment') is not null").fetchone()[0]
    if not marker:
        sys.exit("refusing: demo marker table missing")
    last = demo.execute("select max(version) from private.demo_applied_migrations").fetchone()[0]
    if last is None:
        sys.exit("refusing: no baseline in private.demo_applied_migrations")

with psycopg.connect(prod_url, autocommit=True) as prod:
    prod.execute("set default_transaction_read_only = on")
    pending = prod.execute(
        "select version, name, statements from supabase_migrations.schema_migrations "
        "where version > %s order by version",
        (last,),
    ).fetchall()

print(f"demo is at {last}; {len(pending)} new production migration(s)", flush=True)
applied = []
with psycopg.connect(demo_url, autocommit=False) as demo:
    demo.execute("set statement_timeout = 0")
    for version, name, statements in pending:
        try:
            for stmt in statements or []:
                if stmt and stmt.strip():
                    demo.execute(stmt.encode("utf-8"))
            demo.execute(
                "insert into private.demo_applied_migrations(version, name) values (%s, %s)",
                (version, name),
            )
            demo.commit()
            applied.append(f"{version} {name}")
            print(f"applied {version} {name}", flush=True)
        except Exception as exc:  # stop at the first failure; later ones may depend on it
            demo.rollback()
            print(f"::error title=Demo migration sync stopped at {version} {name}::{str(exc)[:900]}", flush=True)
            sys.exit(1)

if applied:
    print("::notice title=Demo synced with production::" + "; ".join(applied), flush=True)
