"""Bound Auth pooling on the disposable local stack; never contacts hosted Auth."""
import json
import subprocess

name = "supabase_auth_brains-classroom-local"
original = json.loads(subprocess.check_output(["docker", "inspect", name]))[0]
config = original["Config"]
assert config["Image"].startswith("public.ecr.aws/supabase/gotrue:")
assert not original["Mounts"] and not original["HostConfig"]["PortBindings"]
networks = original["NetworkSettings"]["Networks"]
assert list(networks) == ["supabase_network_brains-classroom-local"]
args = ["docker", "run", "-d", "--name", name, "--network", next(iter(networks))]
for alias in networks[next(iter(networks))].get("Aliases", []):
    if alias and alias != original["Id"][:12]:
        args += ["--network-alias", alias]
for key, value in (config.get("Labels") or {}).items():
    args += ["--label", key + "=" + value]
for value in config["Env"]:
    if not value.startswith(("GOTRUE_DB_MAX_POOL_SIZE=", "GOTRUE_DB_MAX_IDLE_POOL_SIZE=")):
        args += ["--env", value]
args += ["--env", "GOTRUE_DB_MAX_POOL_SIZE=20", "--env", "GOTRUE_DB_MAX_IDLE_POOL_SIZE=20"]
args += [config["Image"]] + config["Cmd"]
subprocess.run(["docker", "stop", name], check=True, stdout=subprocess.DEVNULL)
subprocess.run(["docker", "rm", name], check=True, stdout=subprocess.DEVNULL)
# Do not log these arguments: they preserve the local stack's signing keys.
completed = subprocess.run(args, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
if completed.returncode:
    raise SystemExit("Local Auth recreation failed; inspect Docker status privately")
print("Local Auth pool bounded to 20 connections")
