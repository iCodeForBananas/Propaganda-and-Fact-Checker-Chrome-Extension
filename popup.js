document.getElementById("save").addEventListener("click", async () => {
  const apiKey = document.getElementById("apiKey").value;

  if (!apiKey) {
    document.getElementById("status").textContent = "⚠️ Please enter an API key";
    document.getElementById("status").style.color = "#ff4d4d";
    return;
  }

  await chrome.storage.local.set({ geminiKey: apiKey });
  document.getElementById("status").textContent = "✅ Settings saved!";
  document.getElementById("status").style.color = "#4caf50";
});

// Pause button functionality
const pauseBtn = document.getElementById("pauseBtn");

const updatePauseButton = (isPaused) => {
  if (isPaused) {
    pauseBtn.textContent = "▶️ Resume Scanning";
    pauseBtn.classList.add("paused");
  } else {
    pauseBtn.textContent = "⏸️ Pause Scanning";
    pauseBtn.classList.remove("paused");
  }
};

pauseBtn.addEventListener("click", async () => {
  const { scannerPaused } = await chrome.storage.local.get("scannerPaused");
  const newState = !scannerPaused;
  await chrome.storage.local.set({ scannerPaused: newState });
  updatePauseButton(newState);
});

// Debug button functionality
const debugBtn = document.getElementById("debugBtn");

const updateDebugButton = (isDebug) => {
  if (isDebug) {
    debugBtn.textContent = "🐛 Debug Mode ON";
    debugBtn.classList.add("active");
  } else {
    debugBtn.textContent = "🐛 Debug Mode";
    debugBtn.classList.remove("active");
  }
};

debugBtn.addEventListener("click", async () => {
  const { debugMode } = await chrome.storage.local.get("debugMode");
  const newState = !debugMode;
  await chrome.storage.local.set({ debugMode: newState });
  updateDebugButton(newState);
});

// Load existing settings on popup open
chrome.storage.local.get(["geminiKey", "scannerPaused", "debugMode"], ({ geminiKey, scannerPaused, debugMode }) => {
  if (geminiKey) {
    document.getElementById("apiKey").value = geminiKey;
  }
  updatePauseButton(!!scannerPaused);
  updateDebugButton(!!debugMode);
});
