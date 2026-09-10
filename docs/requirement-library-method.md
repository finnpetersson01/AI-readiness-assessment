# Version 2 Requirement Library Method

## Purpose

The requirement library is a controlled collection of reusable prerequisites for early AI project readiness assessment. It is not a universal questionnaire and it does not define one fixed requirement profile for a use-case title.

For each uploaded project, the LLM selects a contextual subset from the library, proposes importance and a required level, and identifies genuine catalog gaps. A consultant approves the resulting project-requirement profile before any client assessment is generated.

## Three-Layer Requirement Architecture

### 1. Requirement families

Families define stable prerequisite concepts such as source-data availability, workflow integration or privacy approval. They provide the taxonomy, prevent conceptual gaps and give new project types a reusable starting point.

### 2. Granular requirement variants

Variants translate a family into a narrower condition for a recognizable project pattern. For example, generic source-data availability becomes separate checks for ticket request text, ticket outcome fields, knowledge-document permissions or historical order messages. Each variant remains linked to its parent family so the catalog can grow without losing structure.

### 3. Project-specific assessment questions

The selected variant is instantiated with facts from the project record, such as the named source system, process scope, history period, user group or required fields. The client therefore answers a concrete question about its proposed project rather than interpreting a generic maturity statement.

This layering balances reuse and specificity: families preserve comparability, variants capture recurring project requirements, and project parameters make the assessment answerable.

## Separation of Responsibilities

### The requirement catalog defines

- reusable prerequisite concepts
- atomic client-facing question templates
- relevant scope and applicability conditions
- observable response-scale families
- conditions under which a requirement may become critical
- evidence that can support an answer
- provenance and lifecycle status

### The project-requirement mapping defines

- whether the requirement applies to the specific project
- importance: supporting, important or critical
- the required observable level or quantitative threshold
- project-specific wording and context
- the LLM rationale, references and confidence
- the consultant decision

This separation prevents a requirement such as `Human review` from being treated as equally critical for a low-risk drafting assistant and an automated financial transaction process.

## Design Principles

1. **Atomic:** Each requirement tests one prerequisite. Compound requirements must be split.
2. **Project-relevant:** A requirement must influence whether the specific project can be attempted, not whether the company is generally mature.
3. **Early-stage assessable:** A consultant and informed client representative should be able to form an evidence-based directional answer before detailed solution design.
4. **Observable:** The client selects concrete descriptions rather than interpreting an abstract 1-10 scale.
5. **Reusable:** Concepts and variants can be reused, while placeholders insert the concrete project context needed for an answerable question.
6. **Traceable:** Every entry records its origin, and every LLM selection must cite project information or a comparable reference project.
7. **Non-duplicative:** Applicability tags and contextual wording are preferred over creating near-identical requirements for each function or industry.
8. **Neutral:** Requirements measure feasibility. Strategic attractiveness, business priority and expected value are handled upstream.

## Seed Taxonomy

| Category | Purpose | Seed entries |
|---|---|---:|
| Scale and resources | Funding, volume, users and delivery capacity | 5 |
| Data availability | Required event, outcome, master, document and interaction assets | 8 |
| Data suitability and quality | Completeness, accuracy, consistency, linkage, representation and freshness | 6 |
| Knowledge assets | Authority, ownership, versions, metadata and content coverage | 6 |
| Systems, integration and access | Source access, workflow integration, identity, permissions and hosting | 7 |
| Technical feasibility | Model-task fit, evaluation, performance, formats, entity resolution and grounding | 6 |
| Process and human oversight | Process stability, ownership, review, fallback and feedback | 6 |
| Governance, privacy and risk | Lawful use, security, auditability, regulation, rights and retention | 9 |
| Organization and delivery | Ownership, decisions, team, procurement and data issue resolution | 5 |
| Adoption and operating model | Workflow fit, change, operating ownership and role redesign | 4 |
| Measurement and feedback | Baselines, outcomes, evaluation, thresholds and monitoring | 5 |
| **Total families** |  | **67** |

The current demonstration adds 43 granular variants beneath these families: 14 for AI-assisted service work, 14 for internal knowledge assistants and 15 for email-order extraction. The combined browser catalog therefore contains 110 selectable entries. These variants are illustrative seed content, not a claim that the catalog already covers every AI project pattern.

## Why Generic Company Proxies Were Not Carried Forward

Version 1 used company revenue and total FTE as broad scale indicators. They are not standalone Version 2 requirements because they do not directly determine whether a specific project is executable.

Version 2 instead assesses project-relevant facts:

- available project funding
- process or transaction volume
- reachable user population
- technical delivery capacity
- domain-expert capacity

Revenue or company size may remain contextual metadata or inform a project-specific threshold, but they should not generate readiness points by themselves.

## Response Scales

The catalog uses reusable scale families from `data/response_scales.json`:

- asset availability
- data or content quality
- system access and integration
- process and control maturity
- governance and risk control
- resource and delivery capacity
- measurement readiness
- restriction or feasibility confirmation
- project-specific quantitative thresholds

Granular variants additionally use targeted observable scales for record coverage, field population, definition consistency, scope representativeness, content control, supported system paths, permission preservation, human-control design and project evaluation.

### Question-scale contract

The question and its answer anchors must measure the same construct. A coverage scale therefore starts with "For what share...", a maturity scale with "To what extent...", and a governance scale with "What is the current approval status...". Binary wording such as "Is this available?" is avoided when the user must choose among five graduated states.

Every generated question must also name the relevant project object wherever possible: the source records, fields, system, process scope, user group, history period or responsible control. If those parameters are unknown, the consultant should resolve them during review or mark the resulting answer as undetermined rather than silently falling back to a broad company-level question.

Levels 0-4 are internal. The assessment displays only the criterion-specific observable statements.

Project funding is treated as a structured exception. The consultant defines a minimum credible project budget and a preferred budget including contingency. The client provides a lower and upper available-funding bound. The lower available bound determines whether the minimum is securely covered; the upper bound cannot compensate for an uncertain lower commitment. The calculated comparison is normalized to the same internal 0-4 scale used by the rest of the assessment.

`Cannot determine` is not the middle of a scale. It reduces evidence coverage, and an unknown critical requirement becomes an unverified blocker.

## LLM Selection Contract

For each project, the model should:

1. Identify the project characteristics, capabilities, inputs, outputs, systems and risk context.
2. Select catalog requirements whose applicability conditions are supported by the project record.
3. Propose importance and required level separately for every selected requirement.
4. Explain the selection using project evidence and comparable reference projects.
5. Avoid selecting broad requirements merely because they are common to AI projects.
6. Propose a new requirement only when no existing entry covers the prerequisite.
7. Name the closest catalog entries and explain why they are insufficient.

The structured output must include:

- requirement ID or provisional ID
- importance
- required level or quantitative threshold
- rationale
- project evidence
- comparable reference-project evidence where available
- confidence

## Consultant Review

The consultant can:

- include or exclude a requirement
- change importance
- change the required level
- edit project-specific wording
- add an existing catalog requirement manually
- approve a provisional requirement for the current assessment
- reject it or submit it for catalog review

No LLM-proposed requirement enters the client assessment without consultant approval.

## Project-to-Library Feedback Loop

After a readiness assessment and, ideally, after delivery outcomes are known, the project can be converted into a reusable library record. This is a controlled editorial step rather than an automatic copy of the assessment.

The record combines:

- a normalized and optionally anonymized project description
- use case pattern, function, industry applicability and reusable tags
- systems, data sources, scale and human-control design
- implementation status, roadblocks, cost, benefit, ROI and time to value
- qualitative benefits, lessons learned and consultant comments
- the readiness result and evidence coverage at the time of export
- retained requirements with catalog lineage, targets, observed results, evidence and notes

The original assessment snapshot remains attached to each requirement even when the consultant edits the reusable wording. This separates historical evidence from later knowledge curation and supports future analysis of which prerequisites repeatedly predict project success or failure.

The current MVP produces a local structured file. A future central library should add authentication, versioning, duplicate detection, anonymization review and an approval workflow before publishing a record for reuse.

## Library Lifecycle

### Draft

Created from Version 1, interviews or structured design work but not yet validated across multiple projects.

### Provisional

Proposed for a specific project because the existing catalog was insufficient. It may be used in that assessment after consultant approval.

### Validated

Reviewed for atomicity, duplication, wording, response anchors and applicability. Preferably observed in more than one project or supported by strong expert evidence.

### Retired

Replaced, merged or no longer methodologically appropriate. Retained for traceability but unavailable for new mappings.

Approving a requirement for one client assessment does not automatically make it a validated catalog entry.

## Catalog-Review Checklist

Before promoting a provisional requirement:

1. Does it test a prerequisite rather than a desired benefit?
2. Is it materially distinct from existing requirements?
3. Can it be answered during early discovery?
4. Is it atomic?
5. Does the selected scale family fit the question?
6. Are all observable anchors meaningful for this requirement?
7. Is the criticality rule conditional rather than universally asserted?
8. Are evidence examples available?
9. Is the source and reviewer recorded?
10. Does it improve coverage for more than one plausible project, or is there a clear reason to keep it project-specific?

## Current Evidence Base and Limitation

The seed catalog synthesizes:

- Version 1 readiness questions and use-case mappings
- the Johannes Mokry practitioner interview
- the earlier Felix Schulz review cycle embedded in Version 1
- structured analysis of the three Version 2 demonstration projects

All 67 families and 43 granular variants currently remain `draft`. The library is a methodologically controlled starting point, not a claim that every requirement is universally complete or expert-validated. The benchmark and subsequent interviews should be used to remove weak entries, merge overlaps, validate answer anchors and add missing project patterns.
