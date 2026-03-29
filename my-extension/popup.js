const analyzeBtn = document.getElementById("analyzeBtn");
const output = document.getElementById("output");
const extractedText = document.getElementById("extractedText");
const status = document.getElementById("status");
const toggleExtractedBtn = document.getElementById("toggleExtractedBtn");
const riskBadge = document.getElementById("riskBadge");
const historyPanel = document.getElementById("historyPanel");
const refreshHistoryBtn = document.getElementById("refreshHistoryBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const relatedLinksPanel = document.getElementById("relatedLinksPanel");
const scanBestLinkBtn = document.getElementById("scanBestLinkBtn");
const API_HISTORY_KEY = "apiResultHistory";

let rankedLinks = [];

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderJsonWithHighlight(value) {
  const pretty = JSON.stringify(value, null, 2);
  const escaped = escapeHtml(pretty);

  const highlighted = escaped.replace(
    /(\"([^\"\\]|\\.)*\"\s*:|\"([^\"\\]|\\.)*\"|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      if (match.endsWith(":")) {
        return `<span class="json-key">${match}</span>`;
      }
      if (match.startsWith('"')) {
        return `<span class="json-string">${match}</span>`;
      }
      if (match === "true" || match === "false") {
        return `<span class="json-boolean">${match}</span>`;
      }
      if (match === "null") {
        return `<span class="json-null">${match}</span>`;
      }
      return `<span class="json-number">${match}</span>`;
    },
  );

  output.innerHTML = highlighted;
}

function formatTimestamp(isoValue) {
  if (!isoValue) return "Unknown time";
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString();
}

function truncateText(value, maxLength) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

function summarizeAiResult(aiResult) {
  if (aiResult == null) return "No AI result saved.";
  if (typeof aiResult === "string") return truncateText(aiResult, 160);

  try {
    return truncateText(JSON.stringify(aiResult), 160);
  } catch {
    return "Unable to display AI result.";
  }
}

function renderHistory(historyItems) {
  if (!Array.isArray(historyItems) || historyItems.length === 0) {
    historyPanel.innerHTML = '<div class="history-empty">No history yet.</div>';
    return;
  }

  const cards = historyItems
    .map((item, index) => {
      const title = truncateText(item.pageTitle || "(Untitled page)", 80);
      const url = truncateText(item.pageUrl || "", 110);
      const extractedPreview = truncateText(item.extractedText || "", 140);
      const aiPreview = summarizeAiResult(item.aiResult);
      const score = getRiskScore(item.aiResult);
      const riskText = Number.isFinite(score)
        ? `${Math.max(1, Math.min(10, Math.round(score)))}/10`
        : "N/A";

      return `
        <article class="history-item" data-history-index="${index}">
          <div class="history-meta">
            <span class="history-time">${escapeHtml(formatTimestamp(item.timestamp))}</span>
            <span class="risk-badge">${escapeHtml(riskText)}</span>
          </div>
          <div class="history-title">${escapeHtml(title)}</div>
          <div class="history-url">${escapeHtml(url)}</div>
          <div class="history-snippet"><strong>Extracted:</strong> ${escapeHtml(extractedPreview || "(empty)")}</div>
          <div class="history-snippet"><strong>AI:</strong> ${escapeHtml(aiPreview)}</div>
          <div class="history-actions">
            <button class="tiny-btn" type="button" data-view-history="${index}">View</button>
          </div>
        </article>
      `;
    })
    .join("");

  historyPanel.innerHTML = cards;
}

async function loadHistory() {
  const stored = await chrome.storage.local.get(API_HISTORY_KEY);
  const historyItems = Array.isArray(stored?.[API_HISTORY_KEY])
    ? stored[API_HISTORY_KEY]
    : [];
  renderHistory(historyItems);
  return historyItems;
}

function getRiskScore(summary) {
  const direct = Number(summary?.consentRiskScore?.score);
  if (Number.isFinite(direct)) return direct;

  const fallback = Number(summary?.riskScore);
  if (Number.isFinite(fallback)) return fallback;

  return null;
}

function setRiskBadge(score) {
  riskBadge.classList.remove("risk-low", "risk-medium", "risk-high");

  if (!Number.isFinite(score)) {
    riskBadge.textContent = "N/A";
    return;
  }

  const normalized = Math.max(1, Math.min(10, Math.round(score)));
  riskBadge.textContent = `${normalized}/10`;

  if (normalized <= 3) {
    riskBadge.classList.add("risk-low");
    return;
  }

  if (normalized <= 6) {
    riskBadge.classList.add("risk-medium");
    return;
  }

  riskBadge.classList.add("risk-high");
}

function setBusyState(isBusy, statusText) {
  analyzeBtn.disabled = isBusy;
  scanBestLinkBtn.disabled = isBusy || rankedLinks.length === 0;
  analyzeBtn.textContent = isBusy ? "Analyzing..." : "Analyze This Page";
  status.textContent = statusText;
}

function scoreRelatedLink(link) {
  const haystack = `${link?.label || ""} ${link?.href || ""}`.toLowerCase();
  let score = 0;

  const weightedWords = {
    privacy: 4,
    cookie: 4,
    consent: 4,
    policy: 3,
    preferences: 3,
    settings: 2,
    gdpr: 3,
    ccpa: 3,
    terms: 1,
  };

  for (const [word, weight] of Object.entries(weightedWords)) {
    if (haystack.includes(word)) score += weight;
  }

  if (String(link?.href || "").startsWith("https://")) score += 1;

  return score;
}

function rankRelatedLinks(links) {
  if (!Array.isArray(links)) return [];

  return links
    .map((link) => ({
      label: String(link?.label || "(no label)"),
      href: String(link?.href || ""),
      score: scoreRelatedLink(link),
    }))
    .filter((link) => link.href)
    .sort((a, b) => b.score - a.score || a.href.length - b.href.length)
    .slice(0, 8);
}

function renderRelatedLinks() {
  if (!Array.isArray(rankedLinks) || rankedLinks.length === 0) {
    relatedLinksPanel.innerHTML =
      '<div class="links-empty">No related links ranked yet.</div>';
    scanBestLinkBtn.disabled = true;
    return;
  }

  relatedLinksPanel.innerHTML = rankedLinks
    .map(
      (link, index) => `
        <article class="link-item">
          <div class="link-item-title">${escapeHtml(link.label)}</div>
          <div class="link-item-url">${escapeHtml(truncateText(link.href, 120))}</div>
          <div class="link-item-actions">
            <span class="link-score">Match ${escapeHtml(String(link.score))}</span>
            <button class="tiny-btn" type="button" data-scan-link="${index}">Open + Scan</button>
          </div>
        </article>
      `,
    )
    .join("");

  scanBestLinkBtn.disabled = analyzeBtn.disabled;
}

function waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("Timed out waiting for page to finish loading."));
    }, timeoutMs);

    const onUpdated = (updatedTabId, info, tab) => {
      if (updatedTabId !== tabId) return;
      if (info.status !== "complete") return;

      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve(tab);
    };

    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

async function getExtractionForTab(tabId) {
  const injectionResults = await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });

  return (injectionResults || [])
    .map((r) => r.result)
    .find((result) => result && result.ok && result.data);
}

async function scanSpecificUrl(url) {
  if (!url) return;

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) {
    throw new Error("Could not find active tab.");
  }

  setBusyState(true, "Opening selected link...");
  const updatedTab = await chrome.tabs.update(tab.id, { url });
  const loadedTab = await waitForTabComplete(updatedTab.id);
  await runAnalysis(loadedTab);
}

async function runAnalysis(tabOverride) {
  setBusyState(true, "Extracting consent context from the page...");
  output.textContent = "Extracting consent text...";
  extractedText.textContent = "Extracting consent text...";
  setRiskBadge(null);

  const tab =
    tabOverride ||
    (
      await chrome.tabs.query({
        active: true,
        currentWindow: true,
      })
    )[0];

  if (!tab?.id) {
    output.textContent = "Could not find active tab.";
    extractedText.textContent = "Could not find active tab.";
    setBusyState(false, "No active tab detected.");
    return;
  }

  const extracted = await getExtractionForTab(tab.id);

  if (!extracted) {
    rankedLinks = [];
    renderRelatedLinks();
    output.textContent = "No consent text found.";
    extractedText.textContent = "No consent text found.";
    setBusyState(false, "No consent banner was detected on this page.");
    return;
  }

  const extractedDataText = JSON.stringify(extracted.data, null, 2);
  extractedText.textContent = extractedDataText;
  output.textContent = extractedDataText;

  rankedLinks = rankRelatedLinks(extracted.data?.relatedLinks);
  renderRelatedLinks();

  setBusyState(true, "Generating structured JSON summary...");
  output.textContent = "Sending text to Gemini...";

  const response = await chrome.runtime.sendMessage({
    type: "SUMMARIZE_CONSENT",
    consentText: extractedDataText,
    pageUrl: tab.url || "",
    pageTitle: tab.title || "",
  });

  if (!response?.ok) {
    output.textContent = `AI error: ${response?.error || "Unknown error"}`;
    await loadHistory();
    setBusyState(false, "AI request failed. Please try again.");
    return;
  }

  let summaryData = response.summary;

  if (typeof response.summary === "string") {
    try {
      summaryData = JSON.parse(response.summary);
    } catch {
      output.textContent = response.summary;
      setRiskBadge(null);
      await loadHistory();
      setBusyState(false, "Analysis complete.");
      return;
    }
  }

  renderJsonWithHighlight(summaryData);
  setRiskBadge(getRiskScore(summaryData));
  await loadHistory();
  setBusyState(false, "Analysis complete.");
}

historyPanel.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const viewIndex = target.getAttribute("data-view-history");
  if (viewIndex == null) return;

  const parsedIndex = Number(viewIndex);
  if (!Number.isInteger(parsedIndex) || parsedIndex < 0) return;

  const historyItems = await loadHistory();
  const item = historyItems[parsedIndex];
  if (!item) return;

  extractedText.textContent = item.extractedText || "(no extracted text saved)";

  if (typeof item.aiResult === "string") {
    output.textContent = item.aiResult;
    setRiskBadge(null);
  } else {
    renderJsonWithHighlight(item.aiResult || {});
    setRiskBadge(getRiskScore(item.aiResult));
  }

  const shownTitle = item.pageTitle || "Untitled page";
  status.textContent = `Viewing history: ${shownTitle}`;
});

refreshHistoryBtn.addEventListener("click", async () => {
  await loadHistory();
  status.textContent = "History refreshed.";
});

clearHistoryBtn.addEventListener("click", async () => {
  await chrome.storage.local.remove(API_HISTORY_KEY);
  await loadHistory();
  status.textContent = "History cleared.";
});

scanBestLinkBtn.addEventListener("click", async () => {
  if (rankedLinks.length === 0) {
    status.textContent = "No ranked links available yet.";
    return;
  }

  try {
    await scanSpecificUrl(rankedLinks[0].href);
  } catch (error) {
    output.textContent = `Error: ${error.message}`;
    extractedText.textContent = `Error: ${error.message}`;
    setRiskBadge(null);
    setBusyState(false, "Could not scan selected link.");
  }
});

relatedLinksPanel.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const scanIndex = target.getAttribute("data-scan-link");
  if (scanIndex == null) return;

  const parsedIndex = Number(scanIndex);
  if (!Number.isInteger(parsedIndex) || parsedIndex < 0) return;

  const selected = rankedLinks[parsedIndex];
  if (!selected?.href) return;

  try {
    await scanSpecificUrl(selected.href);
  } catch (error) {
    output.textContent = `Error: ${error.message}`;
    extractedText.textContent = `Error: ${error.message}`;
    setRiskBadge(null);
    setBusyState(false, "Could not scan selected link.");
  }
});

toggleExtractedBtn.addEventListener("click", () => {
  const isCollapsed = extractedText.classList.toggle("collapsed");
  toggleExtractedBtn.textContent = isCollapsed ? "Expand" : "Collapse";
  toggleExtractedBtn.setAttribute("aria-expanded", String(!isCollapsed));
});

analyzeBtn.addEventListener("click", async () => {
  try {
    await runAnalysis();
  } catch (error) {
    output.textContent = `Error: ${error.message}`;
    extractedText.textContent = `Error: ${error.message}`;
    setRiskBadge(null);
    setBusyState(false, "Unexpected error while analyzing this page.");
  }
});

renderRelatedLinks();

loadHistory().catch(() => {
  historyPanel.innerHTML =
    '<div class="history-empty">Could not load history.</div>';
});
