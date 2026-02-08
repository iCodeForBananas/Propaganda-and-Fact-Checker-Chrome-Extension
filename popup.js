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

// Load existing key on popup open
chrome.storage.local.get("geminiKey", ({ geminiKey }) => {
  if (geminiKey) {
    document.getElementById("apiKey").value = geminiKey;
  }
});