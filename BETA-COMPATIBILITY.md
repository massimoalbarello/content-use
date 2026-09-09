# Beta compatibility policy

This policy supplements the [root engineering principles](./AGENTS.md).

Content Use is beta software. Keep local development data disposable, while preserving data and
identity in deployed instances. Once a migration has run on a deployed instance, its contents and
identity are immutable. Introduce subsequent migrations for schema changes and verify preservation
of records, passkeys, settings, and transcript checkpoints before redeploying.
