# Spec for docker-stack-management-scripts

branch: claude/feature/docker-stack-management-scripts

## Summary

Replace the current ad-hoc `warren` CLI script with a cohesive set of management scripts for the Docker-based infrastructure stack. The scripts must cover: first-time setup (generating config and credentials), start, stop, restart, and a destructive full-reset that wipes all data and configuration so the stack can be initialised from scratch.

## Functional Requirements

- **setup**: Runs first-time initialisation. Generates all required config files (Mosquitto passwords, InfluxDB tokens, `.env` files, etc.), creates required directories, and starts the stack. Must be idempotent — re-running it on an already-configured stack should warn and exit without overwriting existing credentials.
- **start**: Brings up all Docker Compose services in detached mode. Prints a short status summary after services are up.
- **stop**: Gracefully stops all running services without removing containers or volumes.
- **restart**: Stops then starts the stack. Supports an optional service name argument to restart a single service (e.g. `restart mosquitto`).
- **clear** (full reset): Stops the stack, removes all containers, volumes, and generated config/credential files, returning the working directory to a pre-setup state. Must prompt the user for confirmation before destroying data. Documents clearly which paths will be deleted.
- All scripts must be located under `docker/` and be executable shell scripts (or a single dispatcher script with sub-commands).
- Each command must print concise usage help when called with `--help` or with no arguments.
- Exit with a non-zero code on failure and print a human-readable error message.

## Possible Edge Cases

- Running `setup` when the stack is already running — should not restart or overwrite.
- Running `start` before `setup` has been run — should detect missing config and prompt the user to run `setup` first.
- Running `clear` while services are still up — script must stop services before deleting data.
- Partial setup state (setup was interrupted mid-run) — `clear` should still work; `setup` should detect and offer to reset.
- Running scripts from a directory other than `docker/` — paths should resolve relative to the script location, not the caller's CWD.
- Docker or Docker Compose not installed — fail early with a clear dependency error.

## Acceptance Criteria

- A fresh clone can be fully initialised with a single `./setup` (or equivalent) command with no manual file editing.
- `start` / `stop` / `restart` all work without requiring arguments for the common case.
- `clear` deletes all generated credentials, config files, named Docker volumes, and container state, leaving only tracked source files.
- After running `clear` followed by `setup`, the stack starts successfully from a clean state.
- Each script exits 0 on success and non-zero on failure.
- `--help` output lists all available sub-commands with a one-line description.

## Open Questions

- Should the scripts be a single `warren` dispatcher (e.g. `./warren start`) or separate files (`start.sh`, `stop.sh`, etc.)?
- Should `setup` support a `--force` flag to re-initialise an existing deployment (e.g. rotating credentials)?
- Should `restart` with no arguments restart all services, or only the ones that are currently running?
- Which config/credential files does `clear` delete? Need an explicit inventory (Mosquitto password file, InfluxDB data dir, `.env`, generated tokens, etc.).

## Testing Guidelines

Create a test file(s) in the ./tests folder for new feature, and create meaningful test for the following cases without going too heavy:

- `setup` completes without error on a clean environment and all expected config files are created.
- `start` brings services up (verify with `docker compose ps`).
- `stop` brings services down without removing volumes.
- `restart` stops and restarts services, ending with them running.
- `clear` removes all generated files and volumes; subsequent `docker compose ps` shows no running containers.
- Running `setup` twice does not overwrite existing credentials.
