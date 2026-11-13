(() => {
  "use strict";

  const STORAGE_KEY = "tools-klassentafel-v1";
  const MAX_DURATION = (999 * 60 + 59) * 1000;
  const taskInput = document.getElementById("taskInput");
  const clearTask = document.getElementById("clearTask");
  const taskSwitcher = document.getElementById("taskSwitcher");
  const addTask = document.getElementById("addTask");
  const minutesInput = document.getElementById("minutesInput");
  const secondsInput = document.getElementById("secondsInput");
  const timerPanel = document.getElementById("timerPanel");
  const timerEditor = document.getElementById("timerEditor");
  const timerDisplay = document.getElementById("timerDisplay");
  const timerToggle = document.getElementById("timerToggle");
  const timerToggleLabel = document.getElementById("timerToggleLabel");
  const timerToggleIcon = document.getElementById("timerToggleIcon");
  const timerProgress = document.getElementById("timerProgress");
  const timerProgressFill = document.getElementById("timerProgressFill");
  const fullscreenButton = document.getElementById("fullscreenButton");
  const socialInputs = [...document.querySelectorAll('input[name="social"]')];
  const presetButtons = [...document.querySelectorAll("[data-minutes]")];
  const state = {
    taskLayoutVersion: 2,
    tasks: [""],
    activeTask: 0,
    social: "single",
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
      if (!taskInput.clientWidth || !taskInput.clientHeight) return;
      const scrollTop = taskInput.scrollTop;
      let low = 16;
      let high = Math.max(low, taskInput.clientHeight);
      while (high - low > .5) {
        const size = (low + high) / 2;
        taskInput.style.fontSize = `${size}px`;
        if (taskInput.scrollHeight <= taskInput.clientHeight + 1 && taskInput.scrollWidth <= taskInput.clientWidth + 1) {
          low = size;
        } else {
          high = size;
        }
      }
      taskInput.style.fontSize = `${Math.floor(low * 10) / 10}px`;
      taskInput.scrollTop = scrollTop;
    });
  }

  function setTask(value) {
    state.tasks[state.activeTask] = value;
    clearTask.hidden = value.length === 0;
    fitTask();
    persist();
  }

  function renderTask() {
    taskInput.value = state.tasks[state.activeTask];
    taskInput.scrollTop = 0;
    clearTask.hidden = taskInput.value.length === 0;
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
    timerEditor.hidden = !ready;
    timerDisplay.hidden = ready;
    const totalSeconds = Math.ceil(remaining / 1000);
    const label = `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
    if (timerDisplay.textContent !== label) timerDisplay.textContent = label;
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

  taskInput.addEventListener("input", () => setTask(taskInput.value));
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
    taskInput.value = "";
    setTask("");
    taskInput.focus();
  });

  socialInputs.forEach(input => input.addEventListener("change", () => {
    state.social = input.value;
    persist();
  }));

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
    timerToggle.focus();
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
