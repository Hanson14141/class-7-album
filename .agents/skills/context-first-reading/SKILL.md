---
name: context-first-reading
description: "Use when starting repository work that should begin with README.md or user-specified overview files, then identify exact source locations before deep reading. Avoid reading whole source files or scanning the repository indiscriminately."
---

# Context-First Repository Reading

Use this workflow before implementing, debugging, reviewing, or explaining repository changes when the user asks to begin with `README.md` or other specified files and use them to decide what to inspect next.

## Procedure

1. **Honor the reading gate.** Read the file or files the user explicitly names first. If none are named, start with the repository `README.md` and applicable `AGENTS.md` instructions. Do not open source files or unrelated documentation wholesale at this stage.
2. **Build a small reading map from that material.** Identify only the likely relevant files and the exact sections, headings, symbols, or line ranges needed for the task. Prefer references and file lists in the overview over guesses from filenames.
3. **Show the map before deep reading.** Briefly state which locations will be read and why. If the map is unclear or competing reading scopes would materially change the work, ask the user before expanding it.
4. **Inspect only mapped locations.** Use heading/symbol searches and bounded line-range reads. Do not dump whole source files, recursively enumerate the repository, or treat a large file as a convenient overview.
5. **Expand deliberately.** When a mapped section reveals a concrete dependency, add that dependency and its reason to the reading map before inspecting it. Keep unrelated areas closed.
6. **Verify relevant behavior only.** Follow the call sites and tests necessary for the requested change; run the narrowest suitable validation. Report what was inspected and any meaningful limits.

## Repository-specific guidance

- Follow repository `AGENTS.md` instructions and the user's explicit scope. A user-designated overview file takes precedence as the first reading target, but does not override safety or repository editing constraints.
- In this repository, use `README.md` for orientation and consult `UPDATE_NOTES.md` when the requested feature/version or migration history is relevant. Read `docs/DEVELOPMENT.md` or `docs/DEPLOY.md` only when the change needs their guidance.
- Do not edit generated files listed in `AGENTS.md`; find their source inputs instead. Avoid opening secrets, private data, or user content.
- For edits, read the exact implementation and its directly coupled surfaces before changing anything; validate build, checks, and tests according to the touched behavior.

## Reading-map format

Keep the map concise:

| Location | Why it is needed |
| --- | --- |
| `path/to/file` — heading, symbol, or lines | Specific question this location answers |

Do not claim a file was fully reviewed when only selected sections were read.
