# AI Kingdom Royal Agent Profiles

Generated profiles for import/seed/upsert. Use JSON files as machine-readable source of truth and Markdown files for human review.

- [Aurelian — Grand Vizier](grand-vizier.md) / `grand-vizier.json`
- [Seraphine — Royal Architect](royal-architect.md) / `royal-architect.json`
- [Cassian — Royal General](royal-general.md) / `royal-general.json`
- [Elowen — Royal Researcher](royal-researcher.md) / `royal-researcher.json`
- [Marcellus — Royal Treasurer](royal-treasurer.md) / `royal-treasurer.json`
- [Vaelion — Royal Promptsmith](royal-promptsmith.md) / `royal-promptsmith.json`
- [Thaleon — Royal Archivist](royal-archivist.md) / `royal-archivist.json`


## Import Rules

- Upsert by `slug` or stable identifier.
- Do not create duplicates.
- Do not overwrite King-customized values unless a field is empty or explicitly seed-managed.
- Do not enable paid/production fallback during sandbox stabilization.
- `canAutoSaveTrustedMemory` must remain `false` by default.
- Raw reasoning must never be stored as memory.
