# How to contribute

## Environment Setup

### Prerequisites

- [Rust](https://rust-lang.org/) 1.91+
- [Docker](https://docs.docker.com/get-docker/) (for database)
- [just](https://github.com/casey/just) (command runner)

### Database

We use [ParadeDB](https://github.com/paradedb/paradedb) (Postgres with pgvector / pg_search).

```bash
# Start the database
just docker up -d
```

Or manually:

```bash
docker compose up -d
```

### Environment Variables

Copy `.env.example` to `.env` and adjust:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://plastmem:plastmem@localhost/plastmem` |
| `OPENAI_BASE_URL` | LLM API endpoint | `http://localhost:11434/v1/` |
| `OPENAI_API_KEY` | API key | `plastmem` |
| `OPENAI_CHAT_MODEL` | Chat model | `gpt-oss` |
| `OPENAI_EMBEDDING_MODEL` | Embedding model | `qwen3-embedding:0.6b` |

### Option 1: Nix (Recommended)

If you use [nix-direnv](https://github.com/nix-community/nix-direnv):

```bash
direnv allow
```

This provides the Rust toolchain, `bacon`, and `sea-orm-cli` automatically.

### Option 2: Manual Setup

Install Rust: https://rust-lang.org/learn/get-started/

Then install CLI tools:

```bash
cargo install --locked bacon
cargo install sea-orm-cli@^2.0.0-rc
```

## Running the project

```bash
# 1. Start database
just docker up -d

# 2. Run migrations
just db migration up

# 3. Run in development mode
just run
```

## Common tasks

| Task | Command |
|------|---------|
| Run with auto-reload | `just run` |
| Run tests | `just test` |
| Format code | `just fmt` |
| Lint code | `just lint` |
| Run migrations | `just db migration up` |
| Generate entities | `just db generate` |
| Update dependencies | `just up` |

See `just --list` for all available commands.

## Database workflow

When you modify database schema:

1. Edit migration files in `crates/migration/src/`
2. Run `just db migration up` to apply
3. Run `just db generate` to update entities

## Code style

- `cargo fmt` for formatting
- `cargo clippy` for linting (run `just lint`)
- Follow existing module structure
