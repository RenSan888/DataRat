const analyzeBtn = document.getElementById("analyzeBtn");
const output = document.getElementById("output");
const extractedText = document.getElementById("extractedText");
const status = document.getElementById("status");
const toggleExtractedBtn = document.getElementById("toggleExtractedBtn");
const riskBadge = document.getElementById("riskBadge");

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
  analyzeBtn.textContent = isBusy ? "Analyzing..." : "Analyze This Page";
  status.textContent = statusText;
}

toggleExtractedBtn.addEventListener("click", () => {
  const isCollapsed = extractedText.classList.toggle("collapsed");
  toggleExtractedBtn.textContent = isCollapsed ? "Expand" : "Collapse";
  toggleExtractedBtn.setAttribute("aria-expanded", String(!isCollapsed));
});

analyzeBtn.addEventListener("click", async () => {
  setBusyState(true, "Extracting consent context from the page...");
  output.textContent = "Extracting consent text...";
  extractedText.textContent = "Extracting consent text...";
  setRiskBadge(null);

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      output.textContent = "Could not find active tab.";
      extractedText.textContent = "Could not find active tab.";
      setBusyState(false, "No active tab detected.");
      return;
    }

    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });

    const extracted = (injectionResults || [])
      .map((r) => r.result)
      .find((result) => result && result.ok && result.data);

    if (!extracted) {
      output.textContent = "No consent text found.";
      extractedText.textContent = "No consent text found.";
      setBusyState(false, "No consent banner was detected on this page.");
      return;
    }

    const extractedDataText = JSON.stringify(extracted.data, null, 2);
    extractedText.textContent = extractedDataText;
    output.textContent = extractedDataText;
    setBusyState(true, "Generating structured JSON summary...");

    output.textContent = "Sending text to Gemini...";

    const response = await chrome.runtime.sendMessage({
      type: "SUMMARIZE_CONSENT",
      consentText: extractedDataText,
    });

    if (!response?.ok) {
      output.textContent = `AI error: ${response?.error || "Unknown error"}`;
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
        setBusyState(false, "Analysis complete.");
        return;
      }
    }

    renderJsonWithHighlight(summaryData);
    setRiskBadge(getRiskScore(summaryData));
    setBusyState(false, "Analysis complete.");
  } catch (error) {
    output.textContent = `Error: ${error.message}`;
    extractedText.textContent = `Error: ${error.message}`;
    setRiskBadge(null);
    setBusyState(false, "Unexpected error while analyzing this page.");
  }
});
