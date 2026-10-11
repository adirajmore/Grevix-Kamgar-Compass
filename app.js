import { initializeState, setLanguage, setNotice } from "./src/state.js";
import { mountApplication, setOfflineStatus } from "./src/ui.js";
import { mountWelcome } from "./src/welcome.js";
import { validateImportedRulePack } from "./src/rulePacks.js";

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
    const [
      hindi,
      marathi,
      rulesData,
      sampleProject,
      ruralDemoProject,
      ruralOldRulesPack,
      ruralNewRulesPack
    ] = await Promise.all([
      readJson(localeFiles[1][1]),
      readJson(localeFiles[2][1]),
      readJson("data/rules.json"),
      readJson("data/sample.json"),
      readJson("data/sample-rural-offline.json"),
      readJson("data/rules-pack-old.json"),
      readJson("data/rules-pack-new.json")
    ]);
    const storedRulePack = await readStoredRulePack(rulesData);
    const activeRulesData = storedRulePack.pack || rulesData;
    const locales = { en: english, hi: hindi, mr: marathi };
    const storedLanguage = readStoredLanguage();
    const state = initializeState(
      sampleProject,
      activeRulesData,
      storedLanguage,
      navigator.languages,
      rulesData
    );
    if (storedRulePack.error) {
      setNotice("rules.packLoadError");
    }
    let welcomeController;
    mountApplication(root, {
      locales,
      sampleProject,
      ruralDemoProject,
      ruralOldRulesPack,
      ruralNewRulesPack,
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
          ruralDemoProject,
          ruralOldRulesPack,
          ruralNewRulesPack,
          onAbout: () => welcomeController.open()
        });
      },
      () => {
        setNotice("welcome.storageError");
        mountApplication(root, {
          locales,
          sampleProject,
          ruralDemoProject,
          ruralOldRulesPack,
          ruralNewRulesPack,
          onAbout: () => welcomeController.open()
        });
      }
    );
    setupOfflineSupport();
  } catch (error) {
    showLoadError({
      title: english["error.title"],
      summary: english["error.rulesLoad"],
      instruction: english["error.localServer"],
      cause: error.message
    });
  }
}

async function readStoredRulePack(bundledRulesData) {
  let serialized;
  try {
    serialized = localStorage.getItem("kamgar-compass-rules-pack");
  } catch (error) {
    console.error("Kamgar Compass could not read the saved rules pack.", error);
    return { pack: null, error };
  }
  if (!serialized) {
    return { pack: null, error: null };
  }
  try {
    const pack = JSON.parse(serialized);
    await validateImportedRulePack(pack, bundledRulesData);
    return { pack, error: null };
  } catch (error) {
    console.error(
      "Kamgar Compass could not validate the saved rules pack.",
      error
    );
    return { pack: null, error };
  }
}

function setupOfflineSupport() {
  let serviceWorkerAvailable = "serviceWorker" in navigator;
  if (!navigator.onLine) {
    setOfflineStatus("offline.working");
  }
  window.addEventListener("offline", () => setOfflineStatus("offline.working"));
  window.addEventListener("online", () =>
    setOfflineStatus(serviceWorkerAvailable ? "" : "offline.unavailable")
  );
  if (!serviceWorkerAvailable) {
    setOfflineStatus("offline.unavailable");
    return;
  }
  navigator.serviceWorker.register("./service-worker.js").catch((error) => {
    serviceWorkerAvailable = false;
    console.error("Kamgar Compass offline support could not start.", error);
    setOfflineStatus("offline.unavailable");
  });
}

function readStoredLanguage() {
  try {
    return localStorage.getItem("kamgar-compass-language");
  } catch {
    return null;
  }
}

startApplication();
