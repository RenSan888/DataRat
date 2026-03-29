(() => {
  const MAX_TEXT_LENGTH = 7000;
  const MAX_MATCHES = 3;

  function normalizeWhitespace(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);

    return (
      style &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      el.offsetWidth > 0 &&
      el.offsetHeight > 0
    );
  }

  function getAttrText(el) {
    return [
      el.id || "",
      (el.className || "").toString(),
      el.getAttribute("role") || "",
      el.getAttribute("aria-label") || "",
      el.getAttribute("aria-describedby") || "",
      el.getAttribute("data-testid") || ""
    ]
      .join(" ")
      .toLowerCase();
  }

  function getCandidateElements() {
    const selectors = [
      '[id*="cookie" i]',
      '[class*="cookie" i]',
      '[id*="consent" i]',
      '[class*="consent" i]',
      '[id*="privacy" i]',
      '[class*="privacy" i]',
      '[id*="gdpr" i]',
      '[class*="gdpr" i]',
      '[id*="cmp" i]',
      '[class*="cmp" i]',
      '[id*="onetrust" i]',
      '[class*="onetrust" i]',
      '[id*="trustarc" i]',
      '[class*="trustarc" i]',
      '[aria-label*="cookie" i]',
      '[aria-label*="consent" i]',
      '[aria-label*="privacy" i]',
      '[role="dialog"]',
      '[role="alertdialog"]',
      'dialog',
      'aside',
      'section',
      'footer',
      'div'
    ];

    const seen = new Set();
    const results = [];

    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((el) => {
        if (!seen.has(el)) {
          seen.add(el);
          results.push(el);
        }
      });
    }

    return results;
  }

  function looksLikeConsentText(text, attrText = "") {
    const keywords = [
      "cookie",
      "cookies",
      "consent",
      "privacy",
      "personal data",
      "your data",
      "tracking",
      "advertising",
      "analytics",
      "vendors",
      "partners",
      "preferences",
      "gdpr",
      "ccpa",
      "legitimate interest"
    ];

    const combined = `${text} ${attrText}`.toLowerCase();
    const hits = keywords.filter((word) => combined.includes(word));
    return hits.length >= 2;
  }

  function scoreElement(el, text) {
    const attrText = getAttrText(el);
    const combined = `${text} ${attrText}`.toLowerCase();
    let score = 0;

    const weightedKeywords = {
      cookie: 3,
      cookies: 3,
      consent: 3,
      privacy: 2,
      tracking: 2,
      analytics: 2,
      "personal data": 2,
      vendors: 2,
      partners: 2,
      preferences: 1,
      gdpr: 2,
      ccpa: 2,
      accept: 1,
      reject: 1
    };

    for (const [word, weight] of Object.entries(weightedKeywords)) {
      if (combined.includes(word)) score += weight;
    }

    const role = (el.getAttribute("role") || "").toLowerCase();
    if (role === "dialog") score += 3;
    if (role === "alertdialog") score += 2;

    if (attrText.includes("onetrust")) score += 3;
    if (attrText.includes("trustarc")) score += 3;
    if (attrText.includes("cmp")) score += 2;

    if (text.length >= 80 && text.length <= 1500) score += 2;
    if (text.length > 1500 && text.length <= 3000) score += 1;

    return score;
  }

  function getElementLabel(el) {
    const parts = [el.tagName.toLowerCase()];
    if (el.id) parts.push(`#${el.id}`);

    const className = (el.className || "").toString().trim();
    if (className) {
      const firstClass = className.split(/\s+/)[0];
      if (firstClass) parts.push(`.${firstClass}`);
    }

    return parts.join("");
  }

  function collectActionButtons(container) {
    const controls = container.querySelectorAll(
      'button, [role="button"], a, input[type="button"], input[type="submit"]'
    );

    const actionWords = [
      "accept",
      "agree",
      "allow",
      "reject",
      "decline",
      "deny",
      "manage",
      "preferences",
      "settings",
      "save",
      "continue"
    ];

    const actions = [];
    const seen = new Set();

    controls.forEach((control) => {
      if (!isVisible(control)) return;

      const label = normalizeWhitespace(
        control.innerText ||
          control.value ||
          control.getAttribute("aria-label") ||
          ""
      );

      if (!label || label.length > 80) return;

      const lower = label.toLowerCase();
      if (!actionWords.some((word) => lower.includes(word))) return;
      if (seen.has(lower)) return;

      seen.add(lower);
      actions.push(label);
    });

    return actions.slice(0, 8);
  }

  function collectRelatedLinks() {
    const policyWords = ["privacy", "cookie", "policy", "preferences", "consent"];
    const links = [];
    const seen = new Set();

    document.querySelectorAll("a[href]").forEach((link) => {
      if (!isVisible(link)) return;

      const label = normalizeWhitespace(
        link.innerText || link.getAttribute("aria-label") || ""
      );
      const href = link.href || "";
      const haystack = `${label} ${href}`.toLowerCase();

      if (!policyWords.some((word) => haystack.includes(word))) return;
      if (!href || seen.has(href)) return;

      seen.add(href);
      links.push({
        label: label || "(no link text)",
        href
      });
    });

    return links.slice(0, 8);
  }

  function dedupeMatches(matches) {
    const seen = new Set();
    const deduped = [];

    for (const match of matches) {
      const key = match.text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(match);
      if (deduped.length >= MAX_MATCHES) break;
    }

    return deduped;
  }

  function buildContext(matches, links) {
    return {
      primary: matches[0]?.text || "",
      sections: matches.map((match) => ({
        label: match.label,
        score: match.score,
        text: match.text,
        actions: match.actions
      })),
      relatedLinks: links
    };
  }

  const candidates = getCandidateElements();
  const matches = [];

  for (const el of candidates) {
    if (!isVisible(el)) continue;

    const text = normalizeWhitespace(el.innerText || "");
    if (text.length < 40 || text.length > 3000) continue;

    const attrText = getAttrText(el);
    if (!looksLikeConsentText(text, attrText)) continue;

    matches.push({
      label: getElementLabel(el),
      text,
      score: scoreElement(el, text),
      actions: collectActionButtons(el)
    });
  }

  if (matches.length === 0) {
    return {
      ok: false,
      message: "No consent text found."
    };
  }

  matches.sort((a, b) => b.score - a.score || b.text.length - a.text.length);

  const deduped = dedupeMatches(matches);
  const relatedLinks = collectRelatedLinks();
  const context = buildContext(deduped, relatedLinks);

  return {
    ok: true,
    message: `Consent context found (${deduped.length} section${deduped.length > 1 ? "s" : ""}).`,
    data: context,
    text: JSON.stringify(context, null, 2).slice(0, MAX_TEXT_LENGTH)
  };
})();