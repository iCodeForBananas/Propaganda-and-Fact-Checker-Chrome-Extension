console.log("[IG Scanner] 🚀 Content script loaded on:", window.location.href);

let db;
let queue = [];
const BATCH_SIZE = 4; // Smaller batch for deeper analysis

const initDB = () =>
  new Promise((res, rej) => {
    console.log("[IG Scanner] 📦 Initializing IndexedDB...");
    const req = indexedDB.open("ScannerCache", 1);
    req.onerror = (e) => {
      console.error("[IG Scanner] ❌ IndexedDB error:", e.target.error);
      rej(e.target.error);
    };
    req.onupgradeneeded = () => {
      console.log("[IG Scanner] 📦 Creating IndexedDB object store...");
      req.result.createObjectStore("ratings");
    };
    req.onsuccess = () => {
      db = req.result;
      console.log("[IG Scanner] ✅ IndexedDB initialized successfully");
      res();
    };
  });

const getCache = (k) =>
  new Promise((res) => {
    const r = db.transaction("ratings").objectStore("ratings").get(k);
    r.onsuccess = () => {
      if (r.result) console.log("[IG Scanner] 💾 Cache hit for user:", k);
      res(r.result);
    };
    r.onerror = (e) => {
      console.error("[IG Scanner] ❌ Cache read error:", e.target.error);
      res(undefined);
    };
  });

async function processBatch() {
  console.log("[IG Scanner] ⏰ processBatch triggered, queue length:", queue.length);

  if (queue.length === 0) {
    console.log("[IG Scanner] 📭 Queue empty, skipping batch processing");
    return;
  }

  const { geminiKey } = await chrome.storage.local.get("geminiKey");
  if (!geminiKey) {
    console.warn("[IG Scanner] ⚠️ No Gemini API key found! Please set it in the popup.");
    return;
  }
  console.log("[IG Scanner] 🔑 API key found, processing batch...");

  const current = queue.splice(0, BATCH_SIZE);
  console.log(
    "[IG Scanner] 📤 Processing",
    current.length,
    "items:",
    current.map((i) => i.user),
  );

  // SYSTEM PROMPT: Enhanced with Fact-Checking
  const prompt = `You are a disinformation expert. Analyze these IG comments.
    1. Rating: 1-10 (10=Propaganda/Bot).
    2. FactCheck: If they make a claim, verify it. 
    Return ONLY a JSON array of objects: [{"rating": 8, "fact": "Claim is false: [reason]"}, ...]
    Data: ${JSON.stringify(current.map((i) => ({ u: i.user, t: i.text })))}`;

  try {
    console.log("[IG Scanner] 🌐 Sending request to Gemini API...");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );
    const data = await res.json();

    if (!res.ok) {
      console.error("[IG Scanner] ❌ API Error:", data.error?.message || res.status);
      return;
    }

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.error("[IG Scanner] ❌ Invalid API response structure:", data);
      return;
    }

    console.log("[IG Scanner] 📥 API response received");
    const match = data.candidates[0].content.parts[0].text.match(/\[.*\]/s);
    if (!match) {
      console.error("[IG Scanner] ❌ Could not parse JSON from response:", data.candidates[0].content.parts[0].text);
      return;
    }

    const results = JSON.parse(match[0]);
    console.log("[IG Scanner] ✅ Parsed results:", results);

    current.forEach((item, i) => {
      const analysis = results[i] || { rating: 1, fact: "" };
      console.log("[IG Scanner] 💾 Caching result for", item.user, "- Rating:", analysis.rating);
      db.transaction("ratings", "readwrite").objectStore("ratings").put(analysis, item.user);
      applyUI(item.node, analysis);
    });
  } catch (e) {
    console.error("[IG Scanner] ❌ processBatch error:", e);
  }
}

function applyUI(node, analysis) {
  const { rating, fact } = analysis;
  console.log("[IG Scanner] 🎨 Applying UI - Rating:", rating, "Fact:", fact || "(none)");
  const color = rating >= 8 ? "#ff4d4d" : rating >= 5 ? "#ffa500" : "#4caf50";

  node.style.borderLeft = `5px solid ${color}`;
  const meta = document.createElement("div");
  meta.style.cssText = `font-size: 10px; color: ${color}; margin-left: 54px; font-weight: bold;`;
  meta.innerHTML = `Rating: ${rating}/10 ${fact ? `| 🔍 ${fact}` : ""}`;
  node.appendChild(meta);
}

let scanCount = 0;
const scan = async () => {
  scanCount++;
  console.log("[IG Scanner] 🔍 Scan #" + scanCount + " started...");

  if (!db) {
    console.log("[IG Scanner] 📦 DB not initialized, initializing now...");
    await initDB();
  }

  // Instagram comment selectors - targets comment containers
  const selectors = [
    'div[role="menuitem"]',
    "ul li",
    // Instagram comment thread items
    'div[class*="x78zum5"][class*="xdt5ytf"] > div > div',
    // Comment rows in post modal
    'ul[class*="x78zum5"] > div',
    // Direct children of comment sections
    'section main div[class*="x5yr21d"] div[class*="x78zum5"] > div',
  ];

  const nodes = document.querySelectorAll(selectors.join(", "));
  console.log("[IG Scanner] 🔎 Found", nodes.length, "potential comment nodes");

  let newCommentsFound = 0;
  let skippedAlreadyScanned = 0;
  let skippedValidation = 0;

  nodes.forEach(async (node) => {
    // Skip if already scanned or if it's a parent container
    if (node.dataset.scanned) {
      skippedAlreadyScanned++;
      return;
    }

    // Find username - Instagram uses links for usernames
    const userLink = node.querySelector('a[href^="/"]');
    const user = userLink?.innerText?.trim();

    // Find comment text - usually in a span near the username
    const textSpan = node.querySelector('span:not([class*="coreSpriteVerifiedBadge"])');
    const text = textSpan?.innerText?.trim();

    // Validate this looks like a comment (has user and text)
    if (!user || !text || user.length > 30 || text.length < 2) {
      skippedValidation++;
      return;
    }

    node.dataset.scanned = "true";
    newCommentsFound++;
    console.log(
      "[IG Scanner] 📝 New comment found - User:",
      user,
      "Text:",
      text.substring(0, 50) + (text.length > 50 ? "..." : ""),
    );

    const cached = await getCache(user);
    if (cached) {
      console.log("[IG Scanner] 💾 Using cached result for", user);
      applyUI(node, cached);
    } else {
      console.log("[IG Scanner] ➕ Added to queue:", user);
      queue.push({ user, text, node });
    }
  });

  console.log(
    "[IG Scanner] 📊 Scan #" + scanCount + " complete - New:",
    newCommentsFound,
    "| Already scanned:",
    skippedAlreadyScanned,
    "| Failed validation:",
    skippedValidation,
    "| Queue size:",
    queue.length,
  );
};

console.log("[IG Scanner] ⏰ Setting up intervals - Scan: 3s, Process: 7s");
setInterval(scan, 3000);
setInterval(processBatch, 7000);

// Run initial scan immediately
console.log("[IG Scanner] 🎬 Running initial scan...");
scan();
