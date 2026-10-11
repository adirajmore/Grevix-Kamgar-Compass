# Kamgar Compass

**See the true cost of employing people before the funding falls.**

Live demo: <!-- TODO: add live link -->
Demo video: <!-- TODO: add demo video link -->

## The problem

Grants often fund programmes but overlook staff compliance costs. Organisations may skip these costs or absorb more than they can afford, while workers can lose out.

## What it does

Enter roles, salaries, state and funding period to see provisional labour-rule estimates, the estimated staff cost left uncovered, and costs through and after the grant. Copy or print a budget note for a funder.

## Features

- Illustrative compliance-gap percentage and rupee estimate against the entered allowance.
- Grant-end simulator showing role costs through the grant and three months after it.
- Salary, headcount and grant-duration what-if controls.
- Scenario comparison: save up to three named project setups and compare estimated staff cost, gap score, grant-end liability and classification-warning roles against the first saved setup.
- Grant Cliff Reserve Planner: estimate low, expected and high monthly savings toward modeled grant-end liabilities, with projected progress and sufficiency dates. An unquantifiable high estimate stays open.
- NGO view for project inputs and estimates; Worker view with plain-language rule explanations.
- Worker Rights Card for the selected role, with protections to check, items not confirmed by the scenario, employer questions and grant-end prompts. The card is printable, uses the selected app language and offers browser speech when a matching voice is available.
- Rules page showing applicability signals, source law and section, verification status and confidence.
- Funder Pack with copyable budget note and browser print/save-as-PDF.
- Welcome screen with English, Hindi and Marathi language selection; the app language preference is saved in local storage, and intro dismissal lasts for the browser session.
- English, Hindi and Marathi app interface, plus a separate Funder Pack language setting.

## How it works

Calculations use deterministic JavaScript in `src/engine.js`; no AI is used for numbers. Rules are editable in `data/rules.json`. The Rules page shows source law, last-verified value and confidence. Current rules are marked `TO VERIFY` with low confidence.

## Scenario comparison

In the NGO results, name and save the current project setup. Save up to three setups; the first saved setup is the baseline. The comparison shows calculated estimated total staff cost, Compliance Gap Score, unfunded liability at grant end, and roles with classification signals, with each later setup's difference from the baseline. Its short summary is derived from the largest classification-warning reduction, or otherwise the largest average monthly cost change. Comparisons are held in memory for the current app session and are not yet stored across reloads.

## Grant Cliff Reserve Planner

The planner uses the currently modeled unfunded Grant Cliff liability to calculate low, expected and high monthly set-asides over the user-selected remaining months, after subtracting any starting reserve. It also shows projected progress and the date each estimate becomes sufficient. The Funder Pack includes the expected set-aside and high monthly figure; when the cautious high estimate cannot be quantified, it says so instead of inventing a cap. The planner includes only liabilities currently represented by the rules and calculations.

## Worker Rights Card

Open Worker view and choose a role. The card uses the selected app language and lists rule areas flagged by the scenario, items not confirmed by it, a question to raise with the employer, and a prompt about the role and funding end. It includes rule verification dates and the informational disclaimer. Print the card on A4 or use Read aloud when the browser provides a voice for the selected language. The card is a plain-language prompt, not a legal determination; Hindi and Marathi text remain unreviewed.

## Languages

Translations are in `locales/en.json`, `locales/hi.json` and `locales/mr.json`. All 400 Hindi and all 400 Marathi locale entries are marked `"reviewed": false`; human, preferably native-speaker, review is pending.

## Getting started

Prerequisites: Node.js 18 or newer. `package.json` does not declare an `engines` range; Node 24.21.0 was used to verify the commands below.

Clone the [repository](https://github.com/adirajmore/Grevix-Kamgar-Compass) and open a terminal in its folder. Install dependencies and start the local server:

```sh
npm ci
npm run dev
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). The server uses port 4173 by default; it can be overridden with the `PORT` environment variable. Serve the app over HTTP rather than opening `index.html` directly, because the browser loads modules and JSON files.

Run the tests and checks:

```sh
npm test
npm run lint
```

`npm run lint` runs ESLint and Prettier's formatting check. There is no format script; format a file with `npx prettier --write README.md` (substitute another filename as needed).

## Project structure

```text
.
├── app.js                    # App startup and data loading
├── index.html                # Document and mount points
├── styles.css                # App and welcome-screen styles
├── server.js                 # Static server, default port 4173
├── money.js                  # Rupee formatting
├── package.json              # Scripts and dependencies
├── package-lock.json         # Locked dependencies
├── .eslintrc.json            # ESLint settings
├── .prettierrc               # Prettier settings
├── .gitignore                # Ignored files
├── service-worker.js         # Versioned app-shell cache for offline use
├── src/
│   ├── constants.js          # Limits and supported options
│   ├── validation.js         # Input validation
│   ├── engine.js             # Rule evaluation, estimates and Worker Rights Card data
│   ├── state.js              # App state
│   ├── freshness.js          # Rule age, status and verification-date helpers
│   ├── ui.js                 # Views and interactions
│   ├── rulePacks.js           # Pack validation, checksums and diff previews
│   ├── charts.js              # SVG chart and timeline
│   ├── funderPack.js          # Budget-note generation
│   └── welcome.js             # Welcome and session dismissal
├── data/
│   ├── rules.json             # Rules and state wage data
│   ├── sample.json            # Sample project
│   ├── sample-rural-offline.json # Rural offline demo project
│   ├── rules-pack-old.json    # Old illustrative demo pack
│   └── rules-pack-new.json    # New illustrative demo pack
├── locales/
│   ├── en.json                # English strings
│   ├── hi.json                # Hindi strings
│   └── mr.json                # Marathi strings
├── tests/
│   ├── engine.test.js         # Rule, cost, scenario, reserve and rights-card tests
│   ├── validation.test.js     # Input tests
│   ├── funderPack.test.js     # Budget-note tests
│   ├── freshness.test.js      # Rule-age classification tests
│   ├── locales.test.js        # Locale and review tests
│   ├── money.test.js          # Currency tests
│   ├── rulePacks.test.js      # Import, integrity and offline demo tests
│   ├── state.test.js          # Application-state tests
│   ├── welcome.test.js        # Session-memory test
│   └── fixtures.js            # Test fixtures
└── docs/
    └── screenshots/
        └── .gitkeep           # Keeps the screenshot directory in Git
```

## Updating the legal rules

Edit `data/rules.json`. Rule records contain:

- `id`, `area`: engine identifier and rule category.
- `name`, `note`, `worker_explanation`: English, Hindi and Marathi content.
- `applies_if`: inputs used for applicability screening.
- `calculation`: calculation type and inputs; numeric values include `value` and `last_verified`.
- `source_law`, `source_section`: English source name and section reference.
- `last_verified`, `confidence`, `refer_to_professional_if`: review status and referral guidance.

State minimum wage records go under `state_minimum_wages`. Rates currently use `skill_category`, `monthly_minimum_wage` and `last_verified`; the engine matches the category and compares monthly salary. It does not evaluate effective dates or verify sources. The `MH` rates array is empty.

Example from the current EPF entry; the value is provisional:

```json
{
  "id": "epf_employer",
  "area": "epf",
  "applies_if": {
    "minimum_headcount": { "value": 20, "last_verified": "TO VERIFY" }
  },
  "last_verified": "TO VERIFY",
  "confidence": "low"
}
```

After qualified review against a current authoritative source, replace relevant markers with the verification date (`YYYY-MM-DD`) and update source details. Verify numeric inputs separately from the rule-level date.

## Limitations and honesty notice

- All six rule records—EPF, ESI, gratuity, minimum wage, POSH screening and worker-classification indicators—are marked `TO VERIFY` with low confidence. Numeric thresholds and contribution assumptions are provisional.
- The Maharashtra minimum-wage rate list is empty; the minimum-wage check cannot make a state-rate comparison until verified data is added.
- POSH is a screening signal; any planning cost is user-entered, not asserted to be a statutory fee. Classification indicators do not decide a worker's legal status.
- The app covers only the rule areas listed above. It does not model notice or retrenchment costs or determine legal applicability.
- India's Labour Codes are being implemented; commencement and rules can vary by state. Confirm the current position and applicable state notifications with a qualified professional.
- Hindi and Marathi strings are all marked unreviewed and need human review.
- A browser smoke check covered the welcome screen at 360px and desktop widths, keyboard dismissal/focus, and reduced-motion display. This is not a full mobile-device, cross-browser or assistive-technology accessibility audit.
- No deployed version is available yet.

## Working with outdated or no information

An NGO may have an older copy of the rules or no internet connection. Kamgar Compass caches its app shell, locale files, fonts and rules data after a successful first visit. The rules page also offers export, import, preview and revert controls for sharing rule packs offline. A checksum detects accidental file corruption; it does not authenticate a pack or prove that it is official.

The freshness controls let users set the estimate date, enter when they last checked the rules, or choose “I can't verify current laws.” When relevant information is aging, stale, expired or unverified, the app switches to cautious mode. For rules with a usable drift assumption, it applies the clearly labelled placeholder rates to show low, expected and high scenario estimates. These ranges are estimates of possible drift, not legal facts. Fresh rules add no drift uncertainty.

The recommended figure uses the high estimate when uncertainty can be bounded. If a relevant input is missing or has no usable verification date, the full range and recommendation remain unavailable; the app does not invent a maximum. A conservative budget figure can mean asking a funder for more money. Confirm current rules with a qualified professional before relying on a budget.

### Rural offline demo walkthrough

1. Open the Rules page and choose **Load rural offline demo**. It loads the 12-month, eight-person Maharashtra project and the illustrative pack dated 2025-08-13, then sets the demo estimate date to 2026-10-13. The freshness banner and cautious estimate appear, and a preview of the newer illustrative pack is prepared.
2. The project has four roles, including a volunteer-stipend role. The Maharashtra minimum-wage list has no rates, so the demo cannot calculate a complete numeric range or recommend a fully sufficient budget figure.
3. Inspect the preview and apply the newer pack dated 2026-10-12. Applying this demo pack does not replace any saved user pack. Its numeric rule values are deliberately unchanged from the older demo pack, so the scenario's expected employer cost changes by ₹0; the interface reports whether it is within the earlier _quantified_ range and also says that full-cost coverage remains unproven.
4. Regenerate or open the Funder Pack to see the dated rules snapshot, uncertainty basis and reconciliation. The app shell was smoke-tested in a browser on localhost with the network disabled after the first visit; this is not a cross-browser offline test.
5. Choose **Load standard sample NGO** to return to the bundled sample project and rules. The demo data are illustrative fixtures, not real legal notifications or verified rates.

## Disclaimer

Kamgar Compass is informational only and is not legal advice. Consult a qualified labour-law professional or HR practitioner before making compliance decisions.

## Roadmap

- Add verified, state-wise minimum-wage categories, rates and effective dates.
- Review Hindi and Marathi UI and worker explanations with native speakers.
- Expand the editable rule set to cover additional obligations after professional review.
- Conduct broader mobile, cross-browser and assistive-technology testing.

## Built for

Built for a 24-hour hackathon: **Grevix AfterCode**. Team: <!-- TODO: add team name -->. Members: <!-- TODO: add member names -->.

## License

No `LICENSE` file is present. <!-- TODO: choose and add a license. -->
