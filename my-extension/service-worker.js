let cachedApiKey = null;

async function getGeminiApiKey() {
  if (cachedApiKey) {
    return cachedApiKey;
  }

  const configUrl = chrome.runtime.getURL("env.json");
  const response = await fetch(configUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      "Missing env.json. Run: node scripts/inject-env.js from the repo root.",
    );
  }

  const config = await response.json();
  const apiKey = (config?.GEMINI_API_KEY || "").trim();

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is empty in env.json. Update .env and re-run inject script.",
    );
  }

  cachedApiKey = apiKey;
  return cachedApiKey;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SUMMARIZE_CONSENT") {
    console.log("[ConsentOS] Extracted consent text:\n", message.consentText);

    summarizeConsent(message.consentText)
      .then((summary) => sendResponse({ ok: true, summary }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }
});

async function summarizeConsent(consentText) {
  const GEMINI_API_KEY = await getGeminiApiKey();

  const prompt = `
You are analyzing a website consent or cookie popup.

Return JSON only (no markdown, no code fences) with exactly this shape:
{
  "whatTheyTake": ["string"],
  "whatTheyDoWithIt": ["string"],
  "worstCaseScenario": ["string"],
  "consentRiskScore": {
    "score": 1,
    "reason": "string"
  }
}

Rules:
- Keep wording plain and easy to understand.
- Avoid legal jargon unless necessary.
- consentRiskScore.score must be an integer from 1 to 10.
- worstCaseScenario should contain 2 or 3 concise items.

Consent text:
${consentText}
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") ||
    "No summary returned.";

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Gemini returned invalid JSON.");
  }
}
