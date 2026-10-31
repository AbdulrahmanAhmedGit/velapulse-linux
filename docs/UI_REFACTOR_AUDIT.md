# Product UI audit — 2026-10-30

## Baseline and scope

Base: `7ee1ab6` (`feature/weather-ai-activities`), the newest implementation branch;
`main` lacks the advanced music/weather/developer work. The overhaul is stacked
on that branch, preserving APIs, settings, providers and integrations. No installer,
compositor, live service or external hook configuration is changed.

## Architecture inspected

Rust owns clocks/expiry (`model`), configuration validation/persistence (`config`),
D-Bus/CLI (`main`), renderer supervision (`desktop`), MPRIS (`music`), normalized
artwork, local lyrics/history/audio, weather/cache, brief composition, developer
lifecycle and owned tasks. These boundaries are sound and retained.

The Shell entry point constructs St actors, handles monitor placement, lifecycle,
selection and dismissal. GTK duplicates that composition with native widgets.
`presentation.js` and `layout.js` are pure shared rules. Context cards already use
a keyed shared tree with toolkit adapters; music has separate native controls.
Preferences shares a libadwaita implementation between two hosts.

## Demonstrated problems and decisions

| Finding | Cause | Action / acceptance |
| --- | --- | --- |
| Repeated palette and geometry declarations | Multiple visual experiments layered in both stylesheets | Replace stylesheets with one ordered semantic implementation per renderer; generate geometry from tokens. |
| Title and metadata compete horizontally | One-line text region, both labels expand equally | Vertical title/detail in floating pills; retain a single compact row in panel mode. Shared measurement uses the same contract. |
| Music titles rely on artwork contrast | Caption painted over full-width artwork with no stable text surface | Separate bounded artwork and track identity; retain artwork transitions and all controls. |
| Preferences needs ~1180 px and looks unrelated | Permanent sidebar/content/inspector, yellow palette | Move appearance options into scrollable Appearance page; native groups, shared accent; sidebar can scroll. |
| Search misses most settings | Search only hides appearance previews | Index actual settings rows across all pages; activate the real row's page and focus it. Ctrl+F works globally. |
| Preview status leaks implementation language | “foreground/background” labels | Use “Showing now / Available”. |
| Context composition compressed into dense one-liners | Nodes, weather rules and reconciliation share a file | Extract keyed reconciliation into a focused module; retain stable widgets and scroll position. |
| Controls can lose focus on rebuild | Structural card key includes activity IDs and controls | Preserve existing focus fallback; test actual input after state changes. |
| Whole-root opacity reduces text contrast | Config opacity applied to all widgets | Scope opacity to surface colors while preserving the setting's range. |
| Motion timings repeated | Toolkit-specific literals | Shared duration tokens, honor toolkit reduced motion. |

## Coverage and risks

Existing tests cover core D-Bus, ownership, providers, activation, weather transport,
agent lifecycle, preferences actual input, GTK/Shell card input and layout fixtures.
Keep those tests; supplement with settings search, compact constraints and genuine
captures at 100/125/150 percent. Synthetic peers must be identified. Existing
screenshots are historical evidence, not proof of this revision.

Toolkit allocation, panel mode and focus order can regress independently. GTK CSS
and St CSS must remain separate. No browser CSS custom-property assumptions in St.
Avoid changes to Rust contracts without a failing case. Preserve Liquid Glass as
an existing appearance, with restrained alpha surfaces. Arabic data must stay literal
text; translations are outside this frozen-feature task. Hardware hotplug, physical
GPU behavior and active-session installation require separate verification.

## Milestones

A audit/specification; B shared tokens/composition; C compact layout; D expanded
cards; E native preferences; F actual input, visual matrix, regressions and report.
Each implementation commit must parse/build; final report records actual results
and outstanding acceptance gaps without treating builds as visual acceptance.
