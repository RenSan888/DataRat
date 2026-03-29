const container = document.getElementById("cards");
const title = document.getElementById("title");
const summary = document.getElementById("summary");
const contentPanel = document.querySelector(".content");
const closeBtn = document.querySelector(".close-btn");

function getRiskLevel(score) {
  if (!Number.isFinite(score)) return "medium";
  const normalized = Math.max(1, Math.min(10, score));
  if (normalized <= 3) return "low";
  if (normalized <= 6) return "medium";
  return "high";
}

function parseUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.hostname || urlString;
  } catch {
    return urlString;
  }
}

function extractRiskScore(aiResult) {
  if (!aiResult) return null;
  const direct = Number(aiResult?.consentRiskScore?.score);
  if (Number.isFinite(direct)) return direct;
  const fallback = Number(aiResult?.riskScore);
  if (Number.isFinite(fallback)) return fallback;
  return null;
}

function formatTimestamp(isoString) {
  if (!isoString) return "Unknown time";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString();
}

function formatArrayList(arr, label) {
  if (!Array.isArray(arr) || arr.length === 0) return "";
  const items = arr
    .map((item) => `<li>${escapeHtml(String(item))}</li>`)
    .join("");
  return `<p><strong>${label}:</strong></p><ul style="margin: 4px 0 8px 20px;">${items}</ul>`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatTags(tagsArray) {
  if (!Array.isArray(tagsArray) || tagsArray.length === 0) return "";
  const tagBadges = tagsArray
    .map(
      (tag) =>
        `<span style="display: inline-block; background: rgba(118, 15, 15, 0.5); border: 1px solid rgba(118, 15, 15, 0.8); color: #fff; padding: 3px 8px; border-radius: 12px; margin-right: 6px; margin-bottom: 4px; font-size: 11px; white-space: nowrap;">${escapeHtml(String(tag))}</span>`,
    )
    .join("");
  return `<div style="margin-bottom: 8px;">${tagBadges}</div>`;
}

function createCard(item) {
  const card = document.createElement("div");
  card.className = "card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");

  const siteName = parseUrl(item.pageUrl);
  const riskScore = extractRiskScore(item.aiResult);
  const riskLevel = getRiskLevel(riskScore);
  const tags = Array.isArray(item.aiResult?.tags)
    ? item.aiResult.tags.slice(0, 3)
    : [];

  const tagBadgesHtml = tags
    .map(
      (tag) =>
        `<span style="display: inline-block; background: rgba(118, 15, 15, 0.5); border: 1px solid rgba(118, 15, 15, 0.8); color: #fff; padding: 3px 8px; border-radius: 12px; margin-right: 6px; margin-bottom: 4px; font-size: 11px; white-space: nowrap;">${escapeHtml(String(tag))}</span>`,
    )
    .join("");

  card.innerHTML = `
        <div class="card-left">
            <div class="card-title">${escapeHtml(siteName)}</div>
            <div style="margin-bottom: 8px;">${tagBadgesHtml}</div>
        </div>
        <div class="card-risk ${riskLevel}">${riskLevel.toUpperCase()}</div>
    `;

  const showDetails = () => {
    const timestamp = formatTimestamp(item.timestamp);
    const riskReason =
      item.aiResult?.consentRiskScore?.reason || "Unable to determine reason";
    const whatTheyTake = formatArrayList(
      item.aiResult?.whatTheyTake,
      "What They Collect",
    );
    const whatTheyDoWithIt = formatArrayList(
      item.aiResult?.whatTheyDoWithIt,
      "What They Do With It",
    );
    const worstCaseScenario = formatArrayList(
      item.aiResult?.worstCaseScenario,
      "Worst Case Scenario",
    );
    const tagDisplay = formatTags(item.aiResult?.tags);

    title.textContent = item.pageTitle || siteName;
    summary.innerHTML = `
            <p><strong>Site:</strong> ${escapeHtml(siteName)}</p>
            <p><strong>Risk Level:</strong> ${riskLevel.toUpperCase()}</p>
            <p><strong>Score:</strong> ${Number.isFinite(riskScore) ? riskScore + "/10" : "N/A"}</p>
            <p><strong>Scanned:</strong> ${timestamp}</p>
            <p><strong>Risk Reason:</strong> ${escapeHtml(riskReason)}</p>
            <p><strong>Tags:</strong></p>
            ${tagDisplay}
            ${whatTheyTake}
            ${whatTheyDoWithIt}
            ${worstCaseScenario}
            <p><strong>Full URL:</strong> ${escapeHtml(item.pageUrl)}</p>
            <p><strong>Extracted Context:</strong></p>
            <pre style="max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px; font-size: 12px;">${escapeHtml(item.extractedText || "(No extracted text)")}</pre>
        `;
    contentPanel.classList.remove("hidden");
  };

  card.onclick = showDetails;
  card.onkeypress = (e) => {
    if (e.key === "Enter") showDetails();
  };

  container.appendChild(card);
}

async function loadHistoryData() {
  try {
    const result = await chrome.storage.local.get("apiResultHistory");
    const historyItems = Array.isArray(result?.apiResultHistory)
      ? result.apiResultHistory
      : [];

    if (historyItems.length === 0) {
      container.innerHTML =
        '<div style="padding: 20px; color: #999; text-align: center;">No history data yet. Run analyses in the extension first.</div>';
      return;
    }

    historyItems.forEach(createCard);
  } catch (error) {
    container.innerHTML = `<div style="padding: 20px; color: #f00; text-align: center;">Error loading history: ${error.message}</div>`;
  }
}

loadHistoryData();

// Close panel
closeBtn.onclick = () => contentPanel.classList.add("hidden");
