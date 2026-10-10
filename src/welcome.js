const WELCOME_SESSION_KEY = "kamgar-compass-welcome-dismissed";
const LANGUAGES = ["en", "hi", "mr"];

/**
 * Check whether the welcome screen was dismissed in this browser session.
 * @param {Storage} storage Session storage-compatible object.
 * @returns {boolean} Whether the welcome screen was dismissed.
 */
export function hasDismissedWelcome(storage) {
  return storage.getItem(WELCOME_SESSION_KEY) === "true";
}

/**
 * Remember that the welcome screen was dismissed for this browser session.
 * @param {Storage} storage Session storage-compatible object.
 * @returns {void}
 */
export function rememberWelcomeDismissal(storage) {
  storage.setItem(WELCOME_SESSION_KEY, "true");
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character]
  );
}

function translated(locales, language, key) {
  const entry = locales[language]?.[key];
  return typeof entry === "string" ? entry : entry?.text || key;
}

function languageOptions(locales, language) {
  return LANGUAGES.map(
    (code) =>
      `<option value="${code}"${code === language ? " selected" : ""}>${escapeHtml(translated(locales, language, `language.${code}`))}</option>`
  ).join("");
}

function welcomeMarkup(locales, language) {
  return `<section class="welcome-screen" aria-labelledby="welcome-title" aria-label="${escapeHtml(translated(locales, language, "welcome.ariaLabel"))}" lang="${language}">
    <div class="welcome-card">
      <header class="welcome-header">
        <span class="welcome-brand">${escapeHtml(translated(locales, language, "app.name"))}</span>
        <label class="welcome-language"><span>${escapeHtml(translated(locales, language, "language.label"))}</span><select id="welcome-language" autofocus>${languageOptions(locales, language)}</select></label>
      </header>
      <div class="welcome-content">
        <div class="welcome-story" aria-hidden="true">
          <svg class="welcome-illustration" viewBox="0 0 760 320" role="presentation">
            <defs>
              <linearGradient id="funding-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#91ae98"/>
                <stop offset="1" stop-color="#5f876d"/>
              </linearGradient>
            </defs>
            <g class="compass">
              <circle class="compass-face" cx="115" cy="130" r="74"/>
              <circle class="compass-ring" cx="115" cy="130" r="74"/>
              <path class="compass-rose" d="M115 76 127 119 170 130 127 141 115 184 103 141 60 130 103 119Z"/>
              <g class="compass-needle">
                <path d="M115 91 128 136 115 128 102 136Z"/>
                <circle cx="115" cy="130" r="5"/>
              </g>
            </g>
            <path class="funding-trajectory" d="M292 207 376 184 460 157 544 127 628 101"/>
            <g class="funding-bars">
              <rect class="funding-bar bar-one" x="258" y="207" width="68" height="43" rx="5"/>
              <rect class="funding-bar bar-two" x="342" y="184" width="68" height="66" rx="5"/>
              <rect class="funding-bar bar-three" x="426" y="157" width="68" height="93" rx="5"/>
              <rect class="funding-bar bar-four" x="510" y="127" width="68" height="123" rx="5"/>
              <rect class="funding-bar bar-five" x="594" y="101" width="68" height="149" rx="5"/>
            </g>
            <g class="workers">
              <g transform="translate(292 207)"><g class="worker"><circle cy="-27" r="5"/><path d="M0 -21V-8M-7 -16 0 -19 7 -16M0 -8-6 0M0 -8 6 0"/></g></g>
              <g transform="translate(376 184)"><g class="worker"><circle cy="-27" r="5"/><path d="M0 -21V-8M-7 -16 0 -19 7 -16M0 -8-6 0M0 -8 6 0"/></g></g>
              <g transform="translate(460 157)"><g class="worker"><circle cy="-27" r="5"/><path d="M0 -21V-8M-7 -16 0 -19 7 -16M0 -8-6 0M0 -8 6 0"/></g></g>
              <g transform="translate(544 127)"><g class="worker"><circle cy="-27" r="5"/><path d="M0 -21V-8M-7 -16 0 -19 7 -16M0 -8-6 0M0 -8 6 0"/></g></g>
              <g transform="translate(628 101)"><g class="worker"><circle cy="-27" r="5"/><path d="M0 -21V-8M-7 -16 0 -19 7 -16M0 -8-6 0M0 -8 6 0"/></g></g>
            </g>
            <path class="chart-baseline" d="M250 251H674"/>
            <rect class="hidden-cost-layer" x="258" y="251" width="404" height="15" rx="4"/>
            <path class="cliff-edge" d="M578 97V251"/>
          </svg>
          <div class="welcome-scene-labels">
            <span data-welcome-key="welcome.funding"></span>
            <span data-welcome-key="welcome.grantEnd"></span>
            <span data-welcome-key="welcome.hiddenCost"></span>
          </div>
        </div>
        <div class="welcome-copy">
          <p class="welcome-eyebrow" data-welcome-key="welcome.eyebrow"></p>
          <h1 id="welcome-title" tabindex="-1" data-welcome-key="welcome.headline"></h1>
          <p class="welcome-description" data-welcome-key="welcome.description"></p>
          <ul class="welcome-features" aria-label="${escapeHtml(translated(locales, language, "welcome.featuresLabel"))}">
            <li data-welcome-key="welcome.featureCost"></li>
            <li data-welcome-key="welcome.featureCliff"></li>
            <li data-welcome-key="welcome.featureLanguages"></li>
          </ul>
          <div class="welcome-actions">
            <button class="button button-primary welcome-enter" type="button" data-welcome-action="enter" data-welcome-key="welcome.enter"></button>
            <button class="welcome-skip" type="button" data-welcome-action="skip" data-welcome-key="welcome.skip"></button>
          </div>
          <p class="welcome-storage-error" role="status" hidden></p>
          <p class="welcome-disclaimer" data-welcome-key="welcome.disclaimer"></p>
        </div>
      </div>
    </div>
  </section>`;
}

function applyTranslations(screen, locales, language) {
  screen.querySelectorAll("[data-welcome-key]").forEach((element) => {
    element.textContent = translated(
      locales,
      language,
      element.dataset.welcomeKey
    );
  });
}

/**
 * Mount the localized welcome experience and manage its dismissal and focus.
 * @param {HTMLElement} welcomeRoot Element reserved for the welcome screen.
 * @param {HTMLElement} appRoot Main application root.
 * @param {object} locales All supported UI translations.
 * @param {string} initialLanguage Current application locale.
 * @param {(language: string) => void} onLanguageChange Persist and apply locale.
 * @param {() => void} onStorageError Report session storage failures.
 * @returns {{ open: () => void }} Controls for reopening the welcome screen.
 */
export function mountWelcome(
  welcomeRoot,
  appRoot,
  locales,
  initialLanguage,
  onLanguageChange,
  onStorageError
) {
  let language = initialLanguage;
  let dismissed = false;

  function updateLanguage(nextLanguage) {
    if (!LANGUAGES.includes(nextLanguage)) {
      return;
    }
    language = nextLanguage;
    onLanguageChange(language);
    welcomeRoot.innerHTML = welcomeMarkup(locales, language);
    const screen = welcomeRoot.querySelector(".welcome-screen");
    applyTranslations(screen, locales, language);
    if (!dismissed) {
      screen.classList.add("is-visible");
      screen.querySelector("#welcome-language").focus();
    }
  }

  function close() {
    if (dismissed) {
      return;
    }
    dismissed = true;
    try {
      rememberWelcomeDismissal(window.sessionStorage);
    } catch {
      onStorageError();
      showStorageWarning();
    }
    const screen = welcomeRoot.querySelector(".welcome-screen");
    screen.classList.add("is-exiting");
    screen.setAttribute("aria-hidden", "true");
    screen.inert = true;
    appRoot.inert = false;
    appRoot.removeAttribute("aria-hidden");
    window.setTimeout(() => {
      if (dismissed) {
        welcomeRoot.hidden = true;
      }
    }, 450);
    appRoot.querySelector("main h1")?.focus();
  }

  function open() {
    dismissed = false;
    welcomeRoot.hidden = false;
    appRoot.inert = true;
    appRoot.setAttribute("aria-hidden", "true");
    const screen = welcomeRoot.querySelector(".welcome-screen");
    screen.inert = false;
    screen.removeAttribute("aria-hidden");
    screen.classList.remove("is-exiting");
    window.requestAnimationFrame(() => {
      screen.classList.add("is-visible");
      screen.querySelector("#welcome-language").focus();
    });
  }

  function showStorageWarning() {
    const warning = welcomeRoot.querySelector(".welcome-storage-error");
    warning.textContent = translated(locales, language, "welcome.storageError");
    warning.hidden = false;
  }

  welcomeRoot.innerHTML = welcomeMarkup(locales, language);
  const screen = welcomeRoot.querySelector(".welcome-screen");
  applyTranslations(screen, locales, language);
  welcomeRoot.onchange = (event) => {
    if (event.target.id === "welcome-language") {
      updateLanguage(event.target.value);
    }
  };
  welcomeRoot.onclick = (event) => {
    if (
      event.target.closest(
        '[data-welcome-action="enter"], [data-welcome-action="skip"]'
      )
    ) {
      close();
    }
  };
  welcomeRoot.onkeydown = (event) => {
    if (event.key === "Tab") {
      const controls = [
        ...welcomeRoot.querySelectorAll(
          "#welcome-language, [data-welcome-action]"
        )
      ];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && event.target === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && event.target === last) {
        event.preventDefault();
        first.focus();
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter") {
      event.preventDefault();
      close();
    }
  };

  try {
    dismissed = hasDismissedWelcome(window.sessionStorage);
  } catch {
    onStorageError();
    showStorageWarning();
  }
  if (dismissed) {
    welcomeRoot.hidden = true;
  } else {
    open();
  }
  return { open };
}
