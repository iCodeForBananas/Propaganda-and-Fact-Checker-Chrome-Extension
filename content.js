console.log("[IG Scanner] 🚀 Content script loaded on:", window.location.href);

let db;
let queue = [];
const BATCH_SIZE = 4; // Smaller batch for deeper analysis
let scanIntervalId = null;
let processIntervalId = null;

// Check if extension context is still valid
const isExtensionValid = () => {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
};

// Stop all intervals when extension context is invalidated
const stopScanner = () => {
  console.log("[IG Scanner] 🛑 Stopping scanner - extension context invalidated");
  if (scanIntervalId) clearInterval(scanIntervalId);
  if (processIntervalId) clearInterval(processIntervalId);
  scanIntervalId = null;
  processIntervalId = null;
};

// Generate a cache key from username + comment text
const getCacheKey = (user, text) => {
  const str = `${user}::${text}`;
  // Simple hash for shorter keys
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `${user}_${hash}`;
};

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

const getCache = (key) =>
  new Promise((res) => {
    const r = db.transaction("ratings").objectStore("ratings").get(key);
    r.onsuccess = () => {
      if (r.result) console.log("[IG Scanner] 💾 Cache hit for key:", key);
      res(r.result);
    };
    r.onerror = (e) => {
      console.error("[IG Scanner] ❌ Cache read error:", e.target.error);
      res(undefined);
    };
  });

const setCache = (key, value) => {
  db.transaction("ratings", "readwrite").objectStore("ratings").put(value, key);
  console.log("[IG Scanner] 💾 Cached result for key:", key);
};

async function processBatch() {
  if (!isExtensionValid()) {
    stopScanner();
    return;
  }
  
  console.log("[IG Scanner] ⏰ processBatch triggered, queue length:", queue.length);

  // Check if paused
  let scannerPaused, debugMode;
  try {
    ({ scannerPaused, debugMode } = await chrome.storage.local.get(["scannerPaused", "debugMode"]));
  } catch (e) {
    stopScanner();
    return;
  }
  
  if (scannerPaused) {
    console.log("[IG Scanner] ⏸️ Scanner is paused, skipping batch processing");
    return;
  }

  if (queue.length === 0) {
    console.log("[IG Scanner] 📭 Queue empty, skipping batch processing");
    return;
  }

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

  // Debug mode - log payload and skip API call
  if (debugMode) {
    console.log("[IG Scanner] 🐛 DEBUG MODE - Would send to API:");
    console.log("[IG Scanner] 🐛 Prompt:", prompt);
    console.log("[IG Scanner] 🐛 Comments data:", current.map((i) => ({ user: i.user, text: i.text, cacheKey: i.cacheKey })));
    console.log("[IG Scanner] 🐛 Request body:", JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }, null, 2));
    // Apply a mock rating in debug mode so we can see the UI working
    current.forEach((item) => {
      const mockAnalysis = { rating: 5, fact: "[DEBUG] API call skipped" };
      setCache(item.cacheKey, mockAnalysis);
      applyUI(item.node, mockAnalysis);
    });
    return;
  }

  const { geminiKey } = await chrome.storage.local.get("geminiKey");
  if (!geminiKey) {
    console.warn("[IG Scanner] ⚠️ No Gemini API key found! Please set it in the popup.");
    return;
  }
  console.log("[IG Scanner] 🔑 API key found, processing batch...");

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
      setCache(item.cacheKey, analysis);
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
  const meta = document.createElement("span");
  meta.style.cssText = `font-size: 10px; color: ${color}; margin-left: 8px; font-weight: bold; cursor: help;`;
  meta.textContent = `${rating}/10`;
  if (fact) meta.title = fact;
  node.appendChild(meta);
}

let scanCount = 0;
const scan = async () => {
  if (!isExtensionValid()) {
    stopScanner();
    return;
  }
  
  scanCount++;
  console.log("[IG Scanner] 🔍 Scan #" + scanCount + " started...");

  // Check if paused
  let scannerPaused;
  try {
    ({ scannerPaused } = await chrome.storage.local.get("scannerPaused"));
  } catch (e) {
    stopScanner();
    return;
  }
  
  if (scannerPaused) {
    console.log("[IG Scanner] ⏸️ Scanner is paused, skipping scan");
    return;
  }

  if (!db) {
    console.log("[IG Scanner] 📦 DB not initialized, initializing now...");
    await initDB();
  }

  // Instagram comment selectors - targets comment containers
  // Handles both feed view and post modal view
  const selectors = [
    // Post modal view - comment list items (most specific)
    'li._a9zj._a9zl',
    'li[class*="_a9zj"]',
    // Post modal - comment rows inside ul
    'ul._a9ym > div[role="button"]',
    'ul._a9z6 > div[role="button"]',
    // Comment wrapper divs
    'div._a9zm',
    // Feed view - comment containers
    'ul > div > div[class*="x78zum5"]',
    // Generic Instagram comment patterns
    'div[class*="x1nhvcw1"]',
    'div[class*="xjbqb8w"]',
    // Article-based comments
    'article ul > div > div',
    'article li > div._a9zm',
  ];

  const nodes = document.querySelectorAll(selectors.join(", "));
  console.log("[IG Scanner] 🔎 Found", nodes.length, "potential comment nodes");

  let newCommentsFound = 0;
  let skippedAlreadyScanned = 0;
  let skippedValidation = 0;

  // Track processed user+text combos in this scan to avoid duplicates from overlapping selectors
  const processedThisScan = new Set();

  for (const node of nodes) {
    // Skip if already scanned
    if (node.dataset.scanned) {
      skippedAlreadyScanned++;
      continue;
    }

    // Skip if any ancestor is already scanned (prevents child duplication)
    if (node.closest('[data-scanned="true"]')) {
      skippedAlreadyScanned++;
      continue;
    }

    // Skip if this node contains an already-scanned child (we're a parent container)
    if (node.querySelector('[data-scanned="true"]')) {
      skippedAlreadyScanned++;
      continue;
    }

    // Find username - Instagram uses links for usernames
    const userLink = node.querySelector('a[href^="/"][role="link"]') || 
                     node.querySelector('h3 a[href^="/"]') ||
                     node.querySelector('a[href^="/"]');
    let user = userLink?.innerText?.trim();
    
    // Clean username (remove any extra text)
    if (user) {
      user = user.split('\n')[0].trim();
    }

    // Find comment text - try specific Instagram classes first, then fallback
    let text = "";
    
    // Post modal: comment text in span with _ap3a class
    const commentSpan = node.querySelector('span._ap3a._aaco._aacu._aacx._aad7._aade') ||
                        node.querySelector('span[class*="_ap3a"][class*="_aaco"]') ||
                        node.querySelector('div._a9zr span[dir="auto"]');
    
    if (commentSpan) {
      text = commentSpan.innerText?.trim() || "";
    }
    
    // Fallback: Find text spans and get the first meaningful one
    if (!text) {
      const textSpans = node.querySelectorAll('span[dir="auto"]');
      for (const span of textSpans) {
        const spanText = span.innerText?.trim();
        // Skip if it's just the username, too short, or looks like metadata
        if (spanText && spanText !== user && spanText.length > 2 && 
            !spanText.match(/^\d+[dhwm]?$/) && // Skip timestamps like "6d"
            !spanText.match(/^\d+ likes?$/i) &&
            !spanText.match(/^Reply$/i)) {
          text = spanText;
          break;
        }
      }
    }

    // Validate this looks like a comment (has user and text)
    if (!user || !text || user.length > 30 || text.length < 2) {
      skippedValidation++;
      continue;
    }

    // Skip if we already processed this exact user+text combo in this scan
    const comboKey = `${user}::${text}`;
    if (processedThisScan.has(comboKey)) {
      skippedAlreadyScanned++;
      continue;
    }
    processedThisScan.add(comboKey);

    node.dataset.scanned = "true";
    // Also mark all descendants as scanned to prevent child elements from being processed
    node.querySelectorAll('*').forEach(child => child.dataset.scanned = "true");
    
    newCommentsFound++;
    
    const cacheKey = getCacheKey(user, text);
    console.log(
      "[IG Scanner] 📝 New comment found - User:",
      user,
      "Key:",
      cacheKey,
      "Text:",
      text.substring(0, 50) + (text.length > 50 ? "..." : ""),
    );

    const cached = await getCache(cacheKey);
    if (cached) {
      console.log("[IG Scanner] 💾 Using cached result for", cacheKey);
      applyUI(node, cached);
    } else {
      console.log("[IG Scanner] ➕ Added to queue:", user, "key:", cacheKey);
      queue.push({ user, text, node, cacheKey });
    }
  }

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
scanIntervalId = setInterval(scan, 3000);
processIntervalId = setInterval(processBatch, 7000);

// Run initial scan immediately
console.log("[IG Scanner] 🎬 Running initial scan...");
scan();
