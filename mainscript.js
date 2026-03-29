const container = document.getElementById("cards");
const title = document.getElementById("title");
const summary = document.getElementById("summary");
const contentPanel = document.querySelector(".content");
const closeBtn = document.querySelector(".close-btn");

const data = [
    { site: "google.com", summary: "Collects user data for ads and personalization.", risk: "medium" },
    { site: "facebook.com", summary: "Extensive data tracking and third-party sharing.", risk: "high" },
    { site: "github.com", summary: "Standard developer platform with minimal risks.", risk: "low" }
];

function createCard(item) {
    const card = document.createElement("div");
    card.className = "card";
    card.tabIndex = 0; // Make focusable
    card.setAttribute("role", "button");
    
    card.innerHTML = `
        <div class="card-left">
            <div class="card-title">${item.site}</div>
            <div class="card-desc">${item.summary.slice(0, 60)}...</div>
        </div>
        <div class="card-risk ${item.risk}">${item.risk.toUpperCase()}</div>
    `;

    const showDetails = () => {
        title.textContent = item.site;
        summary.innerHTML = `<p><strong>Risk:</strong> ${item.risk.toUpperCase()}</p>
                             <p>${item.summary}</p>`;
        contentPanel.classList.remove("hidden");
    };

    card.onclick = showDetails;
    card.onkeypress = (e) => { if (e.key === "Enter") showDetails(); };

    container.appendChild(card);
}

data.forEach(createCard);

// Close panel
closeBtn.onclick = () => contentPanel.classList.add("hidden");
