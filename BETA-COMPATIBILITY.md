# Beta compatibility policy

This policy supplements the [root engineering principles](./AGENTS.md).

During the current beta phase, existing migrations may be edited in place. Do not introduce a new
migration solely to preserve migration history; migration immutability is not required for now.

Keep local development data disposable, while preserving data and identity in deployed instances.
Editing an already-applied migration does not reapply it to an existing database. Account for the
deployed schema when redeploying and verify preservation of records, passkeys, settings, and
transcript checkpoints.
