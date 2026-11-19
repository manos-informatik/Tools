(() => {
  "use strict";

  const STORAGE_KEY = "tools-klassentafel-v1";
  const MAX_DURATION = (999 * 60 + 59) * 1000;
  const taskInput = document.getElementById("taskInput");
  const taskPreview = document.getElementById("taskPreview");
  const hyphenate = createHyphenator(hyphenationPatternsDe1996, { html: false });
  const clearTask = document.getElementById("clearTask");
  const taskSwitcher = document.getElementById("taskSwitcher");
  const addTask = document.getElementById("addTask");
  const templatesButton = document.getElementById("templatesButton");
  const templatesDialog = document.getElementById("templatesDialog");
  const templatesTarget = document.getElementById("templatesTarget");
  const templatesStatus = document.getElementById("templatesStatus");
  const templatesList = document.getElementById("templatesList");
  const minutesInput = document.getElementById("minutesInput");
  const secondsInput = document.getElementById("secondsInput");
  const timerPanel = document.getElementById("timerPanel");
  const timerEditor = document.getElementById("timerEditor");
  const timerDisplay = document.getElementById("timerDisplay");
  const timerMinutes = document.getElementById("timerMinutes");
  const timerSeconds = document.getElementById("timerSeconds");
  const timerToggle = document.getElementById("timerToggle");
  const timerToggleLabel = document.getElementById("timerToggleLabel");
  const timerToggleIcon = document.getElementById("timerToggleIcon");
  const timerProgress = document.getElementById("timerProgress");
  const timerProgressFill = document.getElementById("timerProgressFill");
  const fullscreenButton = document.getElementById("fullscreenButton");
  const socialInputs = [...document.querySelectorAll('input[name="social"]')];
  const groupSize = document.getElementById("groupSize");
  const presetButtons = [...document.querySelectorAll("[data-minutes]")];
  const state = {
    taskLayoutVersion: 2,
    tasks: [""],
    activeTask: 0,
    social: "single",
    groupSize: null,
    timer: { duration: 0, remaining: 0, endsAt: null, status: "ready" }
  };

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Die Tafel funktioniert auch ohne verfügbaren Browserspeicher.
    }
  }

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || typeof saved !== "object") return;
      if (Array.isArray(saved.tasks) && saved.tasks.length) {
        state.tasks = saved.tasks.map(task => typeof task === "string" ? task : "");
        if (saved.taskLayoutVersion !== 2) {
          while (state.tasks.length > 1 && state.tasks.at(-1) === "") state.tasks.pop();
        }
      } else if (typeof saved.task === "string") {
        state.tasks[0] = saved.task;
      }
      if (Number.isInteger(saved.activeTask) && saved.activeTask >= 0 && saved.activeTask < state.tasks.length) {
        state.activeTask = saved.activeTask;
      }
      if (socialInputs.some(input => input.value === saved.social)) state.social = saved.social;
      if (Number.isSafeInteger(saved.groupSize) && saved.groupSize > 0) state.groupSize = saved.groupSize;
      const timer = saved.timer;
      if (!timer || !["ready", "running", "paused", "finished"].includes(timer.status)) return;
      if (!Number.isInteger(timer.duration) || timer.duration < 0 || timer.duration > MAX_DURATION) return;
      if (!Number.isFinite(timer.remaining) || timer.remaining < 0 || timer.remaining > timer.duration) return;
      if (timer.status === "running" && (!Number.isFinite(timer.endsAt) || timer.duration === 0)) return;
      state.timer = {
        duration: timer.duration,
        remaining: timer.status === "ready" ? timer.duration : timer.remaining,
        endsAt: timer.status === "running" ? timer.endsAt : null,
        status: timer.status
      };
    } catch {
      // Beschädigte oder fehlende gespeicherte Werte werden ignoriert.
    }
  }

  let fitFrame;
  function fitTask() {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(() => {
      const field = document.activeElement === taskInput ? taskInput : taskPreview;
      if (!field.clientWidth || !field.clientHeight) return;
      const scrollTop = field.scrollTop;
      let low = 16;
      let high = Math.max(low, field.clientHeight);
      while (high - low > .5) {
        const size = (low + high) / 2;
        field.style.fontSize = `${size}px`;
        if (field.scrollHeight <= field.clientHeight + 1 && field.scrollWidth <= field.clientWidth + 1) {
          low = size;
        } else {
          high = size;
        }
      }
      const fontSize = `${Math.floor(low * 10) / 10}px`;
      taskInput.style.fontSize = taskPreview.style.fontSize = fontSize;
      field.scrollTop = scrollTop;
    });
  }

  function setTask(value) {
    state.tasks[state.activeTask] = value;
    taskPreview.textContent = hyphenate(value);
    clearTask.hidden = value.length === 0;
    fitTask();
    persist();
  }

  function renderTask() {
    taskInput.textContent = state.tasks[state.activeTask];
    taskPreview.textContent = hyphenate(state.tasks[state.activeTask]);
    taskPreview.scrollTop = 0;
    taskInput.scrollTop = 0;
    clearTask.hidden = state.tasks[state.activeTask].length === 0;
    const label = `Aufgabe ${state.activeTask + 1} leeren`;
    clearTask.setAttribute("aria-label", label);
    clearTask.title = label;
    taskSwitcher.querySelectorAll("[data-task]").forEach(button => {
      button.setAttribute("aria-pressed", String(Number(button.dataset.task) === state.activeTask));
    });
    fitTask();
  }

  function renderTaskButtons() {
    const buttons = state.tasks.map((_, index) => {
      const button = document.createElement("button");
      button.className = "task-number";
      button.type = "button";
      button.dataset.task = String(index);
      button.textContent = String(index + 1);
      button.setAttribute("aria-label", `Aufgabe ${index + 1}`);
      return button;
    });
    taskSwitcher.replaceChildren(...buttons, addTask);
  }

  const odfText = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
  const odfTable = "urn:oasis:names:tc:opendocument:xmlns:table:1.0";
  const odfOffice = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";

  function readOdfText(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.data.replace(/[\t\r\n ]+/g, " ");
    if (node.namespaceURI === odfText) {
      if (node.localName === "line-break") return "\n";
      if (node.localName === "tab") return "\t";
      if (node.localName === "s") {
        return " ".repeat(Math.min(10000, Math.max(1, Number(node.getAttributeNS(odfText, "c")) || 1)));
      }
    }
    return Array.from(node.childNodes, readOdfText).join("");
  }

  function readOdsTemplates(buffer) {
    const files = fflate.unzipSync(new Uint8Array(buffer), {
      filter: entry => entry.name === "content.xml"
    });
    if (!files["content.xml"]) throw new Error("content.xml fehlt");
    const xml = new DOMParser().parseFromString(new TextDecoder().decode(files["content.xml"]), "application/xml");
    const spreadsheet = xml.getElementsByTagNameNS(odfOffice, "spreadsheet")[0];
    const table = spreadsheet?.getElementsByTagNameNS(odfTable, "table")[0];
    if (!table) throw new Error("Vorlagentabelle fehlt");

    const templates = [];
    for (const row of table.getElementsByTagNameNS(odfTable, "table-row")) {
      const cells = [];
      for (const cell of row.children) {
        if (cell.namespaceURI !== odfTable || !["table-cell", "covered-table-cell"].includes(cell.localName)) continue;
        const value = Array.from(cell.children)
          .filter(paragraph => paragraph.namespaceURI === odfText && paragraph.localName === "p")
          .map(readOdfText).join("\n").trim();
        const repeat = Number(cell.getAttributeNS(odfTable, "number-columns-repeated")) || 1;
        // Calc fasst gleiche Zellen zusammen, auch leere Zellen bis zum Tabellenende.
        for (let i = 0; i < repeat && cells.length < 2; i++) cells.push(value);
        if (cells.length === 2) break;
      }
      const [description, content] = cells;
      if (!description && !content) continue;
      if (!description || !content) {
        throw new Error("Ungültige Vorlagenzeile");
      }
      if (!templates.length && description.toLowerCase() === "beschreibung" && content.toLowerCase() === "inhalt") continue;
      templates.push([description, content]);
    }
    return templates;
  }

  let templatesRequest = 0;
  async function openTemplates() {
    const request = ++templatesRequest;
    templatesTarget.textContent = `Die ausgewählte Vorlage ersetzt den Text in Aufgabe ${state.activeTask + 1}.`;
    templatesList.replaceChildren();
    templatesStatus.textContent = "Vorlagen werden geladen …";
    templatesDialog.showModal();
    templatesDialog.scrollTop = 0;

    let buffer;
    try {
      const response = await fetch("./vorlagen.ods", { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      buffer = await response.arrayBuffer();
    } catch {
      if (request === templatesRequest && templatesDialog.open) {
        templatesStatus.textContent = location.protocol === "file:"
          ? "Öffne die Klassentafel über einen Webserver, um vorlagen.ods zu laden."
          : "vorlagen.ods konnte nicht geladen werden.";
      }
      return;
    }
    if (request !== templatesRequest || !templatesDialog.open) return;

    let templates;
    try {
      templates = readOdsTemplates(buffer);
    } catch {
      templatesStatus.textContent = "Prüfe das erste Tabellenblatt in vorlagen.ods. Jede Vorlage braucht eine Beschreibung und einen Inhalt.";
      return;
    }

    templatesStatus.textContent = templates.length ? "" : "Die ODS-Datei enthält noch keine Vorlagen.";
    for (const [description, content] of templates) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const title = document.createElement("span");
      const preview = document.createElement("span");
      button.type = "button";
      button.className = "button template-choice";
      title.className = "template-description";
      title.textContent = description.trim();
      preview.className = "template-content";
      preview.textContent = content;
      button.append(title, preview);
      item.append(button);
      templatesList.append(item);
      button.addEventListener("click", () => {
        state.tasks[state.activeTask] = content;
        renderTask();
        persist();
        templatesDialog.close();
      });
    }
  }

  function writeEditor() {
    const seconds = Math.round(state.timer.duration / 1000);
    minutesInput.value = seconds ? String(Math.floor(seconds / 60)).padStart(2, "0") : "";
    secondsInput.value = seconds ? String(seconds % 60).padStart(2, "0") : "";
    minutesInput.setCustomValidity("");
    secondsInput.setCustomValidity("");
    resizeTimerDigits();
  }

  function resizeTimerDigits() {
    const hasThreeDigits = Number(minutesInput.value) >= 100 || state.timer.duration >= 100 * 60 * 1000;
    document.querySelector(".timer-face").classList.toggle("has-hours", hasThreeDigits);
  }

  function readDuration(reportErrors = false) {
    minutesInput.setCustomValidity("");
    secondsInput.setCustomValidity("");
    const inputs = [minutesInput, secondsInput];
    const invalid = inputs.find(input => !input.validity.valid);
    if (invalid) {
      if (reportErrors) invalid.reportValidity();
      return null;
    }
    const minutes = minutesInput.value === "" ? 0 : Number(minutesInput.value);
    const seconds = secondsInput.value === "" ? 0 : Number(secondsInput.value);
    const duration = (minutes * 60 + seconds) * 1000;
    if (duration === 0 && reportErrors) {
      minutesInput.setCustomValidity("Bitte eine Zeit größer als 0 eingeben.");
      minutesInput.reportValidity();
    }
    return duration;
  }

  function remainingNow() {
    const timer = state.timer;
    return timer.status === "running" ? Math.min(timer.duration, Math.max(0, timer.endsAt - Date.now())) : timer.remaining;
  }

  function renderTimer() {
    const timer = state.timer;
    const remaining = remainingNow();
    const ready = timer.status === "ready";
    timerPanel.dataset.status = timer.status;
    timerPanel.classList.toggle("is-ending", remaining > 0 && remaining <= 60000 && !ready);
    timerEditor.setAttribute("aria-hidden", String(!ready));
    timerEditor.inert = !ready;
    timerDisplay.setAttribute("aria-hidden", String(ready));
    const totalSeconds = Math.ceil(remaining / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    if (timerMinutes.textContent !== minutes) timerMinutes.textContent = minutes;
    if (timerSeconds.textContent !== seconds) timerSeconds.textContent = seconds;
    const running = timer.status === "running";
    const toggleLabel = running ? "Pause" : timer.status === "paused" ? "Weiter" : "Start";
    if (timerToggleLabel.textContent !== toggleLabel) timerToggleLabel.textContent = toggleLabel;
    timerToggleIcon.setAttribute("href", running ? "#icon-pause" : "#icon-play");
    const fraction = timer.duration ? remaining / timer.duration : 0;
    timerProgressFill.style.transform = `scaleX(${fraction})`;
    timerProgress.setAttribute("aria-valuenow", String(Math.round(fraction * 100)));
    presetButtons.forEach(button => {
      button.setAttribute("aria-pressed", String(timer.duration === Number(button.dataset.minutes) * 60000));
    });
    resizeTimerDigits();
  }

  function finishTimer() {
    state.timer.status = "finished";
    state.timer.remaining = 0;
    state.timer.endsAt = null;
    document.getElementById("announcement").textContent = "Zeit abgelaufen.";
    persist();
    renderTimer();
  }

  function tick() {
    if (state.timer.status === "running" && remainingNow() <= 0) finishTimer();
    else if (state.timer.status === "running") renderTimer();
    updateClock();
  }

  const clockTime = document.getElementById("clockTime");
  const clockDate = document.getElementById("clockDate");
  const timeFormat = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
  const dateFormat = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  function updateClock() {
    const now = new Date();
    const time = timeFormat.format(now);
    const date = dateFormat.format(now);
    if (clockTime.textContent !== time) {
      clockTime.textContent = time;
      clockTime.dateTime = now.toISOString();
    }
    if (clockDate.textContent !== date) {
      clockDate.textContent = date;
      const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
      clockDate.dateTime = localDate.toISOString().slice(0, 10);
    }
  }

  taskInput.addEventListener("input", () => setTask(taskInput.innerText));
  templatesButton.addEventListener("click", openTemplates);
  taskInput.addEventListener("focus", fitTask);
  taskInput.addEventListener("blur", fitTask);
  taskSwitcher.addEventListener("click", event => {
    const button = event.target.closest("[data-task]");
    if (!button || !taskSwitcher.contains(button)) return;
    state.activeTask = Number(button.dataset.task);
    renderTask();
    persist();
  });
  addTask.addEventListener("click", () => {
    state.tasks.push("");
    state.activeTask = state.tasks.length - 1;
    renderTaskButtons();
    renderTask();
    persist();
    taskInput.focus();
  });
  clearTask.addEventListener("click", () => {
    taskInput.textContent = "";
    setTask("");
    taskInput.focus();
  });

  socialInputs.forEach(input => input.addEventListener("change", () => {
    state.social = input.value;
    persist();
  }));

  groupSize.addEventListener("input", () => {
    const size = groupSize.valueAsNumber;
    state.groupSize = Number.isSafeInteger(size) && size > 0 ? size : null;
    persist();
  });
  groupSize.addEventListener("blur", () => {
    groupSize.value = state.groupSize ?? "";
  });

  [minutesInput, secondsInput].forEach(input => {
    input.addEventListener("input", () => {
      const duration = readDuration();
      if (duration !== null) {
        state.timer = { duration, remaining: duration, endsAt: null, status: "ready" };
        persist();
        renderTimer();
      }
    });
    input.addEventListener("change", () => {
      if (input.value !== "" && input.validity.valid) input.value = input.value.padStart(2, "0");
    });
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        timerToggle.click();
      }
    });
  });

  presetButtons.forEach(button => button.addEventListener("click", () => {
    const duration = Number(button.dataset.minutes) * 60000;
    state.timer = { duration, remaining: duration, endsAt: null, status: "ready" };
    document.getElementById("announcement").textContent = "";
    writeEditor();
    persist();
    renderTimer();
  }));

  timerToggle.addEventListener("click", () => {
    const timer = state.timer;
    if (timer.status === "running") {
      timer.remaining = remainingNow();
      if (timer.remaining <= 0) return finishTimer();
      timer.endsAt = null;
      timer.status = "paused";
    } else {
      if (timer.status === "ready") {
        const duration = readDuration(true);
        if (duration === null || duration <= 0) return;
        timer.duration = duration;
        timer.remaining = duration;
      } else if (timer.status === "finished") {
        if (timer.duration <= 0) return;
        timer.remaining = timer.duration;
      }
      timer.endsAt = Date.now() + timer.remaining;
      timer.status = "running";
      document.getElementById("announcement").textContent = "";
    }
    persist();
    renderTimer();
    timerToggle.focus({ preventScroll: true });
  });

  document.getElementById("timerReset").addEventListener("click", () => {
    state.timer.status = "ready";
    state.timer.remaining = state.timer.duration;
    state.timer.endsAt = null;
    document.getElementById("announcement").textContent = "";
    writeEditor();
    persist();
    renderTimer();
  });

  function renderFullscreen() {
    const active = Boolean(document.fullscreenElement);
    const label = active ? "Vollbild beenden" : "Vollbild anzeigen";
    fullscreenButton.setAttribute("aria-label", label);
    fullscreenButton.setAttribute("aria-pressed", String(active));
    fullscreenButton.title = label;
    document.getElementById("fullscreenIcon").setAttribute("href", active ? "#icon-exit-fullscreen" : "#icon-fullscreen");
    fitTask();
  }

  fullscreenButton.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      document.getElementById("announcement").textContent = "Vollbild ist in diesem Browser nicht verfügbar.";
    }
    renderFullscreen();
  });
  document.addEventListener("fullscreenchange", renderFullscreen);
  fullscreenButton.hidden = !document.fullscreenEnabled;

  document.getElementById("resetButton").addEventListener("click", () => {
    state.tasks = [""];
    state.activeTask = 0;
    state.social = "single";
    state.groupSize = null;
    groupSize.value = "";
    state.timer = { duration: 0, remaining: 0, endsAt: null, status: "ready" };
    document.getElementById("announcement").textContent = "";
    renderTaskButtons();
    renderTask();
    socialInputs.forEach(input => { input.checked = input.value === state.social; });
    writeEditor();
    renderTimer();
    persist();
  });

  restore();
  groupSize.value = state.groupSize ?? "";
  renderTaskButtons();
  renderTask();
  socialInputs.forEach(input => { input.checked = input.value === state.social; });
  writeEditor();
  renderTimer();
  tick();
  fitTask();
  const taskObserver = new ResizeObserver(fitTask);
  taskObserver.observe(taskInput);
  window.addEventListener("resize", fitTask);
  document.fonts.ready.then(fitTask);
  document.addEventListener("visibilitychange", () => {
    tick();
    if (document.visibilityState === "hidden") persist();
  });
  window.addEventListener("pagehide", persist);
  window.addEventListener("pageshow", tick);
  setInterval(tick, 200);

  if ("serviceWorker" in navigator && ["http:", "https:"].includes(location.protocol)) {
    navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" }).catch(() => {
      // Die lokale Zustandsspeicherung funktioniert unabhängig vom Offline-Cache.
    });
  }
})();
