"""Bring the demo database up to date with production database changes.

Reads (never writes) production's applied migration history, and applies every
migration the demo has not seen yet, in order, each in its own transaction on the
demo. Applied versions are recorded in private.demo_applied_migrations on the demo.

Before applying, rows of the small shared reference tables listed in reference-tables.txt
are copied from production (read-only) into the demo, inserting only rows the demo lacks.
Production migrations sometimes depend on such rows (for example a mock-test version that
references its mock form); without them a migration fails and the demo stops updating.
"""
import os
import sys
from pathlib import Path

import psycopg
from psycopg import sql
from psycopg.types.json import Jsonb

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


def reference_tables():
    path = Path(__file__).with_name("reference-tables.txt")
    if not path.exists():
        return []
    names = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            schema, _, table = line.partition(".")
            if not schema or not table:
                sys.exit(f"refusing: reference table '{line}' must be schema-qualified")
            names.append((schema, table))
    return names


refs = reference_tables()
if refs and pending:
    with psycopg.connect(prod_url, autocommit=True) as prod, psycopg.connect(demo_url, autocommit=False) as demo:
        prod.execute("set default_transaction_read_only = on")
        for schema, table in refs:
            ident = sql.Identifier(schema, table)
            if not demo.execute("select to_regclass(%s) is not null", (f"{schema}.{table}",)).fetchone()[0]:
                demo.rollback()
                print(f"reference table {schema}.{table} not in demo yet; skipped", flush=True)
                continue
            rows = prod.execute(sql.SQL("select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from {} t").format(ident)).fetchone()[0]
            demo.execute("set local session_replication_role = replica")
            cur = demo.execute(
                sql.SQL("insert into {} select * from jsonb_populate_recordset(null::{}, %s::jsonb) on conflict do nothing").format(ident, ident),
                (Jsonb(rows),),
            )
            demo.commit()
            print(f"reference table {schema}.{table}: {cur.rowcount} missing row(s) copied", flush=True)
def apply(demo, version, name, statements, relaxed):
    if relaxed:
        # Production content rows can name production-only users (for example the standing
        # pre-publication pilot student). The demo has no such users, so foreign keys are not
        # enforced for this one migration's transaction. Demo only; production is never written.
        demo.execute("set local session_replication_role = replica")
    for stmt in statements or []:
        if stmt and stmt.strip():
            demo.execute(stmt.encode("utf-8"))
    demo.execute(
        "insert into private.demo_applied_migrations(version, name) values (%s, %s)",
        (version, name),
    )
    demo.commit()


applied = []
with psycopg.connect(demo_url, autocommit=False) as demo:
    demo.execute("set statement_timeout = 0")
    for version, name, statements in pending:
        try:
            apply(demo, version, name, statements, relaxed=False)
        except psycopg.errors.ForeignKeyViolation as exc:
            demo.rollback()
            print(f"::warning title=Demo migration {version} references production-only rows::{str(exc)[:300]}; retrying without foreign-key checks", flush=True)
            try:
                apply(demo, version, name, statements, relaxed=True)
            except Exception as exc2:
                demo.rollback()
                print(f"::error title=Demo migration sync stopped at {version} {name}::{str(exc2)[:900]}", flush=True)
                sys.exit(1)
        except Exception as exc:  # stop at the first failure; later ones may depend on it
            demo.rollback()
            print(f"::error title=Demo migration sync stopped at {version} {name}::{str(exc)[:900]}", flush=True)
            sys.exit(1)
        applied.append(f"{version} {name}")
        print(f"applied {version} {name}", flush=True)

if applied:
    print("::notice title=Demo synced with production::" + "; ".join(applied), flush=True)
