# LLM Requirement Selection Contract

## Purpose

The requirement-selection model converts a client-approved AI project definition into a consultant-reviewable readiness profile. It defines what the project requires. It does not assess whether the company currently fulfils those requirements.

## Selection rules

1. Reuse the controlled catalog wherever it contains the same assessable prerequisite.
2. Prefer a specific project-pattern variant over its broader parent requirement.
3. Do not select a parent and child requirement for the same underlying condition.
4. Normally return 8-15 material requirements. More are justified only by genuinely distinct dependencies.
5. Mark a requirement critical only when failure makes the MVP infeasible, legally or operationally unacceptable, or impossible to evaluate safely.
6. Preserve uncertainties as assumptions or client clarifications instead of inventing facts.
7. Always include project funding (`SR01`) as critical, with a minimum credible MVP budget and preferred budget including contingency.
8. Propose a new requirement only when no catalog entry captures the same observable condition.

## Required output

Each selected catalog requirement contains:

- exact catalog requirement ID
- importance: `supporting`, `important` or `critical`
- required level: integer from 0 to 4
- project-specific rationale
- supporting statements from the project input
- an explicit assumption when the selection relies on an inference
- minimum and preferred EUR funding values for `SR01`

Each proposed new requirement contains:

- title and category
- assessable requirement statement
- client-facing question
- reusable 0-4 response scale
- importance and required level
- project evidence and assumptions
- closest existing catalog IDs
- gap rationale explaining why those entries are insufficient

The project summary contains:

- project pattern
- main technical prerequisites
- main organizational prerequisites
- critical gates
- critical uncertainties
- points to clarify with the client

## Human control

The output is a proposal. The consultant can remove requirements, change importance, change required levels, amend funding estimates and approve or reject proposed additions before the client assessment begins.

## Evaluation method

`data/demo_requirement_benchmarks.json` provides human-approved reference sets for the three demo projects:

- `must_select`: essential coverage
- `acceptable_optional`: defensible supporting selections
- `likely_false_positive`: likely duplication or misunderstanding
- `expected_critical`: expected criticality boundary
- `required_level_range`: reasonable pre-assessment targets
- `expected_new_requirements`: justified catalog gaps

Evaluation should consider essential-requirement recall, false-positive rate, criticality agreement, required-level reasonableness, evidence traceability and correct handling of catalog gaps. The benchmark is a review aid rather than immutable production truth.
