let db;
let queue = [];
const BATCH_SIZE = 4; // Smaller batch for deeper analysis

const initDB = () => new Promise(res => {
  const req = indexedDB.open("ScannerCache", 1);
  req.onupgradeneeded = () => req.result.createObjectStore("ratings");
  req.onsuccess = () => { db = req.result; res(); };
});

const getCache = (k) => new Promise(res => {
  const r = db.transaction("ratings").objectStore("ratings").get(k);
  r.onsuccess = () => res(r.result);
});

async function processBatch() {
  if (queue.length === 0) return;
  const { geminiKey } = await chrome.storage.local.get("geminiKey");
  if (!geminiKey) return;

  const current = queue.splice(0, BATCH_SIZE);
  
  // SYSTEM PROMPT: Enhanced with Fact-Checking
  const prompt = `You are a disinformation expert. Analyze these IG comments.
    1. Rating: 1-10 (10=Propaganda/Bot).
    2. FactCheck: If they make a claim, verify it. 
    Return ONLY a JSON array of objects: [{"rating": 8, "fact": "Claim is false: [reason]"}, ...]
    Data: ${JSON.stringify(current.map(i => ({u: i.user, t: i.text})))}`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: "POST",
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await res.json();
    const results = JSON.parse(data.candidates[0].content.parts[0].text.match(/\[.*\]/s)[0]);

    current.forEach((item, i) => {
      const analysis = results[i] || { rating: 1, fact: "" };
      db.transaction("ratings", "readwrite").objectStore("ratings").put(analysis, item.user);
      applyUI(item.node, analysis);
    });
  } catch (e) { console.error(e); }
}

function applyUI(node, analysis) {
  const { rating, fact } = analysis;
  const color = rating >= 8 ? "#ff4d4d" : rating >= 5 ? "#ffa500" : "#4caf50";
  
  node.style.borderLeft = `5px solid ${color}`;
  const meta = document.createElement("div");
  meta.style.cssText = `font-size: 10px; color: ${color}; margin-left: 54px; font-weight: bold;`;
  meta.innerHTML = `Rating: ${rating}/10 ${fact ? `| 🔍 ${fact}` : ""}`;
  node.appendChild(meta);
}

const scan = async () => {
  if (!db) await initDB();
  document.querySelectorAll('div[role="menuitem"], ul li').forEach(async node => {
    const user = node.querySelector('a')?.innerText;
    const text = node.querySelector('span')?.innerText;
    if (!user || node.dataset.scanned) return;
    node.dataset.scanned = "true";

    const cached = await getCache(user);
    if (cached) applyUI(node, cached);
    else queue.push({ user, text, node });
  });
};

setInterval(scan, 3000);
setInterval(processBatch, 7000);