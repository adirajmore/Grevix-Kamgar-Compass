import { initializeState, setLanguage, setNotice } from "./src/state.js";
import { mountApplication } from "./src/ui.js";
import { mountWelcome } from "./src/welcome.js";

const root = document.querySelector("#app");
const welcomeRoot = document.querySelector("#welcome-root");
const localeFiles = [
  ["en", "locales/en.json"],
  ["hi", "locales/hi.json"],
  ["mr", "locales/mr.json"]
];

async function readJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  return response.json();
}

function showLoadError(message) {
  const article = document.createElement("main");
  article.className = "error-page";
  const heading = document.createElement("h1");
  heading.textContent = message.title || "error.title";
  const detail = document.createElement("p");
  detail.textContent = `${message.summary || "error.rulesLoad"} ${message.cause}`;
  const instruction = document.createElement("p");
  instruction.textContent = message.instruction || "error.localServer";
  article.append(heading, detail, instruction);
  root.replaceChildren(article);
}

async function startApplication() {
  let english;
  try {
    english = await readJson(localeFiles[0][1]);
  } catch (error) {
    showLoadError({ cause: error.message, summary: "error.localesLoad" });
    return;
  }

  try {
    const [hindi, marathi, rulesData, sampleProject] = await Promise.all([
      readJson(localeFiles[1][1]),
      readJson(localeFiles[2][1]),
      readJson("data/rules.json"),
      readJson("data/sample.json")
    ]);
    const locales = { en: english, hi: hindi, mr: marathi };
    const storedLanguage = readStoredLanguage();
    const state = initializeState(
      sampleProject,
      rulesData,
      storedLanguage,
      navigator.languages
    );
    let welcomeController;
    mountApplication(root, {
      locales,
      sampleProject,
      onAbout: () => welcomeController.open()
    });
    welcomeController = mountWelcome(
      welcomeRoot,
      root,
      locales,
      state.language,
      (language) => {
        setLanguage(language);
        try {
          localStorage.setItem("kamgar-compass-language", language);
        } catch {
          setNotice("language.storageError");
        }
        mountApplication(root, {
          locales,
          sampleProject,
          onAbout: () => welcomeController.open()
        });
      },
      () => {
        setNotice("welcome.storageError");
        mountApplication(root, {
          locales,
          sampleProject,
          onAbout: () => welcomeController.open()
        });
      }
    );
  } catch (error) {
    showLoadError({
      title: english["error.title"],
      summary: english["error.rulesLoad"],
      instruction: english["error.localServer"],
      cause: error.message
    });
  }
}

function readStoredLanguage() {
  try {
    return localStorage.getItem("kamgar-compass-language");
  } catch {
    return null;
  }
}

startApplication();
