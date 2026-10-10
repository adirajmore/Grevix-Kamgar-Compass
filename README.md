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
- NGO view for project inputs and estimates; Worker view with plain-language rule explanations.
- Rules page showing applicability signals, source law and section, verification status and confidence.
- Funder Pack with copyable budget note and browser print/save-as-PDF.
- Welcome screen with English, Hindi and Marathi language selection; the app language preference is saved in local storage, and intro dismissal lasts for the browser session.
- English, Hindi and Marathi app interface, plus a separate Funder Pack language setting.

## How it works

Calculations use deterministic JavaScript in `src/engine.js`; no AI is used for numbers. Rules are editable in `data/rules.json`. The Rules page shows source law, last-verified value and confidence. Current rules are marked `TO VERIFY` with low confidence.

## Languages

Translations are in `locales/en.json`, `locales/hi.json` and `locales/mr.json`. All 263 Hindi and all 263 Marathi locale entries are marked `"reviewed": false`; human, preferably native-speaker, review is pending.

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
├── src/
│   ├── constants.js          # Limits and supported options
│   ├── validation.js         # Input validation
│   ├── engine.js             # Rule evaluation and estimates
│   ├── state.js              # App state
│   ├── ui.js                 # Views and interactions
│   ├── charts.js              # SVG chart and timeline
│   ├── funderPack.js          # Budget-note generation
│   └── welcome.js             # Welcome and session dismissal
├── data/
│   ├── rules.json             # Rules and state wage data
│   └── sample.json            # Sample project
├── locales/
│   ├── en.json                # English strings
│   ├── hi.json                # Hindi strings
│   └── mr.json                # Marathi strings
├── tests/
│   ├── engine.test.js         # Rule and cost tests
│   ├── validation.test.js     # Input tests
│   ├── funderPack.test.js     # Budget-note tests
│   ├── locales.test.js        # Locale and review tests
│   ├── money.test.js          # Currency tests
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
