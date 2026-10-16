// Copy and call-to-action text for sections being built out.
const pageDescriptions = {
  Inventory: {
    eyebrow: "YOUR BALANCE SHEET",
    title: "Know what you own.",
    body: "Bring your accounts, assets, and liabilities into one clear picture. Your net worth is the score that matters over time.",
    action: "Add an account",
    glyph: "▤"
  },
  "Power-Up": {
    eyebrow: "INCOME & BUDGET",
    title: "Give every shilling a job.",
    body: "Track what’s coming in, plan what’s going out, and keep your monthly budget moving toward your priorities.",
    action: "Set up your budget",
    glyph: "↗"
  },
  Quests: {
    eyebrow: "GOALS WITH MOMENTUM",
    title: "Make progress visible.",
    body: "Your active goals live here. Keep up to four quests in motion and turn steady habits into lasting wins.",
    action: "Create a quest",
    glyph: "◎"
  },
  Stats: {
    eyebrow: "YOUR FINANCIAL SIGNALS",
    title: "See the full pattern.",
    body: "Explore the trends behind your cash flow, savings rate, and net worth. Small signals can guide your next move.",
    action: "Explore your stats",
    glyph: "▥"
  },
  Achievements: {
    eyebrow: "MILESTONES EARNED",
    title: "Progress worth keeping.",
    body: "Mark the habits and milestones that move your financial life forward. Your next achievement is already taking shape.",
    action: "View achievements",
    glyph: "◇"
  }
};

// Cache shared DOM roots and local storage keys used by the app's page modules.
const navItems = [...document.querySelectorAll("[data-page]")];
const content = document.querySelector("#page-content");
const crumb = document.querySelector("#crumb-page");
const publicShell = document.querySelector("#public-shell");
const appShell = document.querySelector(".app-shell");

// Shared icons. Inline SVG is centred by the button's own grid, unlike the old text arrows (⌃ ⌄).
const chevronIcon = '<svg class="chev-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>';
const plusIcon = '<svg class="plus-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>';
const phoneQuery = window.matchMedia("(max-width: 760px)");

// Phone only: which cards on each page may collapse. Anything not listed stays open with no toggle.
// "all" means every card on that page. Desktop keeps its existing behaviour.
const phoneCollapseRules = {
  Dashboard: ["cash flow", "asset allocation", "active quests"],
  Inventory: ["assets", "liabilities", "accounts"],
  "Power-Up": ["income sources", "monthly budget", "monthly spending"],
  Quests: ["progress & pace", "active quests"],
  Stats: ["income & outflow", "budget vs. actual", "asset mix", "quest progress"],
  Achievements: [],
  Contact: [],
  Profile: [],
  Settings: "all"
};

function cardTitle(card) {
  const source = card.querySelector(":scope > .panel-heading h2, :scope > [data-card-collapse-heading] h2, :scope > h2, :scope > h3");
  if (!source) return "";
  const clone = source.cloneNode(true);
  clone.querySelectorAll(".count-badge, small, .inventory-account-count").forEach(extra => extra.remove());
  return clone.textContent.trim().replace(/\s+/g, " ").toLowerCase();
}

function cardCollapsesOnPhone(card) {
  const rule = phoneCollapseRules[crumb.textContent.trim()];
  if (rule === "all") return true;
  if (!Array.isArray(rule)) return false;
  return rule.includes(cardTitle(card));
}

function setPhoneToggleState(card, expanded) {
  card.classList.toggle("phone-expanded", expanded);
  const toggle = card.querySelector(".phone-panel-toggle");
  if (!toggle) return;
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.setAttribute("aria-label", expanded ? "Collapse section details" : "Expand section details");
  const text = toggle.querySelector(".toggle-text");
  if (text) text.textContent = expanded ? "Hide" : "Show";
}

// Give data and explanation cards their own independent expand/collapse control.
function enhanceInformationCards(root = content) {
  if (!root) return;
  const phone = phoneQuery.matches;
  root.querySelectorAll(".metric-card, .panel:not(.cx-form):not(.tax-panel):not(.phone-collapsible), .inventory-summary-card, .achievement-card, .phone-collapsible").forEach(card => {
    const allowedOnPhone = cardCollapsesOnPhone(card);
    card.dataset.phoneCollapse = allowedOnPhone ? "yes" : "no";

    if (card.matches(".phone-collapsible")) {
      if (!card.dataset.collapseInitialized) {
        setPhoneToggleState(card, !phone);
        card.dataset.collapseInitialized = "true";
      }
      return;
    }

    if (!card.dataset.cardCollapsible) {
      let heading = card.querySelector(":scope > .panel-heading, :scope > .metric-heading");
      if (!heading) {
        const label = card.querySelector(":scope > .inventory-label");
        const title = label || card.querySelector(":scope > h2, :scope > h3");
        if (!title) return;
        heading = document.createElement("div");
        heading.className = "card-collapse-heading";
        title.before(heading);
        heading.append(title);
      }
      const name = (heading.querySelector("h1, h2, h3")?.textContent || heading.textContent || "Information").trim().replace(/\s+/g, " ");
      const toggle = document.createElement("button");
      toggle.className = "card-collapse-toggle";
      toggle.type = "button";
      toggle.dataset.cardCollapseToggle = "";
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", `Collapse ${name}`);
      toggle.title = `Collapse ${name}`;
      toggle.innerHTML = chevronIcon;
      const metricSymbol = heading.querySelector(".metric-symbol");
      if (metricSymbol) metricSymbol.before(toggle);
      else heading.append(toggle);
      heading.dataset.cardCollapseHeading = "";
      card.dataset.cardCollapsible = "true";
      // Settings is long, so on a phone only its first section starts open.
      if (phone && allowedOnPhone && crumb.textContent.trim() === "Settings" && card !== root.querySelector(".settings-panel")) {
        card.classList.add("card-is-collapsed");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", `Expand ${name}`);
        toggle.title = `Expand ${name}`;
      }
    }

    // A card that may not collapse on a phone is always shown open, even if it was closed on a wider screen.
    if (phone && !allowedOnPhone && card.classList.contains("card-is-collapsed")) toggleInformationCard(card, true);

    const heading = card.querySelector(":scope > [data-card-collapse-heading], :scope > .panel-heading, :scope > .metric-heading");
    card.querySelectorAll(":scope > *").forEach(child => {
      if (child === heading) return;
      child.dataset.cardCollapsibleBody = "true";
      child.hidden = card.classList.contains("card-is-collapsed");
    });
  });
}

function toggleInformationCard(card, expanded) {
  card.classList.toggle("card-is-collapsed", !expanded);
  card.querySelectorAll(":scope > [data-card-collapsible-body]").forEach(child => { child.hidden = !expanded; });
  const toggle = card.querySelector(":scope > [data-card-collapse-heading] [data-card-collapse-toggle], :scope > .panel-heading [data-card-collapse-toggle], :scope > .metric-heading [data-card-collapse-toggle]");
  if (!toggle) return;
  const name = (toggle.getAttribute("aria-label") || "Information").replace(/^(Collapse|Expand)\s+/i, "");
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} ${name}`);
  toggle.title = `${expanded ? "Collapse" : "Expand"} ${name}`;
}
const profileStorageKey = "netraos-profile-v1";
const sessionStorageKey = "netraos-local-session-v1";
const settingsStorageKey = "netraos-settings-v1";
const securityAuditStorageKey = "netraos-security-audit-v1";
const cashflowChartCollapsedKey = "netraos-dashboard-cashflow-collapsed-v1";
const termsVersion = "2026-10-10";
let autoLockTimer = 0;
let backupPromptTimer = 0;
let autoLockNudgeTimer = 0;
let shortcutPromptTimer = 0;
let deferredInstallPrompt = null;
const shortcutPromptSessionKey = "netraos-install-shortcut-shown";
const autoLockNudgeSessionKey = "netraos-autolock-nudge-shown";
const autoLockNudgeDelayMs = 10000;
let toastTimer;
let profilePreviewUrl = "";
let landingScrollEffectsBound = false;
let landingRevealObserver = null;

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

// FAQ knowledge base shown on the landing page. Answers describe what this version actually does.
const faqCategories = [
  { id: "security", label: "System & Security", items: [
    { q: "Where is my financial data stored? Is NetraOS safe?", a: "NetraOS keeps a working copy in this browser and syncs your account data to Supabase when you are signed in and online. Database row-level security restricts account records to their owner. Keep a separate backup and protect access to your email and device.", action: { label: "Open Settings", target: "Settings" } },
    { q: "Does NetraOS link directly to my bank account or M-Pesa?", a: "No. You enter or update balances and income yourself. NetraOS never asks for online-banking passwords, API keys or M-Pesa credentials, so your real accounts stay isolated from it." },
    { q: "What is the Privacy Shield, and how do I use it?", a: "The Privacy Shield is a toggle for viewing your numbers in public. Click the eye icon in the top bar, or press <kbd>Shift</kbd> + <kbd>S</kbd>, and every currency figure is masked until you switch it off again. You can change the shortcut to <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd>, or turn it off, in Settings.", action: { label: "Open Settings", target: "Settings" } }
  ]},
  { id: "dispatch", label: "Income & Auto-Router", items: [
    { q: "How does NetraOS help me split my paycheck?", a: "Today you stay in control: record income sources and budget lines in Power-Up, then fund your quests as you go. Your PDF report adds a month-ahead view with a savings target and a suggested goal top-up. The <b>Smart Auto-Router</b> is <b>coming soon</b>. It is designed to reserve living costs first, then minimum loan payments, then extra payments on your costliest debt (the Debt Avalanche method), and finally spread what is left across your quests by priority and deadline.", action: { label: "Open Power-Up", target: "Power-Up" } },
    { q: "Can I override or adjust the Auto-Router's suggestion?", a: "Yes, by design. Nothing in NetraOS moves money for you, and the Auto-Router will only propose a split that you can adjust, uncheck or change before you apply it." },
    { q: "What happens when a quest reaches 100% completion?", a: "NetraOS marks the quest <b>Complete</b>, shows a milestone celebration, and counts it toward your Achievements. You can then point the same monthly saving at your next goal.", action: { label: "Open Quests", target: "Quests" } }
  ]},
  { id: "tax", label: "Kenya Statutory Tax", items: [
    { q: "How does NetraOS calculate Kenya take-home pay?", a: "The Take-Home Calculator in Power-Up runs gross pay through the current schedules built into the app: <b>PAYE</b> on graduated bands less the KSh 2,400 monthly personal relief, <b>NSSF</b> Tier I and II contributions, <b>SHIF</b> at 2.75% (minimum KSh 300), and the <b>Affordable Housing Levy</b> at 1.5% of gross pay. Figures are estimates for planning, so verify against official guidance.", action: { label: "Open Power-Up", target: "Power-Up" } },
    { q: "Can I switch statutory deductions on or off?", a: "Yes. In Settings you can toggle PAYE, NSSF, SHIF and the Housing Levy individually, and add personal relief, insurance relief or a custom relief. The calculator can start from gross salary or from net take-home pay.", action: { label: "Open Settings", target: "Settings" } }
  ]},
  { id: "yield", label: "Assets & Yield", items: [
    { q: "Why should I enter annual return rates (% p.a.) on my asset cards?", a: "A return rate lets each asset card on the Inventory page show its <b>net yield</b> and <b>monthly passive income</b>, so you can see what your money earns and compare it with what your loans cost.", action: { label: "Open Inventory", target: "Inventory" } },
    { q: "Does NetraOS account for Withholding Tax on investment returns?", a: "Yes. Taxable assets such as money market funds and savings are reduced by the standard 15% withholding tax deducted at source in Kenya, so you see the true net yield. Mark an asset <b>tax-free</b> (for example an infrastructure bond) and no tax is deducted." }
  ]},
  { id: "data", label: "Backup & Maintenance", items: [
    { q: "How do I transfer my NetraOS data to a new laptop or phone?", a: "Open Settings and choose <b>Download all data (JSON)</b> and save the file. On the new device open NetraOS, go to Settings and use <b>Restore a JSON backup</b> to bring everything back. A CSV export is available too, and a monthly backup reminder can be switched on.", action: { label: "Open Settings", target: "Settings" } },
    { q: "How do I completely wipe my data from the app?", a: "In Settings use <b>Factory reset · Clear all NetraOS data</b>. Confirm your account password and the deletion prompt. This removes synced NetraOS records and the local device copy, but leaves your Supabase sign-in identity. Download a backup first; deletion cannot be undone.", action: { label: "Open Settings", target: "Settings" } }
  ]}
];

function renderLandingFaq() {
  const total = faqCategories.reduce((sum, category) => sum + category.items.length, 0);
  const items = faqCategories.map(category => category.items.map((item, index) => `
        <div class="faq-item" data-faq-item data-faq-cat="${category.id}" data-faq-text="${escapeHTML((item.q + " " + item.a.replace(/<[^>]+>/g, " ") + " " + category.label).toLowerCase())}">
          <button class="faq-q" type="button" aria-expanded="false" aria-controls="faq-${category.id}-${index}">
            <span class="faq-q-tag">${category.label.toUpperCase()}</span>
            <span class="faq-q-text">${escapeHTML(item.q)}</span>
            <span class="faq-q-icon" aria-hidden="true">+</span>
          </button>
          <div class="faq-a" id="faq-${category.id}-${index}" role="region"><div class="faq-a-inner">
            <p>${item.a}</p>
            ${item.action ? `<button class="faq-shortcut" type="button" data-faq-action="${escapeHTML(item.action.target)}">${escapeHTML(item.action.label)} →</button>` : ""}
          </div></div>
        </div>`).join("")).join("");
  return `<section class="landing-faq" id="faq" aria-labelledby="landing-faq-title">
    <div class="landing-faq-intro">
      <span class="landing-faq-index">NETRAOS / FAQ</span>
      <h2 id="landing-faq-title">Answers to <br>common questions.</h2>
      <p>How NetraOS works, where your information stays, and what each tool does. Hover over a question to read the answer.</p>
      <div class="faq-count" aria-live="polite" data-faq-count>${total} answers</div>
    </div>
    <div class="faq-terminal">
      <div class="faq-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" data-faq-search placeholder="Search questions..." aria-label="Search the FAQ" autocomplete="off" spellcheck="false"></div>
      <div class="faq-tabs" role="tablist" aria-label="FAQ categories">
        <button class="faq-tab is-active" type="button" role="tab" aria-selected="true" data-faq-tab="all">All</button>
        ${faqCategories.map(category => `<button class="faq-tab" type="button" role="tab" aria-selected="false" data-faq-tab="${category.id}">${category.label}</button>`).join("")}
      </div>
      <div class="faq-list" data-faq-list>${items}
        <p class="faq-empty" data-faq-empty hidden>No matches. Try “tax”, “backup”, “privacy” or “yield”.</p>
      </div>
    </div>
  </section>`;
}

// Wire up the FAQ: live search, category tabs, hover-to-open accordion (click/tap/keyboard also work).
function setupLandingFaq() {
  const root = document.querySelector(".landing-faq");
  if (!root) return;
  const list = root.querySelector("[data-faq-list]");
  const search = root.querySelector("[data-faq-search]");
  const empty = root.querySelector("[data-faq-empty]");
  const count = root.querySelector("[data-faq-count]");
  const items = [...root.querySelectorAll("[data-faq-item]")];
  const hoverCapable = window.matchMedia("(hover: hover) and (pointer: fine)");
  let activeTab = "all";
  const timers = new WeakMap();

  function setOpen(item, open) {
    item.classList.toggle("is-open", open);
    item.querySelector(".faq-q").setAttribute("aria-expanded", String(open));
  }
  function schedule(item, open, delay) {
    window.clearTimeout(timers.get(item));
    timers.set(item, window.setTimeout(() => {
      if (open) items.forEach(other => { if (other !== item) setOpen(other, false); });
      setOpen(item, open);
    }, delay));
  }
  function applyFilter() {
    const terms = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    items.forEach(item => {
      const match = (activeTab === "all" || item.dataset.faqCat === activeTab) && terms.every(term => item.dataset.faqText.includes(term));
      item.hidden = !match;
      if (!match) setOpen(item, false);
      if (match) shown += 1;
    });
    empty.hidden = shown !== 0;
    count.textContent = `${shown} ${shown === 1 ? "answer" : "answers"}`;
  }

  applyFilter();
  items.forEach(item => {
    item.addEventListener("mouseenter", () => { if (hoverCapable.matches) schedule(item, true, 70); });
    item.addEventListener("mouseleave", () => { if (hoverCapable.matches) schedule(item, false, 140); });
    item.querySelector(".faq-q").addEventListener("click", () => {
      window.clearTimeout(timers.get(item));
      const open = !item.classList.contains("is-open");
      if (open) items.forEach(other => { if (other !== item) setOpen(other, false); });
      setOpen(item, open);
    });
  });
  search.addEventListener("input", applyFilter);
  root.querySelectorAll("[data-faq-tab]").forEach(tab => tab.addEventListener("click", () => {
    activeTab = tab.dataset.faqTab;
    root.querySelectorAll("[data-faq-tab]").forEach(other => {
      other.classList.toggle("is-active", other === tab);
      other.setAttribute("aria-selected", String(other === tab));
    });
    applyFilter();
  }));
  root.querySelectorAll("[data-faq-action]").forEach(button => button.addEventListener("click", () => {
    const target = button.dataset.faqAction;
    let signedIn = false;
    try { signedIn = localStorage.getItem(sessionStorageKey) === "active" && Boolean(getStoredProfile()); } catch { signedIn = false; }
    if (signedIn) {
      document.body.classList.remove("auth-view");
      publicShell.hidden = true;
      appShell.hidden = false;
      showPage(target);
    } else {
      showPublicPage("signup");
      showToast(`Create your free vault to open ${target}.`);
    }
  }));
}

// Add scroll reveals and show the landing page's back-to-top control when needed.
function setupLandingScrollEffects() {
  const revealItems = document.querySelectorAll(
    ".landing-hero-v2 .landing-copy-v2, .landing-hero-v2 .landing-visual, .landing-feature-strip, .landing-deep-copy, .insight-collage, .landing-faq, .landing-contact, .landing-bottom-cta"
  );
  const backToTop = document.querySelector(".landing-back-top");

  if ("IntersectionObserver" in window) {
    landingRevealObserver?.disconnect();
    landingRevealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        entry.target.classList.toggle("is-visible", entry.isIntersecting);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    revealItems.forEach(item => {
      item.classList.add("landing-reveal");
      landingRevealObserver.observe(item);
    });
  }

  if (!landingScrollEffectsBound) {
    window.addEventListener("scroll", () => {
      const button = document.querySelector(".landing-back-top");
      if (button) button.classList.toggle("is-visible", window.scrollY > 320);
    }, { passive: true });
    landingScrollEffectsBound = true;
  }

  if (backToTop) backToTop.classList.toggle("is-visible", window.scrollY > 320);
}

const initialProfile = getStoredProfile();
if (initialProfile?.username || initialProfile?.name) document.body.dataset.userName = initialProfile.username || initialProfile.name;
let dashboardMarkup = content.innerHTML;

// Keep the dashboard greeting and date current, including when the user's name changes.
function updateDashboardWelcome(date = new Date()) {
  const profile = getStoredProfile();
  const fullName = (document.body.dataset.userName || profile?.username || profile?.name || "Jordan Davis").trim();
  const firstName = fullName.split(/\s+/)[0] || "there";
  const hour = date.getHours();
  const greeting = hour >= 5 && hour < 12
    ? "Good morning,"
    : hour >= 12 && hour < 17
      ? "Good afternoon,"
      : "Good evening,";
  const dateLabel = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).toUpperCase();
  const greetingElement = document.querySelector("#welcome-greeting");
  const nameElement = document.querySelector("#welcome-name");
  const dateElement = document.querySelector("#dashboard-date");
  if (greetingElement) greetingElement.textContent = greeting;
  if (nameElement) nameElement.textContent = firstName + ".";
  if (dateElement) dateElement.textContent = dateLabel;
  dashboardMarkup = dashboardMarkup
    .replace(/(<span id="welcome-greeting">)[\s\S]*?(<\/span>)/, (_, opening, closing) => opening + escapeHTML(greeting) + closing)
    .replace(/(<em id="welcome-name">)[\s\S]*?(<\/em>)/, (_, opening, closing) => opening + escapeHTML(firstName) + "." + closing)
    .replace(/(<span id="dashboard-date">)[\s\S]*?(<\/span>)/, (_, opening, closing) => opening + escapeHTML(dateLabel) + closing);
}

updateDashboardWelcome();

const assetCategories = [
  { name: "Bank accounts", icon: "▤" },
  { name: "Mobile money", icon: "◉" },
  { name: "Cash & savings", icon: "◉" },
  { name: "Money market funds", icon: "▥" },
  { name: "SACCO deposits & shares", icon: "◈" },
  { name: "Bonds & equities", icon: "▲" },
  { name: "Investments", icon: "▥" },
  { name: "Property & vehicles", icon: "⌂" },
  { name: "Other assets", icon: "◇" }
];
const liabilityCategories = [
  { name: "Credit cards", icon: "▤" },
  { name: "Personal loans", icon: "↗" },
  { name: "Home loans", icon: "⌂" },
  { name: "Other liabilities", icon: "＋" }
];
// Liability tracking: lender kinds, rate bases, and helpers for tenure and display.
const lenderTypes = ["Bank Loan", "Mobile Loan / Fuliza", "SACCO Emergency Loan", "SACCO Development Loan", "Credit Card", "Chama Loan", "Employer / Salary Advance", "Other"];
const interestRateTypes = ["p.a. (per year)", "per month", "per day", "flat rate"];

function monthsUntil(dateValue) {
  const target = new Date(`${dateValue}T12:00:00`);
  const now = new Date();
  let months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  if (target.getDate() > now.getDate()) months += 1;
  return Math.max(0, months);
}

function addMonthsToToday(months) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return localDateValue(date);
}

function formatLoanRate(loan) {
  if (!loan || loan.interestRate === null || loan.interestRate === undefined) return "Not set";
  const rate = Number(loan.interestRate);
  const base = String(loan.rateType || "").replace(/\s*\(.*\)/, "");
  return base === "flat rate" ? `${rate}% flat` : `${rate}% ${base}`;
}

function formatLoanTenure(loan) {
  if (!loan) return "Not set";
  const months = loan.tenureMonths;
  const date = loan.payoffDate ? new Date(`${loan.payoffDate}T12:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "";
  if (months === null || months === undefined) return date || "Not set";
  const label = months === 1 ? "1 month left" : `${months} months left`;
  return date ? `${label} · ${date}` : label;
}

// Assets Engine: yield tracking, withholding tax, liquidity tiers and portfolio maths.
const WITHHOLDING_TAX = 0.15;
const compoundingFrequencies = ["Daily", "Monthly", "Quarterly", "Semi-annual", "Annually", "None (simple / dividend)"];
const liquidityTiers = ["Immediate (T+0)", "High (T+1)", "Medium (coupon / T+3 to T+7)", "Locked (90+ days / collateral)"];
const assetCategoryDefaults = {
  "Bank accounts": { compounding: "Monthly", liquidity: liquidityTiers[0] },
  "Mobile money": { compounding: "None (simple / dividend)", liquidity: liquidityTiers[0] },
  "Cash & savings": { compounding: "Monthly", liquidity: liquidityTiers[1] },
  "Money market funds": { compounding: "Daily", liquidity: liquidityTiers[1] },
  "SACCO deposits & shares": { compounding: "Annually", liquidity: liquidityTiers[3] },
  "Bonds & equities": { compounding: "Semi-annual", liquidity: liquidityTiers[2] },
  "Investments": { compounding: "Semi-annual", liquidity: liquidityTiers[2] },
  "Property & vehicles": { compounding: "None (simple / dividend)", liquidity: liquidityTiers[3] },
  "Other assets": { compounding: "None (simple / dividend)", liquidity: liquidityTiers[2] }
};

// Per-asset yield: gross rate, net of 15% withholding tax unless tax-free, and monthly income.
function getAssetYield(entry) {
  const returns = entry && entry.returns;
  if (!returns || returns.grossRate === null || returns.grossRate === undefined) return null;
  const gross = Number(returns.grossRate);
  if (!Number.isFinite(gross)) return null;
  const net = returns.taxFree ? gross : gross * (1 - WITHHOLDING_TAX);
  return { gross, net, taxFree: Boolean(returns.taxFree), monthly: Math.round(Number(entry.amount || 0) * net / 100 / 12) };
}

const budgetCategories = [
  "Housing",
  "Food & groceries",
  "Transport",
  "Airtime & bundles",
  "Mobile money fees",
  "Utilities",
  "Savings & investing",
  "Other"
];
const inventoryStorageKey = "netraos-inventory-v1";
const powerUpStorageKey = "netraos-powerup-v1";
const questStorageKey = "netraos-quests-v1";
const achievementStorageKey = "netraos-achievements-v1";
const reportPeriodStorageKey = "netraos-report-period-v1";
const currencyStorageKey = "netraos-currency-v1";
const privacyModeStorageKey = "netraos-privacy-mode-v1";
const currencyAmountPattern = /(?:KSh|USh|TSh|KES|USD|EUR|GBP|UGX|TZS|[$€£])\s*[+-]?\s*\d[\d,]*(?:\.\d+)?/i;
// Supported display currencies and the locale used to format each currency.
const displayCurrencies = {
  KES: { symbol: "KSh", locale: "en-KE", name: "Kenyan shilling" },
  USD: { symbol: "$", locale: "en-US", name: "US dollar" },
  EUR: { symbol: "€", locale: "de-DE", name: "Euro" },
  GBP: { symbol: "£", locale: "en-GB", name: "British pound" },
  UGX: { symbol: "USh", locale: "en-UG", name: "Ugandan shilling" },
  TZS: { symbol: "TSh", locale: "en-TZ", name: "Tanzanian shilling" }
};

// Resolve the selected report window and summarize income, budgets, and spending.
function getReportPeriod() {
  const saved = localStorage.getItem(reportPeriodStorageKey);
  return ["This month", "Last month", "Year to date"].includes(saved) ? saved : "This month";
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getReportMonth() {
  const today = new Date();
  const period = getReportPeriod();
  const settings = getStoredSettings();
  // A payday of 29-31 falls on the last day of shorter months.
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const anchorDay = Math.min(settings.paydayAnchorDay, daysInMonth);
  const cycleStart = new Date(today.getFullYear(), today.getMonth() - (today.getDate() < anchorDay ? 1 : 0), 1);
  if (period === "Last month") return monthKey(new Date(cycleStart.getFullYear(), cycleStart.getMonth() - 1, 1));
  return monthKey(cycleStart);
}

function spendingForReport(entries) {
  const currentMonth = getReportMonth();
  const period = getReportPeriod();
  return entries.filter(item => {
    const month = /^\d{4}-\d{2}$/.test(item.month || "") ? item.month : currentMonth;
    if (period === "Year to date") {
      const settings = getStoredSettings();
      const currentDate = new Date(`${currentMonth}-01T12:00:00`);
      let fiscalYear = currentDate.getFullYear();
      if (currentDate.getMonth() + 1 < settings.financialYearStartMonth) fiscalYear -= 1;
      const fiscalStart = `${fiscalYear}-${String(settings.financialYearStartMonth).padStart(2, "0")}`;
      return month >= fiscalStart && month <= currentMonth;
    }
    return month === getReportMonth();
  });
}

function reportMonthCount() {
  if (getReportPeriod() !== "Year to date") return 1;
  const reportDate = new Date(`${getReportMonth()}-01T12:00:00`);
  const startMonth = getStoredSettings().financialYearStartMonth;
  let startYear = reportDate.getFullYear();
  if (reportDate.getMonth() + 1 < startMonth) startYear -= 1;
  const monthDifference = (reportDate.getFullYear() - startYear) * 12 + reportDate.getMonth() - (startMonth - 1);
  return Math.max(1, monthDifference + 1);
}

function getPowerUpReportTotals() {
  const data = getPowerUpData();
  const income = data.incomes.reduce((total, item) => total + Number(item.amount || 0), 0);
  const budget = data.budgets.reduce((total, item) => total + Number(item.amount || 0), 0);
  const spending = spendingForReport(data.spending).reduce((total, item) => total + Number(item.amount || 0), 0);
  const reportMonths = reportMonthCount();
  const reportIncome = income * reportMonths;
  const reportBudget = budget * reportMonths;
  return { income, budget, spending, surplus: income - budget, reportMonths, reportIncome, reportBudget, cashAfterSpending: reportIncome - spending, budgetRemaining: reportBudget - spending };
}

// Read and save the browser-local profile and preference settings.
const ACCENT_IDS = ["emerald", "amber", "matrix", "blue", "violet", "coral", "aqua"];
function setAccent(accent) {
  const value = ACCENT_IDS.includes(accent) ? accent : "emerald";
  appShell.dataset.accent = value;
  document.documentElement.dataset.accent = value;
}

function getStoredProfile() {
  try {
    return JSON.parse(localStorage.getItem(profileStorageKey) || "null");
  } catch {
    return null;
  }
}

function saveStoredProfile(profile) {
  localStorage.setItem(profileStorageKey, JSON.stringify(profile));
}

function ordinalDay(day) {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  return `${day}${{ 1: "st", 2: "nd", 3: "rd" }[day % 10] || "th"}`;
}

function getStoredSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsStorageKey) || "{}");
    return {
      alwaysShowCents: Boolean(saved.alwaysShowCents),
      reduceMotion: Boolean(saved.reduceMotion),
      darkMode: Boolean(saved.darkMode),
      goalNotifications: saved.goalNotifications !== false,
      monthlyReminders: saved.monthlyReminders !== false,
      performanceTelemetryConsent: Boolean(saved.performanceTelemetryConsent),
      lockTimeoutMinutes: [0, 1, 5, 15].includes(Number(saved.lockTimeoutMinutes)) ? Number(saved.lockTimeoutMinutes) : 0,
      localPinSalt: typeof saved.localPinSalt === "string" ? saved.localPinSalt : "",
      localPinHash: typeof saved.localPinHash === "string" ? saved.localPinHash : "",
      localPinLength: (saved.accountPinEnabled || saved.localPinLength === 4) ? 4 : 6,
      accountPinEnabled: Boolean(saved.accountPinEnabled),
      financialYearStartMonth: Math.max(1, Math.min(12, Number(saved.financialYearStartMonth) || 1)),
      paydayAnchorDay: Number.isInteger(Number(saved.paydayAnchorDay)) && Number(saved.paydayAnchorDay) >= 1 && Number(saved.paydayAnchorDay) <= 31 ? Number(saved.paydayAnchorDay) : 1,
      autoLockPromptDismissed: Boolean(saved.autoLockPromptDismissed),
      privacyShortcut: ["Shift+S", "Alt+Shift+S", "Off"].includes(saved.privacyShortcut) ? saved.privacyShortcut : "Shift+S",
      taxPaye: saved.taxPaye !== false,
      taxNssf: saved.taxNssf !== false,
      taxShif: saved.taxShif !== false,
      taxAhl: saved.taxAhl !== false,
      personalRelief: Number.isFinite(Number(saved.personalRelief)) ? Math.max(0, Number(saved.personalRelief)) : 2400,
      insuranceRelief: Number.isFinite(Number(saved.insuranceRelief)) ? Math.max(0, Number(saved.insuranceRelief)) : 0,
      customRelief: Number.isFinite(Number(saved.customRelief)) ? Math.max(0, Number(saved.customRelief)) : 0,
      monthlyBackupPrompt: Boolean(saved.monthlyBackupPrompt),
      lastBackupPromptAt: typeof saved.lastBackupPromptAt === "string" ? saved.lastBackupPromptAt : "",
      accentProfile: ACCENT_IDS.includes(saved.accentProfile) ? saved.accentProfile : "emerald",
      showXpPoints: saved.showXpPoints !== false,
      questSounds: Boolean(saved.questSounds),
      questAnimations: saved.questAnimations !== false
    };
  } catch {
    return { alwaysShowCents: false, reduceMotion: false, darkMode: false, goalNotifications: true, monthlyReminders: true, performanceTelemetryConsent: false, lockTimeoutMinutes: 0, localPinSalt: "", localPinHash: "", localPinLength: 6, accountPinEnabled: false, financialYearStartMonth: 1, paydayAnchorDay: 1, autoLockPromptDismissed: false, privacyShortcut: "Shift+S", taxPaye: true, taxNssf: true, taxShif: true, taxAhl: true, personalRelief: 2400, insuranceRelief: 0, customRelief: 0, monthlyBackupPrompt: false, lastBackupPromptAt: "", accentProfile: "emerald", showXpPoints: true, questSounds: false, questAnimations: true };
  }
}

// Apply browser-saved preferences and keep the header and settings controls in sync.
function applyStoredSettings() {
  const settings = getStoredSettings();
  document.body.classList.toggle("reduce-motion", settings.reduceMotion);
  document.body.classList.toggle("theme-dark", settings.darkMode);
  appShell.classList.toggle("theme-dark", settings.darkMode);
  publicShell.classList.toggle("theme-dark", settings.darkMode);
  setAccent(settings.accentProfile);
  appShell.classList.toggle("hide-xp-points", !settings.showXpPoints);
  appShell.classList.toggle("disable-quest-animations", !settings.questAnimations || settings.reduceMotion);
  document.querySelectorAll("[data-theme-toggle]").forEach(themeToggle => {
    themeToggle.setAttribute("aria-pressed", String(settings.darkMode));
    themeToggle.setAttribute("aria-label", settings.darkMode ? "Enable light mode" : "Enable dark mode");
    themeToggle.title = settings.darkMode ? "Enable light mode" : "Enable dark mode";
  });
  const darkModeInput = document.querySelector('input[name="darkMode"]');
  if (darkModeInput) darkModeInput.checked = settings.darkMode;
  const privacyInput = document.querySelector('input[name="privacyShield"]');
  if (privacyInput) privacyInput.checked = document.body.classList.contains("privacy-mode");
}

// Keep a short, local-only history of security-relevant actions without recording financial values.
function getSecurityAuditLog() {
  try {
    const entries = JSON.parse(localStorage.getItem(securityAuditStorageKey) || "[]");
    return Array.isArray(entries) ? entries.filter(item => item && typeof item === "object" && typeof item.id === "string" && typeof item.name === "string" && ["asset", "liability"].includes(item.type)) : [];
  } catch {
    return [];
  }
}

function getAuditPeriodStart(period, now = new Date()) {
  const start = new Date(now);
  if (period === "24h") start.setHours(start.getHours() - 24);
  else if (period === "7d") start.setDate(start.getDate() - 7);
  else if (["1m", "6m", "12m"].includes(period)) {
    const months = { "1m": 1, "6m": 6, "12m": 12 }[period];
    const day = start.getDate();
    start.setDate(1);
    start.setMonth(start.getMonth() - months);
    start.setDate(Math.min(day, new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()));
  }
  else return null;
  return start;
}

function downloadSecurityAudit(period) {
  const labels = { "24h": "24 hours", "7d": "7 days", "1m": "1 month", "6m": "6 months", "12m": "12 months" };
  const start = getAuditPeriodStart(period);
  if (!start) return;
  const end = new Date();
  const rows = getSecurityAuditLog()
    .map(item => ({ ...item, timestamp: Date.parse(item.at) }))
    .filter(item => Number.isFinite(item.timestamp) && item.timestamp >= start.getTime() && item.timestamp <= end.getTime())
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(item => [item.action, new Date(item.timestamp).toISOString()]);
  const csvEscape = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [["Activity", "Date and time"], ...rows].map(row => row.map(csvEscape).join(",")).join("\r\n");
  saveFile(`netraos-security-activity-last-${period}.csv`, "\uFEFF" + csv, "text/csv;charset=utf-8");
  recordSecurityAudit(`Downloaded local security activity (last ${labels[period]})`);
  showToast(`${rows.length} security ${rows.length === 1 ? "activity" : "activities"} downloaded.`);
}

function recordSecurityAudit(action) {
  try {
    const entries = getSecurityAuditLog();
    const now = new Date();
    entries.unshift({ action, at: now.toISOString() });
    const retentionStart = getAuditPeriodStart("12m", now).getTime();
    const retained = entries
      .filter(item => Number.isFinite(Date.parse(item.at)) && Date.parse(item.at) >= retentionStart)
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, 2000);
    localStorage.setItem(securityAuditStorageKey, JSON.stringify(retained));
  } catch {
    // Audit history is a convenience and must never block an app action.
  }
}


// Password fields stay masked while typing; only the explicit eye control reveals them.
const PASSWORD_REVEAL_MS = 3000;
const passwordRevealTimers = new WeakMap();

function setPasswordVisible(input, visible, pinned) {
  const toggle = input.closest(".password-field")?.querySelector("[data-password-toggle]");
  input.type = visible ? "text" : "password";
  if (toggle) {
    const shown = pinned ?? toggle.getAttribute("aria-pressed") === "true";
    toggle.setAttribute("aria-pressed", String(shown));
    toggle.setAttribute("aria-label", shown ? "Hide password" : "Show password");
    toggle.title = shown ? "Hide password" : "Show password";
    toggle.classList.toggle("is-showing", visible);
  }
}

document.addEventListener("click", event => {
  const toggle = event.target.closest("[data-password-toggle]");
  if (!toggle) return;
  const input = toggle.closest(".password-field").querySelector("input");
  window.clearTimeout(passwordRevealTimers.get(input));
  const pin = toggle.getAttribute("aria-pressed") !== "true";
  setPasswordVisible(input, pin, pin);
  if (pin) {
    passwordRevealTimers.set(input, window.setTimeout(() => setPasswordVisible(input, false, false), PASSWORD_REVEAL_MS));
  }
  input.focus();
});

// Derive a salted PIN verifier; it protects the screen only and does not encrypt stored records.
async function deriveLocalPinHash(pin, saltBase64) {
  if (!globalThis.crypto?.subtle) throw new Error("Secure browser cryptography is unavailable.");
  const saltBytes = Uint8Array.from(atob(saltBase64), character => character.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations: 210000, hash: "SHA-256" }, key, 256);
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function createLocalPinVerifier(pin) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = btoa(Array.from(saltBytes, byte => String.fromCharCode(byte)).join(""));
  return { localPinSalt: salt, localPinHash: await deriveLocalPinHash(pin, salt) };
}

async function verifyLocalPin(pin, settings = getStoredSettings()) {
  if (!settings.localPinHash || !settings.localPinSalt) return false;
  const candidate = await deriveLocalPinHash(pin, settings.localPinSalt);
  let difference = candidate.length ^ settings.localPinHash.length;
  for (let index = 0; index < candidate.length; index += 1) difference |= candidate.charCodeAt(index) ^ (settings.localPinHash.charCodeAt(index) || 0);
  return difference === 0;
}

async function verifyWorkspacePin(pin, settings = getStoredSettings()) {
  const cloud = window.NetraSupabase;
  if (!cloud?.enabled || !navigator.onLine) return verifyLocalPin(pin, settings);
  let user;
  try {
    user = await cloud.getUser();
  } catch (error) {
    if (!navigator.onLine) return verifyLocalPin(pin, settings);
    throw error;
  }
  if (!user) return verifyLocalPin(pin, settings);
  const result = await cloud.verifyPin(pin);
  if (!result || result.reason === "no_pin") return verifyLocalPin(pin, settings);
  if (result.reason === "locked") {
    const error = new Error("Too many incorrect attempts. The account PIN is temporarily locked.");
    error.locked = true;
    error.lockedUntil = result.locked_until;
    throw error;
  }
  return result.ok === true;
}

async function deriveLocalPasswordHash(password, saltBase64) {
  if (!globalThis.crypto?.subtle) throw new Error("Secure browser cryptography is unavailable.");
  const saltBytes = Uint8Array.from(atob(saltBase64), character => character.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations: 210000, hash: "SHA-256" }, key, 256);
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function createLocalPasswordVerifier(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = btoa(Array.from(saltBytes, byte => String.fromCharCode(byte)).join(""));
  return { passwordSalt: salt, passwordHash: await deriveLocalPasswordHash(password, salt) };
}

async function verifyLocalPassword(password, profile) {
  if (!profile?.passwordHash || !profile.passwordSalt) return false;
  const candidate = await deriveLocalPasswordHash(password, profile.passwordSalt);
  let difference = candidate.length ^ profile.passwordHash.length;
  for (let index = 0; index < candidate.length; index += 1) difference |= candidate.charCodeAt(index) ^ (profile.passwordHash.charCodeAt(index) || 0);
  return difference === 0;
}

// Lock the visible workspace after inactivity when a local PIN and timeout are configured.
function scheduleAutoLock() {
  window.clearTimeout(autoLockTimer);
  const settings = getStoredSettings();
  if ((!settings.localPinHash && !settings.accountPinEnabled) || !settings.lockTimeoutMinutes || appShell.hidden) return;
  if (settings.accountPinEnabled && !settings.localPinHash && !navigator.onLine) return;
  try {
    if (localStorage.getItem(sessionStorageKey) !== "active") return;
  } catch {
    return;
  }
  autoLockTimer = window.setTimeout(lockWorkspace, settings.lockTimeoutMinutes * 60 * 1000);
}

function lockWorkspace() {
  if (appShell.hidden) return;
  const settings = getStoredSettings();
  if ((!settings.localPinHash && !settings.accountPinEnabled) || !settings.lockTimeoutMinutes) return;
  if (settings.accountPinEnabled && !settings.localPinHash && !navigator.onLine) return;
  appShell.hidden = true;
  publicShell.hidden = true;
  document.querySelector("#security-lock-screen")?.remove();
  const lockScreen = document.createElement("main");
  lockScreen.id = "security-lock-screen";
  lockScreen.className = "security-lock-screen";
  lockScreen.innerHTML = `<section class="security-lock-card" role="dialog" aria-modal="true" aria-labelledby="security-lock-title"><span class="section-kicker">NETRAOS · SESSION LOCK</span><h1 id="security-lock-title">Your workspace is locked.</h1><p>Enter your ${settings.localPinLength}-digit PIN to continue. This screen lock does not encrypt browser storage.</p><form><label for="security-unlock-pin">${settings.localPinLength}-digit PIN</label><input id="security-unlock-pin" name="pin" type="password" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{${settings.localPinLength}}" maxlength="${settings.localPinLength}" required><p class="security-lock-error" role="alert" hidden></p><button class="public-primary" type="submit">Unlock workspace</button></form></section>`;
  document.body.append(lockScreen);
  recordSecurityAudit("Workspace locked after inactivity");
  const form = lockScreen.querySelector("form");
  const pinInput = form.elements.pin;
  const error = lockScreen.querySelector(".security-lock-error");
  let attempts = 0;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (settings.accountPinEnabled && !settings.localPinHash && !navigator.onLine) {
      error.textContent = "Connect to the internet to verify this account PIN.";
      error.hidden = false;
      return;
    }
    if (!new RegExp(`^[0-9]{${settings.localPinLength}}$`).test(pinInput.value)) {
      error.textContent = `Enter the ${settings.localPinLength}-digit PIN.`;
      error.hidden = false;
      pinInput.focus();
      return;
    }
    try {
      if (!await verifyWorkspacePin(pinInput.value, settings)) throw new Error("PIN did not match.");
      lockScreen.remove();
      appShell.hidden = false;
      publicShell.hidden = true;
      recordSecurityAudit("Workspace unlocked");
      scheduleAutoLock();
    } catch (pinError) {
      if (pinError.locked) {
        const lockedUntil = Date.parse(pinError.lockedUntil || "");
        const waitMs = Math.max(1000, lockedUntil - Date.now() || 5 * 60 * 1000);
        error.textContent = pinError.message;
        error.hidden = false;
        form.querySelector("button").disabled = true;
        window.setTimeout(() => {
          form.querySelector("button").disabled = false;
          error.hidden = true;
          pinInput.focus();
        }, waitMs);
        return;
      }
      if (pinError.message !== "PIN did not match.") {
        error.textContent = "Unable to verify the account PIN right now. Check your connection and try again.";
        error.hidden = false;
        pinInput.value = "";
        pinInput.focus();
        return;
      }
      attempts += 1;
      pinInput.value = "";
      error.textContent = attempts >= 5 ? "Too many attempts. Wait 30 seconds before trying again." : "That PIN did not match. Try again.";
      error.hidden = false;
      if (attempts >= 5) {
        form.querySelector("button").disabled = true;
        window.setTimeout(() => {
          attempts = 0;
          form.querySelector("button").disabled = false;
          error.hidden = true;
          pinInput.focus();
        }, 30000);
      } else pinInput.focus();
    }
  });
  pinInput.focus();
}

// Restart the inactivity countdown on deliberate user input while the app is active.
["pointerdown", "keydown", "touchstart"].forEach(eventName => {
  document.addEventListener(eventName, scheduleAutoLock, { passive: eventName !== "keydown" });
});
window.addEventListener("online", scheduleAutoLock);

// Update the signed-in user's displayed name and refresh the greeting.
function setProfileName(name) {
  const cleanName = String(name || "").trim() || "Jordan Davis";
  document.body.dataset.userName = cleanName;
  updateDashboardWelcome();
}

function applyProfileAvatar() {
  const avatar = document.querySelector(".profile-button .avatar");
  if (!avatar) return;
  const profile = getStoredProfile();
  if (profile?.image) {
    avatar.innerHTML = `<img src="${escapeHTML(profile.image)}" alt="">`;
  } else {
    avatar.innerHTML = `<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20c.5-3.6 2.7-5.5 6.5-5.5s6 1.9 6.5 5.5"/></svg>`;
  }
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function compressProfileImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read that image."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("That image could not be opened."));
      image.onload = () => {
        try {
          const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("Image resizing is unavailable."));
            return;
          }
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        } catch (error) {
          reject(error);
        }
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function renderBrandMark() {
  return `<span class="public-brand-mark" aria-hidden="true"><img src="netraos-logo.svg" alt="" /></span>`;
}

// Reuse accessible social links and a year-aware copyright across the app footers.
function renderSocialLinks(className = "footer-social-links") {
  return `<nav class="${className}" aria-label="Social media"><a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="18" cy="6" r=".8" class="social-fill"/></svg></a><a href="https://www.facebook.com/" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.2 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.5 1.6-1.5h1.7V3.6c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.1H8V13h2.8v8z"/></svg></a><a href="https://x.com/" target="_blank" rel="noopener noreferrer" aria-label="X"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 3h2.8l-6.1 7 7.2 11h-5.6l-4.4-6.8L6.9 21H4l6.6-7.6L3.8 3h5.8l4 6.3zm-1 16h1.5L8.7 4.9H7.1z"/></svg></a><a href="https://www.tiktok.com/" target="_blank" rel="noopener noreferrer" aria-label="TikTok"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.6 8.2a7.4 7.4 0 0 1-4.4-1.5v8.1a6.2 6.2 0 1 1-5.4-6.1v3.2a3.1 3.1 0 1 0 2.2 3V2.8h3.2c.2 2.2 1.7 4 4.4 4.3z"/></svg></a></nav>`;
}

function renderAppFooter() {
  return `<footer class="page-footer"><span>NETRAOS <i>·</i> YOUR FINANCIAL OPERATING SYSTEM</span><span>Private by design <i>✳</i></span>${renderSocialLinks()}<small>© ${new Date().getFullYear()} NetraOS. All rights reserved.</small></footer>`;
}

// Explain the current local prototype's terms and data handling in plain language.
function renderLegalPage(page) {
  const isTerms = page === "terms";
  const title = isTerms ? "Terms of Service" : "Privacy Policy";
  const content = isTerms ? `
    <h2>Using NetraOS</h2><p>NetraOS is a personal finance organization tool. It is not a bank, lender, tax agent, investment adviser, or provider of financial, legal, or tax advice. You are responsible for decisions made using the app.</p>
    <h2>Estimates and financial information</h2><p>Calculators and projections are estimates for planning only. Tax, PAYE, NSSF, SHIF and other statutory figures may change and may not reflect your circumstances. Verify current requirements with the relevant official authority or a qualified professional before acting.</p>
    <h2>Your records and account</h2><p>You retain ownership of the financial information you enter. NetraOS keeps a browser copy for local-first use and syncs account records with Supabase when you are signed in and online. Supabase stores the account database in the project region selected by its owner. Keep backups and protect access to your email and devices.</p>
    <h2>Acceptable use</h2><p>Do not use the app to disrupt or compromise it, automate scraping, reverse engineer it, or access another person's data without permission.</p>
    <h2>Availability</h2><p>This app is provided as-is and may change. Account sign-in and sync depend on the connected Supabase project and an internet connection. Local copies remain available on devices where you have already signed in.</p>` : `
    <h2>Information stored</h2><p>NetraOS stores your profile, financial records, preferences, consent choices, and limited security activity in the browser and in your Supabase account. Authentication passwords and sessions are managed by Supabase Auth. The app does not currently collect performance telemetry. Browser copies are used for local-first operation; clearing browser data removes that device copy, while account data remains until deleted from the account.</p>
    <h2>Storage and security limits</h2><p>Browser storage is not encrypted by this app. A person with access to this browser profile may be able to read its contents. The optional PIN locks the visible workspace only; it does not encrypt records. HTTPS and security headers depend on the website host and are not configured by this app's source.</p>
    <h2>Sharing and third parties</h2><p>NetraOS does not sell or rent your financial records or use ad networks for them. When signed in and online, records are sent to the Supabase project connected to this app for account storage and synchronization. Supabase processes that data under the project owner's configuration and selected region. This version collects no performance telemetry. If you open email, telephone, or WhatsApp links, those services handle information you share with them. Google Fonts may be loaded by the page and can receive a request from your browser.</p>
    <h2>Your choices</h2><p>You can review and export your records in Settings, correct profile and financial details, or use Factory reset to delete the synced NetraOS database records and clear this device's app data. Factory reset does not delete the Supabase Auth identity. Clearing browser site data removes only the local device copy, not account records or exported backups.</p>
    <h2>Contact</h2><p>For privacy questions, contact <a href="mailto:support@netraos.io">support@netraos.io</a>.</p>`;
  return `<main class="legal-page"><header class="public-header"><a class="public-brand" href="#home" data-public-action="landing" aria-label="NetraOS home">${renderBrandMark()}<span><strong>NETRA<span>OS</span></strong><small>YOUR FINANCIAL OPERATING SYSTEM</small></span></a><button class="auth-back" type="button" data-public-action="landing">← Back to NetraOS</button></header><article class="legal-card"><div class="section-kicker">NETRAOS · ${isTerms ? "TERMS" : "PRIVACY"}</div><h1>${title}.</h1><p class="legal-updated">Last updated October 15, 2026</p>${content}<a class="public-primary legal-back" href="#signup" data-public-action="signup">Continue to signup <span>↗</span></a></article><footer class="public-footer"><span>NETRAOS · YOUR FINANCIAL OPERATING SYSTEM</span><a href="#privacy" data-public-action="privacy">Privacy</a>${renderSocialLinks("footer-social-links public-social-links")}<small>© ${new Date().getFullYear()} NetraOS. All rights reserved.</small></footer></main>`;
}

const phoneIntroStorageKey = "netraos-phone-intro-seen-v1";


function showPhoneSplash() {
  if (!publicShell || !appShell) return;
  appShell.hidden = true;
  publicShell.hidden = false;
  document.body.classList.remove("public-view");
  document.body.classList.add("auth-view", "phone-entry-view");
  window.location.hash = "launch";
  publicShell.innerHTML = '<main class="phone-splash" data-phone-splash aria-label="Loading NetraOS"><div class="phone-splash-brand"><span class="phone-splash-mark">' + renderBrandMark() + '</span><span class="phone-splash-name">NETRA<span>OS</span></span></div></main>';
  const splash = publicShell.querySelector("[data-phone-splash]");
  window.setTimeout(() => splash?.classList.add("is-loading"), 3000);
  window.setTimeout(() => {
    if (!phoneNavQuery.matches) { showPublicPage("landing"); return; }
    let introSeen = false;
    try { introSeen = localStorage.getItem(phoneIntroStorageKey) === "true"; } catch { /* Treat unavailable storage as a first visit. */ }
    if (introSeen) showPhoneWelcome();
    else showPhoneIntro();
  }, 3850);
}

function showPhoneWelcome() {
  if (!publicShell || !appShell) return;
  appShell.hidden = true;
  publicShell.hidden = false;
  document.body.classList.remove("public-view");
  document.body.classList.add("auth-view", "phone-entry-view");
  window.location.hash = "welcome";
  publicShell.innerHTML = '<main class="phone-entry phone-entry-welcome">' + renderFluidArt() + '<section class="phone-welcome-copy"><span class="phone-entry-kicker">YOUR FINANCIAL OPERATING SYSTEM</span><h1>See your money<br><em>with more clarity.</em></h1><p>Bring your balances, monthly plan, and goals together in one private workspace.</p></section><div class="phone-entry-actions"><button class="public-primary" type="button" data-public-action="signup">Create an account</button><button class="phone-entry-secondary" type="button" data-public-action="login">Sign in</button><button class="phone-entry-tour" type="button" data-phone-replay-intro>Take a quick tour</button></div><p class="phone-entry-note">Your account syncs when you’re online. Download a backup any time.</p></main>';
  publicShell.querySelector("[data-phone-replay-intro]")?.addEventListener("click", showPhoneIntro);
}

function showPhoneIntro() {
  if (!publicShell || !appShell) return;
  const slides = [
    { icon: "◉", label: "GET A CLEAR PICTURE", title: "Your money, in one view.", copy: "Track cash, bank and M-Pesa balances alongside what you owe. NetraOS brings the pieces together so you can understand your overall position." },
    { icon: "↗", label: "MAKE A PLAN", title: "Give your month a direction.", copy: "Record income, set spending plans and build savings goals. Simple projections help you see how steady contributions can grow over time." },
    { icon: "✦", label: "KEEP MOVING", title: "Progress, at your pace.", copy: "Turn goals into quests, follow milestones and review your progress. Mask amounts when you need privacy, and keep a downloadable backup of your data." }
  ];
  appShell.hidden = true;
  publicShell.hidden = false;
  document.body.classList.remove("public-view");
  document.body.classList.add("auth-view", "phone-entry-view");
  window.location.hash = "intro";
  const cards = slides.map((slide, index) => '<article class="phone-intro-card" data-intro-card aria-label="Card ' + (index + 1) + ' of ' + slides.length + '" ' + (index ? 'hidden' : '') + '><span class="phone-intro-icon" aria-hidden="true">' + slide.icon + '</span><span class="phone-entry-kicker">' + slide.label + '</span><h1>' + slide.title + '</h1><p>' + slide.copy + '</p></article>').join("");
  const dots = slides.map((slide, index) => '<span class="phone-intro-dot' + (index ? '' : ' is-active') + '" data-intro-dot aria-hidden="true"></span>').join("");
  publicShell.innerHTML = '<main class="phone-entry phone-entry-intro"><header class="phone-intro-header"><span class="phone-intro-header-label">A QUICK TOUR</span><button class="phone-intro-skip" type="button" data-intro-skip>Skip</button></header><div class="phone-intro-progress"><span data-intro-progress></span></div><section class="phone-intro-stage" data-intro-track aria-live="polite">' + cards + '</section><footer class="phone-intro-footer"><span class="phone-intro-count" data-intro-count>1 / ' + slides.length + '</span><div class="phone-intro-dots" aria-hidden="true">' + dots + '</div><button class="phone-intro-next" type="button" data-intro-next>Next <span>→</span></button></footer></main>';
  const cardNodes = [...publicShell.querySelectorAll("[data-intro-card]")];
  const dotNodes = [...publicShell.querySelectorAll("[data-intro-dot]")];
  const next = publicShell.querySelector("[data-intro-next]");
  const count = publicShell.querySelector("[data-intro-count]");
  const progress = publicShell.querySelector("[data-intro-progress]");
  let active = 0;
  const finish = () => {
    try { localStorage.setItem(phoneIntroStorageKey, "true"); } catch { /* Continue even when browser storage is unavailable. */ }
    showPhoneWelcome();
  };
  let moving = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragX = 0;
  let dragCard = null;
  let dragPointerId = null;
  const render = () => {
    cardNodes.forEach((card, index) => {
      card.hidden = index < active || index > active + 1;
      card.classList.remove("is-top", "is-next", "is-dragging", "is-out-left", "is-out-right");
      card.style.removeProperty("transform");
      card.style.removeProperty("opacity");
      card.setAttribute("aria-hidden", index === active ? "false" : "true");
      if (index === active) card.classList.add("is-top");
      else if (index === active + 1) card.classList.add("is-next");
    });
    dotNodes.forEach((dot, index) => dot.classList.toggle("is-active", index === active));
    count.textContent = (active + 1) + " / " + slides.length;
    progress.style.width = ((active + 1) / slides.length * 100) + "%";
    next.innerHTML = active === slides.length - 1 ? 'Get started' : 'Next <span>→</span>';
  };
  const advance = (direction = 1) => {
    if (moving) return;
    if (active >= slides.length - 1) { finish(); return; }
    moving = true;
    const card = cardNodes[active];
    card.classList.add(direction < 0 ? "is-out-left" : "is-out-right");
    window.setTimeout(() => { active += 1; moving = false; render(); }, 260);
  };
  next.addEventListener("click", advance);
  publicShell.querySelector("[data-intro-skip]").addEventListener("click", finish);
  const track = publicShell.querySelector("[data-intro-track]");
  track.addEventListener("pointerdown", event => {
    if (moving || event.button > 0) return;
    const card = cardNodes[active];
    if (!card || !card.contains(event.target)) return;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragX = 0;
    dragCard = card;
    dragPointerId = event.pointerId;
    card.classList.add("is-dragging");
    card.setPointerCapture?.(event.pointerId);
  });
  track.addEventListener("pointermove", event => {
    if (!dragCard || event.pointerId !== dragPointerId) return;
    const dx = event.clientX - dragStartX;
    const dy = event.clientY - dragStartY;
    if (Math.abs(dy) > Math.abs(dx) * 1.2 && Math.abs(dy) > 10) {
      dragCard.classList.remove("is-dragging");
      dragCard = null;
      dragPointerId = null;
      return;
    }
    dragX = dx;
    const rotation = Math.max(-16, Math.min(16, dx * 0.055));
    dragCard.style.transform = `translate3d(${dx}px, ${dy * 0.12}px, 0) rotate(${rotation}deg)`;
    dragCard.style.opacity = String(Math.max(0.55, 1 - Math.abs(dx) / 700));
  });
  const endDrag = (event, canceled = false) => {
    if (!dragCard || (event && event.pointerId !== dragPointerId)) return;
    const card = dragCard;
    const distance = dragX;
    dragCard = null;
    dragPointerId = null;
    const threshold = Math.max(64, track.clientWidth * 0.2);
    if (!canceled && Math.abs(distance) >= threshold) {
      moving = true;
      card.classList.remove("is-dragging");
      card.classList.add(distance < 0 ? "is-out-left" : "is-out-right");
      card.style.removeProperty("transform");
      card.style.removeProperty("opacity");
      window.setTimeout(() => {
        if (active < slides.length - 1) { active += 1; moving = false; render(); }
        else finish();
      }, 260);
    } else {
      card.classList.remove("is-dragging");
      card.style.removeProperty("transform");
      card.style.removeProperty("opacity");
    }
  };
  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", event => endDrag(event, true));
  track.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); advance(event.key === "ArrowLeft" ? -1 : 1); }
  });
  render();
}

// Render public landing/auth pages and their responsive feature content.
// Shared fluid hero artwork used by the sign-in / sign-up cards and the phone welcome screen.
function renderFluidArt() {
  return `<div class="auth-fluid-art" aria-hidden="true">
          <span class="fluid-shape fluid-shape-a"></span><span class="fluid-shape fluid-shape-b"></span><span class="fluid-shape fluid-shape-c"></span><span class="fluid-shape fluid-shape-d"></span><span class="fluid-shape fluid-shape-e"></span><span class="fluid-shape fluid-shape-f"></span><span class="fluid-shape fluid-shape-g"></span>
          <svg class="auth-network-lines" viewBox="0 0 1200 560" preserveAspectRatio="xMidYMin slice"><path d="M105 288 238 187 348 254 492 119 622 203 760 121 875 210 1036 126M238 187l-24 157 134-90 144 146 130-197 138 173 115-166 161 176M348 254l-34 175 178-29 134 113 130-140 138 63 142-82"/><path class="network-wire" d="m492 119 38-65 85 12 7 137M875 210l35 140 126 0 36 103M214 344l-68 52 19 77 149-44"/><circle cx="105" cy="288" r="5"/><circle cx="238" cy="187" r="6"/><circle cx="348" cy="254" r="4"/><circle cx="492" cy="119" r="5"/><circle cx="622" cy="203" r="4"/><circle cx="760" cy="121" r="6"/><circle cx="875" cy="210" r="5"/><circle cx="1036" cy="126" r="4"/><circle cx="622" cy="429" r="5"/><circle cx="910" cy="350" r="4"/><circle cx="1061" cy="350" r="5"/><circle cx="165" cy="473" r="4"/><path class="network-hex" d="m530 44 21 12v24l-21 12-21-12V56zM1060 332l16 9v19l-16 9-16-9v-19zM163 456l18 10v20l-18 10-18-10v-20z"/></svg>
          <i class="fluid-speck speck-one"></i><i class="fluid-speck speck-two"></i><i class="fluid-speck speck-three"></i><i class="fluid-speck speck-four"></i>
        </div>`;
}

function showPublicPage(page = "landing") {
  if (page === "landing" && window.matchMedia("(max-width: 880px)").matches) {
    showPhoneWelcome();
    return;
  }

  if (!publicShell || !appShell) return;
  appShell.hidden = true;
  publicShell.hidden = false;
  document.body.classList.remove("phone-entry-view");
  document.body.classList.toggle("public-view", page === "landing");
  document.body.classList.toggle("auth-view", page !== "landing");
  window.location.hash = page === "landing" ? "home" : page;
  if (page === "landing") {
    publicShell.innerHTML = `
      <div class="public-page">
        <header class="public-header landing-header">
          <a class="public-brand" href="#home" data-public-action="landing" aria-label="NetraOS home">${renderBrandMark()}<span><strong>NETRA<span>OS</span></strong><small>YOUR FINANCIAL OPERATING SYSTEM</small></span></a>
          <nav class="public-nav" aria-label="Public navigation"><div class="landing-nav-links"><a class="landing-nav-current" href="#home">Home</a><a href="#features">Features</a><a href="#about">About</a><a href="#faq">FAQ</a><a href="#contact">Contact</a></div><button class="icon-button theme-toggle public-theme-toggle landing-theme-toggle" type="button" data-theme-toggle aria-pressed="false" aria-label="Enable dark mode" title="Enable dark mode"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g class="theme-moon"><path d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6a8.6 8.6 0 1 0 11.6 11.6Z" /></g><g class="theme-sun"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></g></svg></button><button type="button" data-public-action="login">Log in</button><button class="public-nav-cta" type="button" data-public-action="signup">Open NetraOS <span>↗</span></button></nav>
        </header>
        <main>
          <section class="landing-hero landing-hero-v2">
            <div class="landing-copy landing-copy-v2">
              <div class="landing-eyebrow landing-manifesto" aria-label="Income. Spending. Goals. In one view."><span>Income</span><b>·</b><span>Spending</span><b>·</b><span>Goals</span><strong>In one view</strong></div>
              <h1>See your money<br>with <em>new clarity.</em></h1>
              <p>NetraOS turns scattered balances and plans into one clear picture—so your next financial move feels easier to make.</p>
              <div class="landing-actions"><button class="public-primary" type="button" data-public-action="signup">Get started <span>↗</span></button><a class="landing-text-link" href="#features">Explore the system <span>↓</span></a></div>
              <div class="landing-assurance landing-assurance-v2"><span>✳</span><div><strong>Private by design</strong><small>Your data is protected by account-level database access rules.</small></div></div>
            </div>
            <div class="landing-visual" aria-label="Illustrative NetraOS dashboard preview">
              <div class="landing-orbit orbit-one"></div><div class="landing-orbit orbit-two"></div>
              <div class="dashboard-mockup">
                <div class="mockup-topbar"><span class="mockup-brand">${renderBrandMark()}<b>NETRA<span>OS</span></b></span><span class="mockup-pill"><i></i> LIVE OVERVIEW</span><span class="mockup-avatar">J</span></div>
                <div class="mockup-greeting"><div><small>THURSDAY, OCTOBER 8</small><h2>Good morning, Jordan.</h2><p>Your financial overview is ready.</p></div><span class="mockup-period">This month⌄</span></div>
                <div class="mockup-metrics"><article class="mockup-networth"><small>NET WORTH</small><strong>KSh 0</strong><span>Assets minus liabilities</span><svg viewBox="0 0 180 38" aria-hidden="true"><path d="M0 29 C18 26 18 15 36 18 S56 31 74 19 98 12 113 18 137 27 152 14 168 12 180 5" fill="none" stroke="#14835e" stroke-width="2.5"/></svg></article><article><small>MONTHLY INCOME</small><strong>KSh 0</strong><span>Ready for your first entry</span><i class="mockup-icon income">↙</i></article><article><small>MONTHLY SPENDING</small><strong>KSh 0</strong><span>Track your outflow</span><i class="mockup-icon spending">↗</i></article></div>
                <div class="mockup-lower"><article class="mockup-cashflow"><div class="mockup-section-title"><span><b>Cash flow</b><small>Income &amp; spending</small></span><small>KSh</small></div><div class="mockup-chart"><div class="mockup-chart-grid"><i></i><i></i><i></i></div><span><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></div><div class="mockup-months"><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span></div></article><article class="mockup-quest"><div class="mockup-section-title"><span><b>Active quest</b><small>Your next milestone</small></span><span class="mockup-quest-glyph">◈</span></div><strong>Emergency fund</strong><div class="mockup-quest-track"><i></i></div><small>Start with a goal that matters to you.</small></article></div>
                <div class="mockup-caption">Illustrative preview of your financial command center</div>
              </div>
              <div class="floating-note floating-note-top"><span>◉</span><div><small>YOUR POSITION</small><strong>One clear view</strong></div></div>
              <div class="floating-note floating-note-bottom"><span>↗</span><div><small>YOUR NEXT MOVE</small><strong>Progress, at your pace</strong></div></div>
            </div>
          </section>
          <section class="landing-feature-strip" id="features" aria-label="NetraOS features"><article><span>◉</span><div><strong>Balance sheet</strong><small>Assets, debts, cash, and net worth</small></div></article><article><span>▣</span><div><strong>Mobile money</strong><small>Track M-Pesa alongside your assets</small></div></article><article><span>⇄</span><div><strong>Multi-currency</strong><small>Switch currencies with manual rates</small></div></article><article><span>↗</span><div><strong>Monthly plan</strong><small>Income, budgets, and spending</small></div></article><article><span>％</span><div><strong>Kenya tax calculator</strong><small>Estimate take-home pay</small></div></article><article><span>◎</span><div><strong>Quests & milestones</strong><small>Follow goals and celebrate progress</small></div></article><article><span>◈</span><div><strong>Privacy & exports</strong><small>Mask amounts and download polished PDFs</small></div></article></section>
          <section class="landing-deep-dive" id="about"><div class="landing-deep-copy"><div class="landing-eyebrow"><i></i> A BETTER VIEW, STEP BY STEP</div><h2>From the big picture<br>to your next move.</h2><p>Bring your financial basics together, then build from there. NetraOS keeps the essentials close without making money management feel like another job.</p><ul><li><i>✓</i> See bank, cash, and M-Pesa balances together</li><li><i>✓</i> Switch display currency using rates you manage</li><li><i>✓</i> Project compounding savings month by month</li><li><i>✓</i> Keep amounts private and export a polished PDF</li></ul><button class="public-primary" type="button" data-public-action="signup">Build your financial picture <span>↗</span></button></div><div class="insight-collage"><article class="insight-card insight-progress"><div class="insight-card-head"><span><small>QUEST PROGRESS</small><strong>Emergency fund</strong></span><i>◈</i></div><div class="insight-progress-line"><span></span></div><div class="insight-card-foot"><small>One goal at a time</small><strong>0%</strong></div></article><article class="insight-card insight-rate"><small>SAVINGS RATE</small><strong>0<span>%</span></strong><div class="insight-sparkline"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><small>Calculated from your monthly plan</small></article><article class="insight-card insight-budget"><i>▤</i><small>MONTHLY BUDGET</small><strong>KSh 0</strong><span>Set your first budget line</span></article><article class="insight-card insight-note"><span>✳</span><p>Your plan should work for your life—not the other way around.</p></article></div></section>
          ${renderLandingFaq()}
          <section class="landing-contact" id="contact" aria-labelledby="landing-contact-title">
            <div class="landing-contact-intro">
              <span class="landing-faq-index">NETRAOS / CONTACT</span>
              <h2 id="landing-contact-title">Talk to a<br>real person.</h2>
              <p>Questions about NetraOS, partnerships or press? Reach us through any channel below.</p>
            </div>
            <div class="landing-contact-grid">
              <article class="landing-contact-card"><span class="landing-contact-icon" aria-hidden="true">⌖</span><div><small>ADDRESS</small><address><strong>NetraOS Technologies Lab</strong>The Mirage Towers, 8th Floor, Tower 2<br>Chiromo Road, Westlands<br>Nairobi, Kenya</address></div></article>
              <a class="landing-contact-card" href="tel:+254700000988"><span class="landing-contact-icon" aria-hidden="true">☎</span><div><small>CALL</small><strong>+254 (0) 700 000 988</strong><em>Primary Operations Desk</em></div></a>
              <a class="landing-contact-card" href="https://wa.me/254799000988" target="_blank" rel="noopener"><span class="landing-contact-icon" aria-hidden="true">✉</span><div><small>WHATSAPP</small><strong>+254 (0) 799 000 988</strong><em>WhatsApp only</em></div></a>
              <article class="landing-contact-card"><span class="landing-contact-icon" aria-hidden="true">@</span><div><small>EMAIL</small><a href="mailto:support@netraos.io"><strong>support@netraos.io</strong></a><em>Support</em><a href="mailto:press@netraos.io"><strong>press@netraos.io</strong></a><em>Press</em></div></article>
            </div>
          </section>
          <section class="landing-bottom-cta"><div><small>START WHERE YOU ARE</small><h2>Make your next money move with clarity.</h2></div><button class="public-primary" type="button" data-public-action="signup">Open NetraOS <span>↗</span></button></section>
        </main>
        <button class="landing-back-top" type="button" aria-label="Back to top" title="Back to top">↑</button>
        <footer class="public-footer"><span>NETRAOS · YOUR FINANCIAL OPERATING SYSTEM</span><span>Kenyan shillings · KSh</span><nav aria-label="Legal"><a href="#terms" data-public-action="terms">Terms</a><a href="#privacy" data-public-action="privacy">Privacy</a></nav>${renderSocialLinks("footer-social-links public-social-links")}<small>© ${new Date().getFullYear()} NetraOS. All rights reserved.</small></footer>
      </div>`;
    setupLandingScrollEffects();
    setupLandingFaq();
  } else if (page === "terms" || page === "privacy") {
    publicShell.innerHTML = renderLegalPage(page);
  } else {
    const isSignup = page === "signup";
    publicShell.innerHTML = `
      <div class="auth-page">
        ${renderFluidArt()}
        <button class="auth-back" type="button" data-public-action="landing">← Back to NetraOS</button>
        <section class="auth-card">
          <div class="auth-content">
          <div class="section-kicker">${isSignup ? "START WITH A CLEAR PICTURE" : "WELCOME BACK"}</div>
          <h1>${isSignup ? "Create your account." : "Log in to NetraOS."}</h1>
          <p class="auth-description">${isSignup ? "Create your account and start organizing your finances." : "Continue to your financial command center."}</p>
          <form class="auth-form" data-auth-form="${isSignup ? "signup" : "login"}" novalidate>
            ${isSignup ? `<label class="inventory-form-field"><span>Full name</span><input name="name" type="text" autocomplete="name" maxlength="80" placeholder="Your full name" required></label>` : ""}
            <label class="inventory-form-field"><span>Email address</span><input name="email" type="email" autocomplete="email" maxlength="120" placeholder="you@example.com" required></label>
            <div class="inventory-form-field"><span>Password</span><span class="password-field"><input name="password" aria-label="Password" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" minlength="8" placeholder="At least 8 characters" required><button class="password-toggle" type="button" data-password-toggle aria-pressed="false" aria-label="Show password" title="Show password"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="eye-open" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle class="eye-open" cx="12" cy="12" r="3"/><path class="eye-off" d="M3 3l18 18M10.6 6.2A9.7 9.7 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.5 7.6C3.9 9.3 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1"/></svg></button></span></div>
            ${isSignup ? `<label class="terms-consent"><input name="acceptTerms" type="checkbox" required><span>I agree to the <a href="#terms" target="_blank" rel="noopener">Terms of Service</a> and acknowledge the <a href="#privacy" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>` : ""}
            ${isSignup ? "" : '<button class="auth-reset-password" type="button" data-password-reset>Forgot your password?</button>'}
            <div class="auth-error" role="status" aria-live="polite" hidden></div>
            <button class="public-primary auth-submit" type="submit">${isSignup ? "Create account" : "Log in"}${isSignup ? "" : " <span>↗</span>"}</button>
          </form>
          <p class="auth-switch">${isSignup ? "Already have an account?" : "New to NetraOS?"} <button type="button" data-public-action="${isSignup ? "login" : "signup"}">${isSignup ? "Log in" : "Create an account"}</button></p>
          <p class="auth-preview-note">Your email and password protect sign-in. Confirmation and password-reset links arrive by email, and records sync when you’re online.</p>
          </div>
        </section>
      </div>`;
  }
  applyStoredSettings();
}

function showPasswordResetForm() {
  if (document.querySelector("dialog[data-password-reset-dialog]")) return;
  const dialog = document.createElement("dialog");
  dialog.className = "inventory-dialog";
  dialog.dataset.passwordResetDialog = "";
  dialog.innerHTML = `<form class="inventory-form" novalidate><header class="inventory-dialog-heading"><div><span class="section-kicker">ACCOUNT SECURITY</span><h2>Choose a new password</h2></div></header><div class="inventory-form-fields"><p class="reset-copy">Your reset link is verified. A new password with at least 8 characters is needed.</p><label class="inventory-form-field"><span>New password</span><input name="password" type="password" minlength="8" autocomplete="new-password" required></label><p class="reset-status" role="status" aria-live="polite"></p></div><footer class="inventory-dialog-actions"><button class="inventory-submit" type="submit">Save password</button></footer></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector("form");
  const status = dialog.querySelector(".reset-status");
  dialog.addEventListener("cancel", event => event.preventDefault());
  dialog.addEventListener("submit", async event => {
    event.preventDefault();
    const password = String(form.elements.password.value || "");
    if (password.length < 8) { status.textContent = "A password with at least 8 characters is needed."; status.classList.add("error"); return; }
    const result = await window.NetraSupabase.updatePassword(password);
    if (result.error) { status.textContent = friendlyAuthMessage(result.error, "We couldn’t update your password just now. Please try again."); status.classList.add("error"); return; }
    await window.NetraSupabase.signOut();
    dialog.close();
    showPublicPage("login");
    showToast("Your password has been updated. You can sign in with it now.");
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  form.elements.password.focus();
}

// Build profile and settings screens from the current browser-local preferences.
function renderProfilePage() {
  const profile = getStoredProfile() || { name: document.body.dataset.userName || "Jordan Davis", email: "" };
  const username = String(profile.username || profile.name.split(/\s+/)[0] || "");
  const initials = profile.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  const photo = profile.image
    ? `<img src="${escapeHTML(profile.image)}" alt="Profile photo">`
    : `<span>${escapeHTML(initials)}</span>`;
  const maxDate = localDateValue();
  return `
    <section class="account-page">
      <header class="inventory-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> YOUR ACCOUNT</div><h1>Your profile.</h1><p class="welcome-sub">Choose the name NetraOS should use to address you and manage your profile details.</p></div></header>
      <section class="panel account-panel">
        <div class="profile-summary"><span class="profile-initials profile-photo-preview">${photo}</span><div><strong>${escapeHTML(profile.username || profile.name)}</strong><small>${escapeHTML(profile.name)} · ${escapeHTML(profile.email || "No email added")}</small></div></div>
        <form class="account-form" data-account-form="profile">
          <div class="inventory-form-field profile-photo-field"><label for="profile-photo-input"><span>Profile image <small>Optional · PNG, JPEG, or WebP up to 5 MB</small></span></label><input id="profile-photo-input" name="photo" type="file" accept="image/png,image/jpeg,image/webp"><button class="profile-photo-remove" type="button" data-remove-profile-image>Remove image</button></div>
          <label class="inventory-form-field"><span>Full name</span><input name="name" type="text" maxlength="80" value="${escapeHTML(profile.name)}" required></label>
          <label class="inventory-form-field"><span>Preferred name</span><input name="username" type="text" autocomplete="nickname" maxlength="40" value="${escapeHTML(username)}" required><small>Shown in greetings</small></label>
          <label class="inventory-form-field"><span>Email address</span><input name="email" type="email" maxlength="120" value="${escapeHTML(profile.email || "")}" required></label>
          <label class="inventory-form-field"><span>Sex <small>Optional</small></span><select name="sex"><option value="">Prefer not to say</option><option value="female" ${profile.sex === "female" ? "selected" : ""}>Female</option><option value="male" ${profile.sex === "male" ? "selected" : ""}>Male</option><option value="intersex" ${profile.sex === "intersex" ? "selected" : ""}>Intersex</option><option value="other" ${profile.sex === "other" ? "selected" : ""}>Other</option></select></label>
          <label class="inventory-form-field"><span>Date of birth <small>Optional</small></span><input name="dateOfBirth" type="date" max="${maxDate}" value="${escapeHTML(profile.dateOfBirth || "")}"></label>
          <div class="account-form-actions settings-actions"><span>Saved on this device; syncs when online</span><button class="inventory-submit" type="submit">Save changes</button></div>
        </form>
      </section>
      <section class="account-notice"><span>i</span><p>Your profile is synced to your Supabase account when you’re online. The app also keeps a working copy in this browser.</p></section>
    </section>
    ${renderAppFooter()}`;
}

function renderSettingsPage() {
  const settings = getStoredSettings();
  const currencyState = getCurrencyState();
  const fiscalMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const recentAudit = getSecurityAuditLog()
    .map(item => ({ ...item, timestamp: Date.parse(item.at) }))
    .filter(item => Number.isFinite(item.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 3);
  let privacyEnabled = false;
  try { privacyEnabled = localStorage.getItem(privacyModeStorageKey) === "true"; } catch { /* Use the visible default when storage is unavailable. */ }
  return `
    <section class="account-page">
      <header class="inventory-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> APP PREFERENCES</div><h1>Make it yours.</h1><p class="welcome-sub">Choose how NetraOS behaves across your signed-in devices.</p></div></header>
      <form class="settings-form" data-account-form="settings">
        <section class="panel settings-panel"><div class="panel-heading"><div><div class="section-kicker">GENERAL &amp; LOCALIZATION</div><h2>Regional preferences</h2></div></div>
          <label class="settings-field"><span><strong>Default display currency</strong><small>Set a manual KSh exchange rate before selecting another currency.</small></span>${settingsDropdown("displayCurrency", currencyState.active, `${displayCurrencies[currencyState.active].symbol} · ${displayCurrencies[currencyState.active].name}`, "Choose display currency")}</label>
          <div class="settings-inline-actions"><button class="secondary-button" type="button" data-settings-action="manage-rates">Manage manual exchange rates</button></div>
          <label class="settings-field"><span><strong>Financial year starts</strong><small>Used to calculate Year to date reports.</small></span>${settingsDropdown("financialYearStartMonth", String(settings.financialYearStartMonth), fiscalMonths[settings.financialYearStartMonth - 1] || fiscalMonths[0], "Choose financial year start month")}</label>
          <label class="settings-field"><span><strong>Payday / cycle anchor</strong><small>Type any day from 1 to 31, or pick a suggestion. Shorter months use their last day. Cycle totals and the default spending month start on this day.</small></span><span class="payday-input"><input name="paydayAnchorDay" type="number" min="1" max="31" step="1" inputmode="numeric" list="payday-day-presets" required value="${settings.paydayAnchorDay}" aria-label="Payday, day of the month (1 to 31)"><datalist id="payday-day-presets">${[1, 5, 10, 15, 20, 25, 28].map(day => `<option value="${day}">${ordinalDay(day)} of each month</option>`).join("")}</datalist><em>of each month</em></span></label>
          <label class="settings-field"><span><strong>Dark mode</strong><small>Use a darker color theme across your workspace.</small></span><input name="darkMode" type="checkbox" ${settings.darkMode ? "checked" : ""}></label>
          <label class="settings-field"><span><strong>Always show cents</strong><small>Show two decimal places in money amounts.</small></span><input name="alwaysShowCents" type="checkbox" ${settings.alwaysShowCents ? "checked" : ""}></label>
          <label class="settings-field"><span><strong>Reduce motion</strong><small>Use fewer animation and hover effects.</small></span><input name="reduceMotion" type="checkbox" ${settings.reduceMotion ? "checked" : ""}></label>
        </section>
        <section class="panel settings-panel"><div class="panel-heading"><div><div class="section-kicker">REMINDER PREFERENCES</div><h2>What to keep an eye on</h2></div></div>
          <label class="settings-field"><span><strong>Quest progress</strong><small>Saved as a preference; this preview does not send notifications.</small></span><input name="goalNotifications" type="checkbox" ${settings.goalNotifications ? "checked" : ""}></label>
          <label class="settings-field"><span><strong>Monthly plan</strong><small>Saved as a preference; this preview does not send notifications.</small></span><input name="monthlyReminders" type="checkbox" ${settings.monthlyReminders ? "checked" : ""}></label>
        </section>
        <section class="panel settings-panel"><div class="panel-heading"><div><div class="section-kicker">PRIVACY &amp; SECURITY</div><h2>Session protection</h2></div></div>
          <p class="settings-disclosure">NetraOS keeps a browser copy and syncs your account records to Supabase when online. The inactivity PIN is a device-side convenience and does not encrypt stored data. HTTPS and security headers are controlled by the hosting platform.</p>
          <label class="settings-field"><span><strong>Privacy Shield</strong><small>Mask currency amounts in the app header or with the shortcut.</small></span><input name="privacyShield" type="checkbox" ${privacyEnabled ? "checked" : ""}></label>
          <label class="settings-field"><span><strong>Privacy Shield shortcut</strong><small>Keyboard shortcut to toggle amount masking.</small></span><select name="privacyShortcut"><option value="Shift+S" ${settings.privacyShortcut === "Shift+S" ? "selected" : ""}>Shift + S</option><option value="Alt+Shift+S" ${settings.privacyShortcut === "Alt+Shift+S" ? "selected" : ""}>Alt + Shift + S</option><option value="Off" ${settings.privacyShortcut === "Off" ? "selected" : ""}>Off</option></select></label>
          <label class="settings-field"><span><strong>Auto-lock after inactivity</strong><small>Requires a four-digit PIN. This device’s saved PIN also works offline.</small></span><select name="lockTimeoutMinutes"><option value="0" ${settings.lockTimeoutMinutes === 0 ? "selected" : ""}>Never</option><option value="1" ${settings.lockTimeoutMinutes === 1 ? "selected" : ""}>1 minute</option><option value="5" ${settings.lockTimeoutMinutes === 5 ? "selected" : ""}>5 minutes</option><option value="15" ${settings.lockTimeoutMinutes === 15 ? "selected" : ""}>15 minutes</option></select></label>
          <div class="autolock-options" data-autolock-options ${settings.lockTimeoutMinutes ? "" : "hidden"}>
            ${(settings.localPinHash || settings.accountPinEnabled) ? '<label class="inventory-form-field"><span>Current four-digit PIN <small>Required to change or remove your PIN</small></span><input name="currentPin" type="password" inputmode="numeric" autocomplete="current-password" pattern="[0-9]{4}" maxlength="4"></label>' : ""}
            <div class="settings-pin-fields"><label class="inventory-form-field"><span>New four-digit PIN <small>Leave blank to keep the current PIN</small></span><input name="newPin" type="password" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{4}" maxlength="4"></label><label class="inventory-form-field"><span>Confirm PIN</span><input name="confirmPin" type="password" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{4}" maxlength="4"></label></div>
            ${(settings.localPinHash || settings.accountPinEnabled) ? '<button class="secondary-button pin-recovery-button" type="button" data-pin-recovery>Forgot your current PIN?</button>' : ""}
            <label class="settings-field"><span><strong>Remove current PIN</strong><small>Turns off the local screen lock.</small></span><input name="clearPin" type="checkbox"></label>
          </div>
          <div class="settings-audit"><div class="settings-audit-heading"><strong>Recent local security activity</strong><div class="settings-audit-export"><label for="security-audit-period">Download range</label><select id="security-audit-period" data-security-audit-period><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="1m">Last 1 month</option><option value="6m">Last 6 months</option><option value="12m">Last 12 months</option></select><button type="button" class="secondary-button" data-security-audit-download>Download list</button></div></div>${recentAudit.length ? `<ul>${recentAudit.map(item => `<li><span>${escapeHTML(item.action)}</span><time>${escapeHTML(new Date(item.timestamp).toLocaleString())}</time></li>`).join("")}</ul>` : `<p>No activity recorded yet.</p>`}</div>
        </section>
        <section class="panel settings-panel"><div class="panel-heading"><div><div class="section-kicker">LOCAL TAX &amp; DEDUCTIONS</div><h2>Kenya statutory estimates</h2></div></div>
          <p class="settings-disclosure">These switches change the local calculator estimate only. Relief amounts are subtracted directly from estimated PAYE, up to the tax before relief. Verify current statutory requirements before relying on a result.</p>
          <label class="settings-field"><span><strong>PAYE income tax</strong><small>Apply the progressive PAYE estimate.</small></span><input name="taxPaye" type="checkbox" ${settings.taxPaye ? "checked" : ""}></label>
          <label class="settings-field"><span><strong>NSSF Tier I &amp; II</strong><small>Apply the current in-app NSSF estimate.</small></span><input name="taxNssf" type="checkbox" ${settings.taxNssf ? "checked" : ""}></label>
          <label class="settings-field"><span><strong>SHIF</strong><small>Apply the current in-app SHIF estimate.</small></span><input name="taxShif" type="checkbox" ${settings.taxShif ? "checked" : ""}></label>
          <label class="settings-field"><span><strong>Affordable Housing Levy</strong><small>Apply the in-app 1.5% estimate.</small></span><input name="taxAhl" type="checkbox" ${settings.taxAhl ? "checked" : ""}></label>
          <div class="settings-pin-fields"><label class="inventory-form-field"><span>Personal relief per month (KSh)</span><input name="personalRelief" type="number" min="0" step="100" value="${settings.personalRelief}"></label><label class="inventory-form-field"><span>Insurance relief per month (KSh)</span><input name="insuranceRelief" type="number" min="0" step="100" value="${settings.insuranceRelief}"></label><label class="inventory-form-field"><span>Other tax relief per month (KSh)</span><input name="customRelief" type="number" min="0" step="100" value="${settings.customRelief}"></label></div>
        </section>
        <section class="panel settings-panel"><div class="panel-heading"><div><div class="section-kicker">STORAGE &amp; PRIVACY</div><h2>Your browser data</h2></div></div>
          <p class="settings-disclosure">Browser storage keeps a working copy and Supabase Auth keeps your sign-in session. Account data syncs to the connected Supabase project when online. This app currently sets no analytics cookies and collects no performance telemetry.</p>
          <label class="settings-field"><span><strong>Allow optional performance telemetry</strong><small>No telemetry is currently collected by this version.</small></span><input name="performanceTelemetryConsent" type="checkbox" ${settings.performanceTelemetryConsent ? "checked" : ""}></label>
          <label class="settings-field"><span><strong>Monthly backup reminder</strong><small>Remind you in this browser to download a local backup.</small></span><input name="monthlyBackupPrompt" type="checkbox" ${settings.monthlyBackupPrompt ? "checked" : ""}></label>
          <div class="settings-inline-actions"><button class="secondary-button" type="button" data-cookie-manage>Manage cookie preferences</button><button class="secondary-button" type="button" data-settings-action="export-json">Download all data (JSON)</button><button class="secondary-button" type="button" data-settings-action="export-csv">Download all data (CSV)</button></div>
          <label class="settings-import-drop" data-settings-drop><strong>Restore a JSON backup</strong><span>Choose a file or drop it here. Existing matching NetraOS records will be replaced.</span><input name="backupFile" type="file" accept="application/json,.json" data-settings-import></label>
          <div class="settings-inline-actions"><button class="danger-button" type="button" data-settings-action="clear-data">Factory reset · Clear all NetraOS data</button></div>
          <p class="legal-links"><a href="#terms" data-public-action="terms">Terms of Service</a><a href="#privacy" data-public-action="privacy">Privacy Policy</a></p>
        </section>
        <section class="panel settings-panel"><div class="panel-heading"><div><div class="section-kicker">CUSTOMIZATION &amp; GAMIFICATION</div><h2>System preferences</h2></div></div>
          <label class="settings-field"><span><strong>Theme accent</strong><small>Changes the selected navigation, buttons, chart highlights, and other highlights. Preview updates immediately; save Settings to keep it.</small></span><select name="accentProfile"><option value="emerald" ${settings.accentProfile === "emerald" ? "selected" : ""}>Emerald Terminal</option><option value="amber" ${settings.accentProfile === "amber" ? "selected" : ""}>Cyber Amber</option><option value="matrix" ${settings.accentProfile === "matrix" ? "selected" : ""}>Matrix Green</option><option value="blue" ${settings.accentProfile === "blue" ? "selected" : ""}>Classic Blue</option><option value="violet" ${settings.accentProfile === "violet" ? "selected" : ""}>Electric Violet</option><option value="coral" ${settings.accentProfile === "coral" ? "selected" : ""}>Sunset Coral</option><option value="aqua" ${settings.accentProfile === "aqua" ? "selected" : ""}>Aqua Teal</option></select></label>
          <div class="accent-preview" data-accent-preview aria-live="polite"><span class="accent-preview-swatch" aria-hidden="true"></span><span class="accent-preview-copy"><strong data-accent-preview-name>${escapeHTML({ emerald: "Emerald Terminal", amber: "Cyber Amber", matrix: "Matrix Green", blue: "Classic Blue", violet: "Electric Violet", coral: "Sunset Coral", aqua: "Aqua Teal" }[settings.accentProfile])}</strong><small>Live accent preview</small></span><span class="accent-preview-sample">Example action</span></div>
          <label class="settings-field"><span><strong>Show XP Points</strong><small>Show quest status badges and XP-style progress labels.</small></span><input name="showXpPoints" type="checkbox" ${settings.showXpPoints ? "checked" : ""}></label>
          <label class="settings-field"><span><strong>Quest completion sounds</strong><small>Play a short sound when a quest is completed.</small></span><input name="questSounds" type="checkbox" ${settings.questSounds ? "checked" : ""}></label>
          <label class="settings-field"><span><strong>Quest completion animations</strong><small>Show the milestone celebration animation.</small></span><input name="questAnimations" type="checkbox" ${settings.questAnimations ? "checked" : ""}></label>
        </section>
        <div class="settings-actions"><span>Saved on this device; syncs when online.</span><button class="inventory-submit" type="submit">Save changes</button></div>
      </form>
    </section>
    ${renderAppFooter()}`;
}

// Start the local session, apply the profile and preferences, and open the dashboard.
function enterApp(profile) {
  try {
    localStorage.setItem(sessionStorageKey, "active");
  } catch {
    showToast("Unable to start a local session. Browser storage may be disabled.");
    return;
  }
  setProfileName(profile.username || profile.name);
  applyProfileAvatar();
  applyStoredSettings();
  publicShell.hidden = true;
  appShell.hidden = false;
  showPage("Dashboard");
  recordSecurityAudit("Local profile signed in");
  scheduleAutoLock();
  maybePromptForBackup();
  scheduleAutoLockNudge({ force: true });
  scheduleShortcutPrompt();
  showCookieBanner();
}

function scheduleShortcutPrompt() {
  window.clearTimeout(shortcutPromptTimer);
  if (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone) return;
  try { if (sessionStorage.getItem(shortcutPromptSessionKey)) return; } catch { /* Prompt remains available if session storage is disabled. */ }
  shortcutPromptTimer = window.setTimeout(showShortcutPrompt, 5000);
}

function showShortcutPrompt() {
  if (appShell.hidden || window.matchMedia("(display-mode: standalone)").matches || navigator.standalone) return;
  if (document.querySelector("dialog[open]")) {
    shortcutPromptTimer = window.setTimeout(showShortcutPrompt, 5000);
    return;
  }
  try { sessionStorage.setItem(shortcutPromptSessionKey, "1"); } catch { /* Optional. */ }

  const canInstall = Boolean(deferredInstallPrompt);
  const isPhone = window.matchMedia("(max-width: 880px)").matches;
  const dialog = document.createElement("dialog");
  dialog.className = "inventory-dialog shortcut-install-dialog";
  dialog.setAttribute("aria-labelledby", "shortcut-install-title");
  dialog.innerHTML = `
    <div class="inventory-form">
      <header class="inventory-dialog-heading">
        <div>
          <span class="section-kicker">KEEP NETRAOS CLOSE</span>
          <h2 id="shortcut-install-title">${canInstall ? "Add NetraOS to your device" : "Create a NetraOS shortcut"}</h2>
        </div>
        <button class="inventory-dialog-close" type="button" aria-label="Close dialog">×</button>
      </header>
      <p class="shortcut-install-copy">${canInstall
        ? "Install NetraOS for quick access from your home screen or apps list. Your browser keeps a working copy and syncs account data when online."
        : isPhone
          ? "For quicker access, open your browser menu and choose “Add to Home Screen” or “Install app”. Your browser keeps a working copy and syncs account data when online."
          : "For quicker access, open your browser menu and choose “Install NetraOS” or “Create shortcut”. Your browser keeps a working copy and syncs account data when online."}</p>
      <footer class="inventory-dialog-actions">
        <button class="inventory-cancel" type="button">Maybe later</button>
        ${canInstall ? '<button class="inventory-submit" type="button" data-shortcut-install>Install app</button>' : ""}
      </footer>
    </div>`;
  document.body.append(dialog);
  const close = () => dialog.close();
  dialog.querySelector(".inventory-dialog-close").addEventListener("click", close);
  dialog.querySelector(".inventory-cancel").addEventListener("click", close);
  dialog.addEventListener("click", event => { if (event.target === dialog) close(); });
  dialog.addEventListener("close", () => {
    dialog.remove();
    showCookieBanner();
  }, { once: true });
  dialog.querySelector("[data-shortcut-install]")?.addEventListener("click", async event => {
    const installEvent = deferredInstallPrompt;
    if (!installEvent) { close(); return; }
    event.currentTarget.disabled = true;
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
      deferredInstallPrompt = null;
    } catch { /* Browser install UI can be unavailable if its event expired. */ }
    close();
  });
  dialog.showModal();
}

// Local data accessors keep each financial module's stored data in a consistent shape.
function getInventoryEntries() {
  try {
    const entries = JSON.parse(localStorage.getItem(inventoryStorageKey) || "[]");
    return Array.isArray(entries) ? entries.filter(item => item && typeof item === "object" && typeof item.action === "string" && Number.isFinite(Date.parse(item.at))) : [];
  } catch {
    return [];
  }
}

function saveInventoryEntries(entries) {
  localStorage.setItem(inventoryStorageKey, JSON.stringify(entries));
}

function getPowerUpData() {
  try {
    const data = JSON.parse(localStorage.getItem(powerUpStorageKey) || "{}");
    return {
      incomes: Array.isArray(data.incomes) ? data.incomes : [],
      budgets: Array.isArray(data.budgets) ? data.budgets : [],
      spending: Array.isArray(data.spending) ? data.spending : []
    };
  } catch {
    return { incomes: [], budgets: [], spending: [] };
  }
}

function savePowerUpData(data) {
  localStorage.setItem(powerUpStorageKey, JSON.stringify(data));
}

function getPowerUpTotals() {
  return getPowerUpReportTotals();
}

// Quest helpers load goals, calculate completion, and keep dashboard progress current.
function getQuests() {
  try {
    const saved = localStorage.getItem(questStorageKey);
    if (saved !== null) {
      const quests = JSON.parse(saved);
      return Array.isArray(quests) ? quests : [];
    }
  } catch {
    return [];
  }

  const starterQuest = [{ id: "emergency-fund", name: "Emergency fund", current: 0, target: 0 }];
  try {
    localStorage.setItem(questStorageKey, JSON.stringify(starterQuest));
  } catch {
    // Keep the starter quest visible for this session if storage is unavailable.
  }
  return starterQuest;
}

function saveQuests(quests) {
  localStorage.setItem(questStorageKey, JSON.stringify(quests));
}

function questProgress(quest) {
  const target = Number(quest.target || 0);
  return target > 0 ? Math.min(100, Math.round((Number(quest.current || 0) / target) * 100)) : 0;
}


// Milestones Engine: categories, priority tiers, required pace, XP and portfolio summary.
const questCategories = ["Emergency Buffer", "Debt Eradication", "Asset Accumulation", "Lifestyle & Major Purchase"];
const questTiers = [
  { tier: 1, label: "Tier 1 · Critical Safeguard" },
  { tier: 2, label: "Tier 2 · Structured Milestone" },
  { tier: 3, label: "Tier 3 · Growth & Lifestyle" }
];
const XP_PER_PERCENT = 10;

function questXp(quest) {
  return questProgress(quest) * XP_PER_PERCENT;
}

function questTierLabel(quest) {
  return questTiers.find(item => item.tier === Number(quest.tier))?.label || "";
}

// Remaining amount spread over the months left (at least one month) before the deadline.
function questPace(quest) {
  const target = Number(quest.target || 0);
  const current = Number(quest.current || 0);
  const remaining = Math.max(0, target - current);
  const out = { remaining, monthsLeft: null, required: null, overdue: false, velocity: null, status: "none" };
  if (remaining === 0) { out.status = "done"; return out; }
  if (quest.deadline) {
    const months = monthsUntil(quest.deadline);
    out.overdue = quest.deadline < localDateValue();
    out.monthsLeft = months;
    out.required = out.overdue ? remaining : remaining / Math.max(1, months);
  }
  if (quest.createdAt) {
    const elapsedMonths = (Date.now() - new Date(quest.createdAt).getTime()) / (30.44 * 86400000);
    if (elapsedMonths >= 0.25) out.velocity = Math.max(0, (current - Number(quest.startAmount || 0)) / elapsedMonths);
  }
  if (out.overdue) out.status = "overdue";
  else if (out.required !== null && out.velocity !== null) out.status = out.velocity >= out.required * 0.9 ? "on-track" : "behind";
  else if (out.required !== null) out.status = "planned";
  return out;
}

function sortQuestsByPriority(quests) {
  return [...quests].sort((a, b) =>
    (Number(a.tier) || 4) - (Number(b.tier) || 4) ||
    String(a.deadline || "9999").localeCompare(String(b.deadline || "9999")));
}

function getMilestonesEngine(quests = getQuests()) {
  const withTarget = quests.filter(quest => Number(quest.target) > 0);
  const active = withTarget.filter(quest => questProgress(quest) < 100);
  const target = withTarget.reduce((sum, quest) => sum + Number(quest.target), 0);
  const saved = withTarget.reduce((sum, quest) => sum + Math.min(Number(quest.current || 0), Number(quest.target)), 0);
  const paces = active.map(quest => ({ quest, pace: questPace(quest) }));
  return {
    count: active.length,
    completed: withTarget.length - active.length,
    target, saved,
    rate: target > 0 ? Math.round(saved / target * 100) : 0,
    monthly: paces.reduce((sum, item) => sum + (item.pace.required || 0), 0),
    behind: paces.filter(item => item.pace.status === "behind" || item.pace.status === "overdue"),
    top: sortQuestsByPriority(active)[0] || null
  };
}

function renderQuestMetrics(quest) {
  const pace = questPace(quest);
  const progress = questProgress(quest);
  const monthly = progress === 100 ? "Funded" : pace.required === null ? "Set a deadline" : `${formatKsh(Math.ceil(pace.required))}/mo`;
  const deadline = quest.deadline
    ? `${new Date(`${quest.deadline}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}${progress < 100 && pace.monthsLeft !== null ? (pace.overdue ? " · overdue" : ` · ${pace.monthsLeft} ${pace.monthsLeft === 1 ? "month" : "months"} left`) : ""}`
    : "Not set";
  const paceText = {
    "on-track": "On track", behind: "Behind pace", overdue: "Past deadline", done: "Complete", planned: "Pace builds as you update", none: "—"
  }[pace.status];
  const velocity = pace.velocity !== null ? ` · saving ${formatKsh(Math.round(pace.velocity))}/mo` : "";
  return `<span class="loan-metrics quest-metrics">
    <span><small>CATEGORY / PRIORITY</small><b>${escapeHTML(quest.category || "Not set")}${quest.tier ? ` · ${escapeHTML(questTierLabel(quest))}` : ""}</b></span>
    <span><small>TARGET &amp; CURRENT</small><b>${formatKsh(quest.current)} of ${formatKsh(quest.target)}</b></span>
    <span><small>DEADLINE</small><b>${escapeHTML(deadline)}</b></span>
    <span><small>REQUIRED MONTHLY</small><b>${escapeHTML(monthly)}</b></span>
    <span><small>PACE</small><b class="pace-${pace.status}">${escapeHTML(paceText)}${escapeHTML(velocity)}</b></span>
  </span>`;
}

function renderQuestRows(quests, dashboard = false) {
  if (!quests.length) {
    return `<p class="empty-quests">No active goals yet. Add a quest when you are ready.</p>`;
  }

  return sortQuestsByPriority(quests).map(quest => {
    const progress = questProgress(quest);
    const pace = questPace(quest);
    return `
      <div class="quest-row ${progress === 100 ? "is-complete" : ""}" data-quest-id="${escapeHTML(quest.id)}">
        <span class="quest-icon shield">${progress === 100 ? "✦" : "◈"}</span>
        <div class="quest-info">
          <div class="quest-title">
            ${escapeHTML(quest.name)}
            ${progress === 100 ? `<span class="quest-xp quest-complete-badge">COMPLETE</span>` : dashboard ? "" : `<span class="quest-xp">ACTIVE</span>`}
            ${quest.tier ? `<span class="quest-tier tier-${Number(quest.tier)}">TIER ${Number(quest.tier)}</span>` : ""}
            <span class="quest-xp quest-xp-earned">+${questXp(quest)} XP</span>
          </div>
          <div class="quest-meta">${formatKsh(quest.current)} <span>of</span> ${formatKsh(quest.target)}${dashboard && progress < 100 && pace.required !== null ? ` <span>·</span> ${formatKsh(Math.ceil(pace.required))}/mo needed` : ""}</div>
          <div class="quest-track"><i style="width:${progress}%"></i></div>
          ${dashboard ? "" : renderQuestMetrics(quest)}
        </div>
        <strong class="quest-percent">${progress}%</strong>
        ${dashboard ? "" : `<button class="quest-update" type="button" data-edit-quest="${escapeHTML(quest.id)}" aria-label="Update ${escapeHTML(quest.name)} progress">Update progress</button>`}
        <button class="delete-quest" type="button" data-delete-quest="${escapeHTML(quest.id)}" aria-label="Delete ${escapeHTML(quest.name)} goal" title="Delete goal">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m3 3v7m6-7v7" /></svg>
        </button>
      </div>`;
  }).join("");
}

// Summary shown on the Quests page and (compact) on the dashboard's Active quests panel.
function renderMilestonesSummary(compact = false) {
  const engine = getMilestonesEngine();
  if (engine.count + engine.completed === 0) return "";
  const insights = [];
  if (engine.count > 0) {
    insights.push(`To keep ${engine.count === 1 ? "your quest" : `all ${engine.count} quests`} on schedule, set aside about <b>${formatKsh(Math.ceil(engine.monthly))}</b> a month.`);
    if (engine.top) {
      const pct = questProgress(engine.top);
      insights.push(`Your top priority, <b>${escapeHTML(engine.top.name)}</b>${engine.top.tier ? ` (Tier ${Number(engine.top.tier)})` : ""}, is ${pct}% funded. Direct spare cash there first.`);
    }
    if (engine.behind.length) {
      insights.push(`Pace check: ${engine.behind.map(item => `<b>${escapeHTML(item.quest.name)}</b>${item.pace.status === "overdue" ? " is past its deadline" : item.pace.velocity !== null ? ` is saving ${formatKsh(Math.round(item.pace.velocity))}/mo against ${formatKsh(Math.ceil(item.pace.required))}/mo needed` : " is behind pace"}`).join("; ")}. A small monthly top-up would bring it back on track.`);
    }
  } else {
    insights.push("Every quest is fully funded. Create a new quest to keep your money working toward something.");
  }
  if (compact) {
    return `<div class="milestone-strip"><span><small>SAVED</small><b>${formatKsh(engine.saved)} / ${formatKsh(engine.target)}</b></span><span><small>COMPLETION</small><b>${engine.rate}%</b></span><span><small>NEEDED / MONTH</small><b>${formatKsh(Math.ceil(engine.monthly))}</b></span></div>`;
  }
  return `
    <section class="panel milestones-engine">
      <div class="panel-heading">
        <div><div class="section-kicker">NETRAOS MILESTONES ENGINE SUMMARY</div><h2>Progress &amp; pace</h2></div>
        <span class="inventory-account-count">${engine.completed} of ${engine.count + engine.completed} complete</span>
      </div>
      <div class="asset-engine-kpis">
        <article class="asset-engine-kpi"><span class="inventory-label">ACTIVE QUESTS IN MOTION</span><strong>${engine.count}</strong><span class="inventory-note">${engine.completed} completed</span></article>
        <article class="asset-engine-kpi"><span class="inventory-label">TOTAL MILESTONE TARGET</span><strong>${formatKsh(engine.target)}</strong><span class="inventory-note">Across all quests</span></article>
        <article class="asset-engine-kpi"><span class="inventory-label">TOTAL CAPITAL SAVED</span><strong>${formatKsh(engine.saved)}</strong><span class="inventory-note">${formatKsh(Math.max(0, engine.target - engine.saved))} to go</span></article>
        <article class="asset-engine-kpi highlight"><span class="inventory-label">OVERALL COMPLETION</span><strong>${engine.rate}%</strong><span class="inventory-note">${formatKsh(Math.ceil(engine.monthly))} / month needed</span></article>
      </div>
      <aside class="asset-insight"><span class="inventory-label">SYSTEM DISPATCH INSIGHT</span>${insights.map(text => `<p>${text}</p>`).join("")}</aside>
    </section>`;
}

function updateDashboardQuests() {
  const quests = getQuests();
  const list = document.querySelector(".quests-panel .quest-list");
  const badge = document.querySelector(".quests-panel .count-badge");
  if (list) {
    list.innerHTML = renderQuestRows(quests, true);
    list.parentElement.querySelector(".milestone-strip")?.remove();
    list.insertAdjacentHTML("beforebegin", renderMilestonesSummary(true));
  }
  if (badge) badge.textContent = quests.length;
  updateDashboardOnboarding();
}

function updateDashboardOnboarding() {
  const card = document.querySelector("[data-onboarding]");
  if (!card) return;
  const inventory = getInventoryEntries();
  const quests = getQuests();
  const power = getPowerUpData();
  const stepState = {
    account: inventory.some(entry => entry.type === "asset"),
    goal: quests.some(quest => Number(quest.target) > 0),
    income: power.incomes.length > 0,
    budget: power.budgets.length > 0
  };
  const steps = [stepState.account, stepState.goal, stepState.income && stepState.budget];
  const completed = steps.filter(Boolean).length;
  card.hidden = completed === steps.length;
  const count = card.querySelector("[data-onboarding-count]");
  const progress = card.querySelector("[data-onboarding-progress]");
  const progressBar = card.querySelector(".onboarding-progress");
  if (count) count.textContent = `${completed} of ${steps.length} complete`;
  if (progress) progress.style.width = `${(completed / steps.length) * 100}%`;
  if (progressBar) progressBar.setAttribute("aria-valuenow", String(completed));
  card.querySelectorAll("[data-onboarding-step]").forEach((row, index) => {
    const key = row.dataset.onboardingStep;
    const done = steps[index];
    row.classList.toggle("is-complete", done);
    const mark = row.querySelector(".onboarding-step-mark");
    if (mark) mark.textContent = done ? "✓" : String(index + 1);
    row.querySelectorAll("[data-onboarding-action]").forEach(button => {
      const action = button.dataset.onboardingAction;
      const actionDone = action === "account" ? stepState.account
        : action === "goal" ? stepState.goal
          : action === "income" ? stepState.income
            : action === "budget" ? stepState.budget
              : false;
      button.hidden = actionDone;
    });
    if (key === "plan" && done) row.setAttribute("aria-label", "Monthly plan complete");
  });
}

// Currency helpers manage manual exchange rates, switcher labels, and formatted amounts.
function getCurrencyState() {
  try {
    const saved = JSON.parse(localStorage.getItem(currencyStorageKey) || "{}");
    const rates = { KES: 1 };
    for (const code of Object.keys(displayCurrencies)) {
      const rate = Number(saved.rates?.[code]);
      if (code !== "KES" && Number.isFinite(rate) && rate > 0) rates[code] = rate;
    }
    return { active: rates[saved.active] ? saved.active : "KES", rates };
  } catch {
    return { active: "KES", rates: { KES: 1 } };
  }
}

function saveCurrencyState(state) {
  localStorage.setItem(currencyStorageKey, JSON.stringify(state));
}

function formatNavigationMonth(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
}

function updateDateSwitcher(date = new Date()) {
  const label = document.querySelector(".date-select-label");
  if (label) label.textContent = formatNavigationMonth(date);
}

// Custom dropdown for Settings: a button that opens the shared popover menu, plus a hidden input so the
// form submit handler keeps reading the value by name.
function settingsDropdown(name, value, label, ariaLabel) {
  return `<span class="settings-dropdown"><input type="hidden" name="${name}" value="${escapeHTML(String(value))}"><button class="settings-dropdown-button" type="button" data-settings-dropdown="${name}" aria-haspopup="menu" aria-expanded="false" aria-label="${escapeHTML(ariaLabel)}"><span data-settings-dropdown-label>${escapeHTML(label)}</span><svg class="dropdown-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg></button></span>`;
}

function setSettingsDropdown(name, value, label) {
  const input = document.querySelector(`input[name="${name}"]`);
  if (!input) return;
  input.value = String(value);
  const text = input.parentElement?.querySelector("[data-settings-dropdown-label]");
  if (text) text.textContent = label;
}

function settingsDropdownChoices(name) {
  const fiscal = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const input = document.querySelector(`input[name="${name}"]`);
  const current = input ? input.value : "";
  if (name === "financialYearStartMonth") {
    return fiscal.map((month, index) => ({ label: `${String(index + 1) === current ? "✓ " : ""}${month}`, action: `setting:${name}:${index + 1}` }));
  }
  const state = getCurrencyState();
  const choices = Object.entries(displayCurrencies).map(([code, currency]) => ({
    label: `${code === current ? "✓ " : ""}${currency.symbol} · ${currency.name}${state.rates[code] ? "" : " · Set rate first"}`,
    action: `setting:${name}:${code}`
  }));
  choices.push({ label: "Manage exchange rates…", action: "currency:rates" });
  return choices;
}

function getRecentNavigationMonths(count = 3) {
  const now = new Date();
  return Array.from({ length: count }, (_, offset) => {
    const month = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const label = formatNavigationMonth(month);
    return { label, action: `date:${label}` };
  });
}

function updateCurrencySwitcher() {
  const button = document.querySelector(".currency-select");
  if (!button) return;
  const currency = getCurrencyState().active;
  const details = displayCurrencies[currency];
  button.querySelector(".currency-select-label").textContent = currency === "KES" ? "KSh" : currency;
  button.setAttribute("aria-label", `Display currency: ${details.name}`);
}

function formatKsh(amount) {
  const settings = getStoredSettings();
  const currencyState = getCurrencyState();
  const currency = displayCurrencies[currencyState.active];
  const rate = currencyState.rates[currencyState.active] || 1;
  const converted = Number(amount || 0) / rate;
  return currency.symbol + " " + converted.toLocaleString(currency.locale, {
    minimumFractionDigits: settings.alwaysShowCents ? 2 : 0,
    maximumFractionDigits: 2
  });
}

// Find currency amounts in rendered text so the privacy toggle can mask them.
function markPrivacySensitiveText(node) {
  if (!node || node.nodeType !== Node.TEXT_NODE || !currencyAmountPattern.test(node.nodeValue || "")) return;
  const element = node.parentElement;
  if (!element || element.closest("script, style, svg, [data-privacy-ignore]")) return;
  element.setAttribute("data-privacy-currency", "");
}

function markPrivacySensitiveSubtree(root) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    markPrivacySensitiveText(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode;
  while ((textNode = walker.nextNode())) markPrivacySensitiveText(textNode);
}

function setPrivacyMode(enabled) {
  const toggle = document.querySelector("[data-privacy-toggle]");
  appShell.classList.toggle("privacy-mode", enabled);
  document.body.classList.toggle("privacy-mode", enabled);
  if (toggle) {
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.setAttribute("aria-label", enabled ? "Show currency amounts" : "Hide currency amounts");
    toggle.title = enabled ? "Show currency amounts" : "Hide currency amounts";
  }
  const input = document.querySelector('input[name="privacyShield"]');
  if (input) input.checked = enabled;
  try { localStorage.setItem(privacyModeStorageKey, String(enabled)); } catch { /* Keep privacy masking active for this session. */ }
}

function initializePrivacyMode() {
  const toggle = document.querySelector("[data-privacy-toggle]");
  if (!toggle) return;
  let enabled = false;
  try {
    enabled = localStorage.getItem(privacyModeStorageKey) === "true";
  } catch {
    // Privacy masking remains available for this session when storage is unavailable.
  }
  setPrivacyMode(enabled);
  markPrivacySensitiveSubtree(document.body);
  const observer = new MutationObserver(records => {
    records.forEach(record => {
      if (record.type === "characterData") markPrivacySensitiveText(record.target);
      else record.addedNodes.forEach(node => markPrivacySensitiveSubtree(node));
    });
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  toggle.addEventListener("click", () => setPrivacyMode(!appShell.classList.contains("privacy-mode")));
  document.addEventListener("keydown", event => {
    const shortcut = getStoredSettings().privacyShortcut;
    const allowed = (shortcut === "Shift+S" && event.shiftKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === "s") ||
      (shortcut === "Alt+Shift+S" && event.altKey && event.shiftKey && !event.ctrlKey && event.key.toLowerCase() === "s");
    if (!allowed || event.target instanceof HTMLElement && event.target.matches("input, textarea, select, [contenteditable='true']")) return;
    event.preventDefault();
    setPrivacyMode(!appShell.classList.contains("privacy-mode"));
  });
}

// Format base KSh values without converting them to the selected display currency.
function formatBaseKsh(amount) {
  const alwaysShowCents = getStoredSettings().alwaysShowCents;
  return "KSh " + Number(amount || 0).toLocaleString("en-KE", {
    minimumFractionDigits: alwaysShowCents ? 2 : 0,
    maximumFractionDigits: 2
  });
}

// Show and persist the user's manual exchange-rate table in a native dialog.
function openCurrencyRatesDialog(requestedCurrency = "") {
  const state = getCurrencyState();
  const dialog = document.createElement("dialog");
  dialog.className = "inventory-dialog currency-rates-dialog";
  dialog.innerHTML = `
    <form class="inventory-form">
      <header class="inventory-dialog-heading">
        <div><span class="section-kicker">LOCAL DISPLAY SETTINGS</span><h2>Exchange rates</h2></div>
        <button class="inventory-dialog-close" type="button" aria-label="Close dialog">×</button>
      </header>
      <p class="currency-rate-note">Enter how many Kenyan shillings equal one unit of each currency. The app syncs these display-only rates to your account when online.</p>
      <div class="inventory-form-fields">
        ${Object.entries(displayCurrencies).filter(([code]) => code !== "KES").map(([code, currency]) => `
          <label class="inventory-form-field"><span>${currency.name} (${code})</span><input name="rate-${code}" type="number" min="0.000001" step="any" inputmode="decimal" placeholder="KSh per 1 ${code}" value="${state.rates[code] || ""}" ${requestedCurrency === code ? "required" : ""}></label>
        `).join("")}
      </div>
      <footer class="inventory-dialog-actions"><button class="inventory-cancel" type="button">Cancel</button><button class="inventory-submit" type="submit">Save rates</button></footer>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector("form");
  dialog.querySelector(".inventory-dialog-close").addEventListener("click", () => dialog.close());
  dialog.querySelector(".inventory-cancel").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const formData = new FormData(form);
    const rates = { KES: 1 };
    for (const code of Object.keys(displayCurrencies).filter(item => item !== "KES")) {
      const raw = String(formData.get(`rate-${code}`) || "").trim();
      const rate = Number(raw);
      if (raw && Number.isFinite(rate) && rate > 0) rates[code] = rate;
    }
    if (requestedCurrency && !rates[requestedCurrency]) {
      showToast(`Enter a valid KSh rate for ${requestedCurrency} to switch currencies.`);
      return;
    }
    const active = requestedCurrency || (rates[state.active] ? state.active : "KES");
    try {
      saveCurrencyState({ active, rates });
    } catch {
      showToast("Unable to save exchange rates in browser storage.");
      return;
    }
    dialog.close();
    updateCurrencySwitcher();
    if (crumb.textContent === "Settings") {
      const active = getCurrencyState().active;
      setSettingsDropdown("displayCurrency", active, `${displayCurrencies[active].symbol} · ${displayCurrencies[active].name}`);
    } else showPage(crumb.textContent);
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
}

// Escape user-provided text before inserting it into generated HTML templates.
function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Inventory and Power-Up renderers summarize saved assets and monthly cash flow.
function getInventoryTotals() {
  const entries = getInventoryEntries();
  const assets = entries
    .filter(entry => entry.type === "asset")
    .reduce((total, entry) => total + Number(entry.amount || 0), 0);
  const liabilities = entries
    .filter(entry => entry.type === "liability")
    .reduce((total, entry) => total + Number(entry.amount || 0), 0);

  return { assets, liabilities, netWorth: assets - liabilities };
}

function renderInventoryRows(type, categories) {
  const entries = getInventoryEntries();

  return categories
    .map(category => {
      const amount = entries
        .filter(entry => entry.type === type && entry.category === category.name)
        .reduce((total, entry) => total + Number(entry.amount || 0), 0);

      return `
        <div class="inventory-row">
          <span class="inventory-row-icon">${category.icon}</span>
          <span>${category.name}</span>
          <strong>${formatKsh(amount)}</strong>
        </div>`;
    })
    .join("");
}

function renderAccountRows(entries) {
  if (entries.length === 0) {
    return `
      <div class="inventory-empty-state">
        <span class="inventory-empty-icon" aria-hidden="true">＋</span>
        <div>
          <strong>No accounts added yet</strong>
          <p>Add an account to keep its balance in your financial inventory.</p>
        </div>
        <button class="inventory-action secondary" type="button" data-inventory-action="add-account">
          Add your first account
        </button>
      </div>`;
  }

  return `
    <div class="inventory-account-rows">
      ${entries.map(entry => `
        <div class="inventory-account-row">
          <span class="inventory-row-icon">${entry.type === "asset" ? "◉" : "▤"}</span>
          <span class="inventory-account-name">
            <strong>${escapeHTML(entry.name)}</strong>
            <small>${escapeHTML(entry.category)}${entry.mobileType ? ` · ${escapeHTML(entry.mobileType)}` : ""} · ${entry.type === "asset" ? "Asset" : "Liability"}</small>
            ${entry.mobileReference ? `<small class="inventory-account-notes">${escapeHTML(entry.mobileReference)}</small>` : ""}
            ${entry.notes ? `<small class="inventory-account-notes">${escapeHTML(entry.notes)}</small>` : ""}
            ${entry.loan ? `<span class="loan-metrics">
              <span><small>LENDER / TYPE</small><b>${escapeHTML(entry.loan.lenderType)}</b></span>
              <span><small>OUTSTANDING PRINCIPAL</small><b>${formatKsh(entry.amount)}</b></span>
              <span><small>INTEREST (APR / TYPE)</small><b>${escapeHTML(formatLoanRate(entry.loan))}</b></span>
              <span><small>MIN. MONTHLY INSTALLMENT</small><b>${entry.loan.minInstallment === null ? "Not set" : formatKsh(entry.loan.minInstallment) + "/mo"}</b></span>
              <span><small>REMAINING TENURE</small><b>${escapeHTML(formatLoanTenure(entry.loan))}</b></span>
            </span>` : ""}
            ${(() => {
              const y = entry.type === "asset" ? getAssetYield(entry) : null;
              if (!y) return "";
              const r = entry.returns;
              const rate = v => `${Math.round(v * 100) / 100}%`;
              return `<span class="loan-metrics asset-metrics">
                <span><small>CATEGORY / LOCATION</small><b>${escapeHTML(entry.category)}</b></span>
                <span><small>OUTSTANDING BALANCE</small><b>${formatKsh(entry.amount)}</b></span>
                <span><small>EXPECTED RETURN</small><b>${rate(y.gross)} gross · ${rate(y.net)} net${y.taxFree ? " (tax-free)" : ""}</b></span>
                <span><small>COMPOUNDING / LIQUIDITY</small><b>${escapeHTML(r.compounding || "Not set")} · ${escapeHTML(r.liquidity || "Not set")}</b></span>
                <span><small>MONTHLY PASSIVE YIELD</small><b>${formatKsh(y.monthly)}/mo</b></span>
              </span>`;
            })()}
          </span>
          <strong class="inventory-account-amount">${formatKsh(entry.amount)}</strong>
          <button class="inventory-row-edit" type="button" data-edit-entry="${escapeHTML(entry.id)}" aria-label="Edit ${escapeHTML(entry.name)}" title="Edit item">Edit</button>
          <button class="inventory-delete" type="button" data-delete-entry="${escapeHTML(entry.id)}" aria-label="Delete ${escapeHTML(entry.name)}" title="Delete item">×</button>
        </div>`).join("")}
    </div>`;
}

function renderInventoryPage() {
  const entries = getInventoryEntries();
  const totals = getInventoryTotals();

  return `
    <section class="inventory-page">
      <header class="inventory-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-line"></span> YOUR BALANCE SHEET</div>
          <h1>Your financial<br><em>inventory.</em></h1>
          <p class="welcome-sub">One clear view of what you own, what you owe, and your net worth.</p>
        </div>
        <button class="inventory-action" type="button" data-inventory-action="add-account">
          ${plusIcon} Add an account
        </button>
      </header>

      <section class="inventory-summary" aria-label="Balance sheet summary">
        <article class="inventory-summary-card">
          <span class="inventory-label">TOTAL ASSETS</span>
          <strong>${formatKsh(totals.assets)}</strong>
          <span class="inventory-note">Across all asset categories</span>
        </article>
        <article class="inventory-summary-card">
          <span class="inventory-label">TOTAL LIABILITIES</span>
          <strong>${formatKsh(totals.liabilities)}</strong>
          <span class="inventory-note">Across all debts and obligations</span>
        </article>
        <article class="inventory-summary-card net-worth-summary">
          <span class="inventory-label">NET WORTH</span>
          <strong>${formatKsh(totals.netWorth)}</strong>
          <span class="inventory-note">Assets minus liabilities</span>
        </article>
      </section>

      <section class="inventory-columns" aria-label="Assets and liabilities">
        <article class="panel inventory-list-panel phone-collapsible">
          <div class="panel-heading">
            <div><div class="section-kicker">WHAT YOU OWN</div><h2>Assets</h2></div>
            <button class="phone-panel-toggle" type="button" aria-expanded="false" aria-label="Expand section details"><span class="toggle-text">Show</span>${chevronIcon}</button>
            <button class="inventory-add-small" type="button" data-inventory-action="add-asset" aria-label="Add asset">${plusIcon}<span class="add-label">Add asset</span></button>
          </div>
          <div class="phone-collapsible-content"><div class="inventory-rows">${renderInventoryRows("asset", assetCategories)}</div>
          <div class="inventory-panel-total"><span>Total assets</span><strong>${formatKsh(totals.assets)}</strong></div></div>
        </article>

        <article class="panel inventory-list-panel phone-collapsible">
          <div class="panel-heading">
            <div><div class="section-kicker">WHAT YOU OWE</div><h2>Liabilities</h2></div>
            <button class="phone-panel-toggle" type="button" aria-expanded="false" aria-label="Expand section details"><span class="toggle-text">Show</span>${chevronIcon}</button>
            <button class="inventory-add-small" type="button" data-inventory-action="add-liability" aria-label="Add liability">${plusIcon}<span class="add-label">Add liability</span></button>
          </div>
          <div class="phone-collapsible-content"><div class="inventory-rows">${renderInventoryRows("liability", liabilityCategories)}</div>
          <div class="inventory-panel-total"><span>Total liabilities</span><strong>${formatKsh(totals.liabilities)}</strong></div></div>
        </article>
      </section>

      <section class="panel inventory-accounts">
        <div class="panel-heading">
          <div><div class="section-kicker">CONNECTED FINANCES</div><h2>Accounts</h2></div>
          <span class="inventory-account-count">${entries.length} ${entries.length === 1 ? "item" : "items"}</span>
        </div>
        ${renderAccountRows(entries)}
      </section>
    </section>
    ${renderAppFooter()}`;
}

function updateDashboardInventorySummary() {
  const entries = getInventoryEntries();
  const totals = getInventoryTotals();
  const netWorthValue = document.querySelector(".networth-card .metric-value");
  const assetTotal = document.querySelector(".donut-center strong");

  if (netWorthValue) netWorthValue.textContent = formatKsh(totals.netWorth);
  if (assetTotal) assetTotal.textContent = formatKsh(totals.assets);

  const allocations = [
    { label: "Investments", categories: ["Investments"] },
    { label: "Cash", categories: ["Bank accounts", "Mobile money", "Cash & savings"] },
    { label: "Retirement", categories: [] },
    { label: "Other", categories: ["Property & vehicles", "Other assets"] }
  ].map(allocation => {
    const value = entries
      .filter(entry => entry.type === "asset" && allocation.categories.includes(entry.category))
      .reduce((total, entry) => total + Number(entry.amount || 0), 0);

    return { ...allocation, value };
  });

  document.querySelectorAll(".allocation-legend > div").forEach((row, index) => {
    const allocation = allocations[index];
    if (!allocation) return;

    const value = row.querySelector("strong");
    const share = row.querySelector("small");
    if (value) value.textContent = formatKsh(allocation.value);
    if (share) {
      const percentage = totals.assets > 0
        ? Math.round((allocation.value / totals.assets) * 100)
        : 0;
      share.textContent = percentage + "%";
    }
  });

  const donut = document.querySelector(".donut");
  if (donut && totals.assets > 0) {
    const colors = ["oklch(.54 .11 var(--accent-hue))", "oklch(.68 .10 var(--accent-hue))", "oklch(.79 .07 var(--accent-hue))", "oklch(.89 .04 var(--accent-hue))"];
    let position = 0;
    const stops = allocations.map((allocation, index) => {
      const start = position;
      position += (allocation.value / totals.assets) * 100;
      return `${colors[index]} ${start}% ${position}%`;
    });
    donut.style.background = `conic-gradient(${stops.join(", ")})`;
  } else if (donut) {
    donut.style.background = "conic-gradient(#e2e8e4 0 100%)";
  }
}

function updateDashboardPowerUpSummary() {
  const totals = getPowerUpReportTotals();
  const period = getReportPeriod();
  const periodLabel = period === "Year to date" ? "YTD" : period.toUpperCase();
  const periodButton = document.querySelector(".period-button");
  if (periodButton) periodButton.innerHTML = `${getReportPeriod()} <svg class="dropdown-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>`;
  const metricCards = document.querySelectorAll(".metric-card");
  const incomeCard = metricCards[1];
  const savingsCard = metricCards[2];
  const spendingCard = metricCards[3];

  if (incomeCard) {
    incomeCard.querySelector(".metric-heading span").textContent = `${periodLabel} INCOME`;
    incomeCard.querySelector(".metric-value").textContent = formatKsh(totals.reportIncome);
    incomeCard.querySelector(".metric-foot .muted").textContent = "Recorded income sources";
    incomeCard.querySelector(".metric-trailing").textContent = "TOTAL";
  }

  const savingsRate = totals.reportIncome > 0
    ? Math.round((totals.cashAfterSpending / totals.reportIncome) * 1000) / 10
    : 0;
  if (savingsCard) {
    savingsCard.querySelector(".metric-value").textContent = savingsRate + "%";
    savingsCard.querySelector(".positive-pill").textContent = totals.cashAfterSpending < 0 ? "DEFICIT" : "ACTUAL";
    savingsCard.querySelector(".positive-pill").classList.toggle("is-deficit", totals.cashAfterSpending < 0);
    savingsCard.querySelector(".muted").textContent = "income less recorded spending";
  }

  if (spendingCard) {
    spendingCard.querySelector(".metric-heading span").textContent = `${periodLabel} SPENDING`;
    spendingCard.querySelector(".metric-value").textContent = formatKsh(totals.spending);
    spendingCard.querySelector(".metric-foot .muted").textContent =
      `Of ${formatKsh(totals.reportBudget)} budget`;
    spendingCard.querySelector(".metric-trailing").textContent =
      `${totals.reportBudget > 0 ? Math.round((totals.spending / totals.reportBudget) * 100) : 0}%`;
    spendingCard.querySelector(".metric-caption .under-budget").textContent =
      formatKsh(Math.abs(totals.cashAfterSpending));
    const caption = spendingCard.querySelector(".metric-caption");
    if (caption) caption.lastChild.textContent = totals.cashAfterSpending < 0 ? " over income" : " left after spending";
    spendingCard.querySelector(".metric-caption .under-budget").classList.toggle("is-deficit", totals.cashAfterSpending < 0);
    const progress = spendingCard.querySelector(".spend-progress");
    if (progress) progress.style.width = `${totals.reportBudget > 0 ? Math.min(100, (totals.spending / totals.reportBudget) * 100) : 0}%`;
  }

  updateDashboardCashflowChart(totals);
}

function updateDashboardCashflowChart(totals = getPowerUpTotals()) {
  const chart = document.querySelector(".cashflow-panel");
  if (!chart) return;

  const maximum = Math.max(totals.reportIncome, totals.spending);
  const scale = maximum > 0
    ? Math.ceil(maximum / (10 ** Math.floor(Math.log10(maximum)))) * (10 ** Math.floor(Math.log10(maximum)))
    : 0;
  const currentGroup = chart.querySelector(".bar-group.current");
  const groups = [...chart.querySelectorAll(".bar-group")];
  const monthLabels = [...chart.querySelectorAll(".x-labels span")];
  const visibleEnd = new Date(`${getReportMonth()}-01T12:00:00`);
  monthLabels.forEach((label, index) => {
    const labelDate = new Date(visibleEnd.getFullYear(), visibleEnd.getMonth() - (monthLabels.length - index - 1), 1);
    label.textContent = labelDate.toLocaleDateString(undefined, { month: "short" });
  });
  groups.forEach(group => {
    const isCurrent = group === currentGroup;
    const income = isCurrent ? totals.reportIncome : 0;
    const spending = isCurrent ? totals.spending : 0;
    const incomeBar = group.querySelector(".bar.income");
    const spendingBar = group.querySelector(".bar.expense");
    if (incomeBar) incomeBar.style.height = `${scale ? (income / scale) * 100 : 0}%`;
    if (spendingBar) spendingBar.style.height = `${scale ? (spending / scale) * 100 : 0}%`;
    const month = isCurrent ? reportMonthLabel() : (monthLabels[groups.indexOf(group)]?.textContent || "Month");
    group.dataset.tooltip = `${month} · Income ${formatKsh(income)} · Spending ${formatKsh(spending)}`;
    group.title = `${month}: income ${formatKsh(income)}, spending ${formatKsh(spending)}`;
    group.setAttribute("aria-label", group.title);
  });

  chart.querySelectorAll(".y-labels span").forEach((label, index, labels) => {
    const value = scale ? scale * (1 - index / (labels.length - 1)) : 0;
    label.textContent = formatKsh(value);
  });
  const netValue = chart.querySelector(".chart-total strong");
  if (netValue) {
    const net = totals.cashAfterSpending;
    netValue.textContent = `${net >= 0 ? "+" : "−"}${formatKsh(Math.abs(net))}`;
  }
}

// Refresh the visible financial page after one of its saved records changes.
function reportMonthLabel() {
  if (getReportPeriod() === "Year to date") return "YTD";
  return new Date(`${getReportMonth()}-01T12:00:00`).toLocaleDateString(undefined, { month: "short" });
}

function refreshFinancialPage() {
  if (crumb.textContent === "Dashboard") {
    content.innerHTML = dashboardMarkup;
    restoreCashflowChartState();
    updateDashboardWelcome();
    updateDashboardInventorySummary();
    updateDashboardPowerUpSummary();
    updateDashboardQuests();
  } else if (crumb.textContent === "Power-Up") {
    content.innerHTML = renderPowerUpPage();
    updateDashboardPowerUpSummary();
  } else if (crumb.textContent === "Quests") {
    content.innerHTML = renderQuestsPage();
  }
}

// Dialog builders collect or edit financial records without leaving the current page.
function openInventoryDialog(action, editId = null) {
  const editing = editId ? getInventoryEntries().find(item => item.id === editId) : null;
  const fixedType = action === "add-asset"
    ? "asset"
    : action === "add-liability"
      ? "liability"
      : null;
  const dialog = document.createElement("dialog");
  dialog.className = "inventory-dialog";

  const typeField = fixedType
    ? `<input type="hidden" name="type" value="${fixedType}">
       <div class="inventory-form-field">
         <span>Type</span>
         <strong>${fixedType === "asset" ? "Asset" : "Liability"}</strong>
       </div>`
    : `<label class="inventory-form-field">
         <span>Type</span>
         <select name="type" id="inventory-entry-type">
           <option value="asset">Asset</option>
           <option value="liability">Liability</option>
         </select>
       </label>`;

  dialog.innerHTML = `
    <form class="inventory-form">
      <header class="inventory-dialog-heading">
        <div>
          <span class="section-kicker">YOUR BALANCE SHEET</span>
          <h2>${editing ? "Edit inventory item" : "Add an inventory item"}</h2>
        </div>
        <button class="inventory-dialog-close" type="button" aria-label="Close dialog">×</button>
      </header>
      <div class="inventory-form-fields">
        ${typeField}
        <label class="inventory-form-field">
          <span>Name</span>
          <input name="name" type="text" maxlength="60" placeholder="e.g. Main savings account" required>
        </label>
        <label class="inventory-form-field">
          <span>Category</span>
          <select name="category" id="inventory-entry-category" required></select>
        </label>
        <div class="inventory-form-fields mobile-money-fields" hidden>
          <label class="inventory-form-field"><span>Mobile account type</span><select name="mobileType"><option>Mobile wallet</option><option>Till</option><option>Paybill</option></select></label>
          <label class="inventory-form-field"><span>Phone, Till or Paybill number <small>Optional</small></span><input name="mobileReference" type="text" maxlength="60" placeholder="e.g. 07xx xxx xxx or 123456"></label>
        </div>
        <label class="inventory-form-field">
          <span id="inventory-amount-label">Current balance (KSh)</span>
          <input name="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" required>
        </label>
        <div class="inventory-form-fields asset-fields">
          <div class="liability-rate-row">
            <label class="inventory-form-field"><span>Expected annual return (% gross)</span><input name="grossRate" type="number" min="0" step="0.01" inputmode="decimal" placeholder="e.g. 11.5"></label>
            <label class="inventory-form-field"><span>Tax treatment</span><select name="taxTreatment"><option value="taxable">Taxable (15% withholding)</option><option value="exempt">Tax-free (e.g. infrastructure bond)</option></select></label>
          </div>
          <div class="liability-rate-row">
            <label class="inventory-form-field"><span>Compounding</span><select name="compounding">${compoundingFrequencies.map(item => `<option>${item}</option>`).join("")}</select></label>
            <label class="inventory-form-field"><span>Liquidity tier</span><select name="liquidity">${liquidityTiers.map(item => `<option>${item}</option>`).join("")}</select></label>
          </div>
          <small class="liability-hint asset-net-hint">Optional. Leave the return blank for assets that earn nothing; NetraOS works out net yield and monthly passive income.</small>
        </div>
        <div class="inventory-form-fields liability-fields" hidden>
          <label class="inventory-form-field"><span>Lender / type</span><select name="lenderType">${lenderTypes.map(type => `<option>${type}</option>`).join("")}</select></label>
          <div class="liability-rate-row">
            <label class="inventory-form-field"><span>Interest rate (%)</span><input name="interestRate" type="number" min="0" step="0.01" inputmode="decimal" placeholder="e.g. 14"></label>
            <label class="inventory-form-field"><span>Rate type</span><select name="rateType">${interestRateTypes.map(type => `<option>${type}</option>`).join("")}</select></label>
          </div>
          <label class="inventory-form-field"><span>Minimum monthly installment (KSh)</span><input name="minInstallment" type="number" min="0" step="0.01" inputmode="decimal" placeholder="e.g. 8500"></label>
          <div class="liability-rate-row">
            <label class="inventory-form-field"><span>Months remaining</span><input name="tenureMonths" type="number" min="0" step="1" inputmode="numeric" placeholder="e.g. 18"></label>
            <label class="inventory-form-field"><span>Or target payoff date</span><input name="payoffDate" type="date"></label>
          </div>
          <small class="liability-hint">Enter months remaining or a payoff date; the other is worked out for you.</small>
        </div>
        <label class="inventory-form-field">
          <span>Notes <small>Optional</small></span>
          <textarea name="notes" rows="3" maxlength="500" placeholder="Add a note about this item"></textarea>
        </label>
      </div>
      <footer class="inventory-dialog-actions">
        <button class="inventory-cancel" type="button">Cancel</button>
        <button class="inventory-submit" type="submit">${editing ? "Save changes" : "Save item"}</button>
      </footer>
    </form>`;

  document.body.append(dialog);
  const form = dialog.querySelector(".inventory-form");
  const typeSelect = dialog.querySelector("#inventory-entry-type");
  const categorySelect = dialog.querySelector("#inventory-entry-category");

  function applyAssetDefaults() {
    const defaults = assetCategoryDefaults[categorySelect.value];
    if (!defaults) return;
    form.elements.compounding.value = defaults.compounding;
    form.elements.liquidity.value = defaults.liquidity;
  }

  function refreshCategories() {
    // The type is a <select> on "Add an account" but a hidden input on
    // "Add asset" / "Add liability", so read it from whichever exists.
    const entryType = fixedType || typeSelect?.value || "asset";
    const categories = entryType === "liability"
      ? liabilityCategories
      : assetCategories;
    categorySelect.innerHTML = categories
      .map(category => `<option value="${category.name}">${category.name}</option>`)
      .join("");
    dialog.querySelector(".mobile-money-fields").hidden = categorySelect.value !== "Mobile money";
    const isLiability = entryType === "liability";
    dialog.querySelector(".liability-fields").hidden = !isLiability;
    dialog.querySelector(".asset-fields").hidden = isLiability;
    applyAssetDefaults();
    dialog.querySelector("#inventory-amount-label").textContent = isLiability ? "Current outstanding principal (KSh)" : "Current balance (KSh)";
    dialog.querySelector("h2").textContent = editing ? "Edit " + (isLiability ? "liability" : "asset") : isLiability ? "Add a liability" : "Add an inventory item";
  }

  refreshCategories();
  if (editing) {
    form.elements.type.value = editing.type;
    refreshCategories();
    form.elements.name.value = editing.name || "";
    form.elements.category.value = editing.category || "";
    form.elements.amount.value = editing.amount ?? "";
    form.elements.mobileType.value = editing.mobileType || "Mobile wallet";
    form.elements.mobileReference.value = editing.mobileReference || "";
    form.elements.notes.value = editing.notes || "";
    if (editing.loan) {
      form.elements.lenderType.value = editing.loan.lenderType || lenderTypes[0];
      form.elements.interestRate.value = editing.loan.interestRate ?? "";
      form.elements.rateType.value = editing.loan.rateType || interestRateTypes[0];
      form.elements.minInstallment.value = editing.loan.minInstallment ?? "";
      form.elements.tenureMonths.value = editing.loan.tenureMonths ?? "";
      form.elements.payoffDate.value = editing.loan.payoffDate || "";
    }
    if (editing.returns) {
      form.elements.grossRate.value = editing.returns.grossRate ?? "";
      form.elements.taxTreatment.value = editing.returns.taxFree ? "exempt" : "taxable";
      form.elements.compounding.value = editing.returns.compounding || compoundingFrequencies[0];
      form.elements.liquidity.value = editing.returns.liquidity || liquidityTiers[0];
    }
  }
  typeSelect?.addEventListener("change", refreshCategories);
  categorySelect.addEventListener("change", () => {
    dialog.querySelector(".mobile-money-fields").hidden = categorySelect.value !== "Mobile money";
    applyAssetDefaults();
  });
  dialog.querySelector(".inventory-dialog-close").addEventListener("click", () => dialog.close());
  dialog.querySelector(".inventory-cancel").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const formData = new FormData(form);
    const amount = Number(formData.get("amount"));
    const name = String(formData.get("name") || "").trim();

    if (!name || !Number.isFinite(amount) || amount < 0) return;

    const entryType = String(formData.get("type"));
    let loan = null;
    if (entryType === "liability") {
      const rateRaw = String(formData.get("interestRate") || "").trim();
      const installmentRaw = String(formData.get("minInstallment") || "").trim();
      const monthsRaw = String(formData.get("tenureMonths") || "").trim();
      let payoffDate = String(formData.get("payoffDate") || "");
      let tenureMonths = monthsRaw === "" ? null : Math.round(Number(monthsRaw));
      const interestRate = rateRaw === "" ? null : Number(rateRaw);
      const minInstallment = installmentRaw === "" ? null : Number(installmentRaw);
      if ([interestRate, minInstallment, tenureMonths].some(value => value !== null && (!Number.isFinite(value) || value < 0))) {
        showToast("Interest, installment and months must be zero or more.");
        return;
      }
      if (payoffDate && payoffDate <= localDateValue()) {
        showToast("Choose a payoff date in the future.");
        return;
      }
      if (tenureMonths === null && payoffDate) tenureMonths = monthsUntil(payoffDate);
      else if (tenureMonths !== null && !payoffDate && tenureMonths > 0) payoffDate = addMonthsToToday(tenureMonths);
      loan = {
        lenderType: String(formData.get("lenderType") || "Other"),
        interestRate,
        rateType: String(formData.get("rateType") || interestRateTypes[0]),
        minInstallment,
        tenureMonths,
        payoffDate
      };
    }

    let returns = null;
    if (entryType === "asset") {
      const grossRaw = String(formData.get("grossRate") || "").trim();
      const grossRate = grossRaw === "" ? null : Number(grossRaw);
      if (grossRate !== null && (!Number.isFinite(grossRate) || grossRate < 0 || grossRate > 100)) {
        showToast("Expected return must be between 0% and 100%.");
        return;
      }
      if (grossRate !== null) {
        returns = {
          grossRate,
          taxFree: formData.get("taxTreatment") === "exempt",
          compounding: String(formData.get("compounding") || compoundingFrequencies[0]),
          liquidity: String(formData.get("liquidity") || liquidityTiers[0])
        };
      }
    }

    const entries = getInventoryEntries();
    const updatedEntry = {
      id: editing?.id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: entryType,
      name,
      category: String(formData.get("category")),
      amount,
      mobileType: String(formData.get("category") === "Mobile money" ? formData.get("mobileType") || "Mobile wallet" : ""),
      mobileReference: String(formData.get("category") === "Mobile money" ? formData.get("mobileReference") || "" : "").trim(),
      notes: String(formData.get("notes") || "").trim(),
      ...(loan ? { loan } : {}),
      ...(returns ? { returns } : {})
    };
    const existingIndex = entries.findIndex(entry => entry.id === updatedEntry.id);
    if (existingIndex >= 0) entries[existingIndex] = updatedEntry;
    else entries.push(updatedEntry);

    try {
      saveInventoryEntries(entries);
    } catch {
      showToast("Unable to save this item in browser storage.");
      return;
    }

    dialog.close();
    dialog.remove();
    content.innerHTML = renderInventoryPage();
    showToast(editing ? `${name} updated.` : `${name} added to your inventory.`);
  });

  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  dialog.querySelector('input[name="name"]').focus();
}

function openPowerUpDialog(kind, editId = null) {
  const dataAtOpen = getPowerUpData();
  const targetList = kind === "income" ? "incomes" : kind === "spending" ? "spending" : "budgets";
  const editing = editId ? dataAtOpen[targetList].find(item => item.id === editId) : null;
  const isIncome = kind === "income";
  const isSpending = kind === "spending";
  const dialog = document.createElement("dialog");
  dialog.className = "inventory-dialog";
  dialog.innerHTML = `
    <form class="inventory-form">
      <header class="inventory-dialog-heading">
        <div>
          <span class="section-kicker">${isIncome ? "MONEY COMING IN" : isSpending ? "MONEY SPENT" : "MONTHLY PLAN"}</span>
          <h2>${editing ? "Edit " + (isIncome ? "income source" : isSpending ? "spending" : "budget line") : isIncome ? "Add an income source" : isSpending ? "Record monthly spending" : "Add a budget line"}</h2>
        </div>
        <button class="inventory-dialog-close" type="button" aria-label="Close dialog">×</button>
      </header>
      <div class="inventory-form-fields">
        <label class="inventory-form-field">
          <span>${isIncome ? "Source name" : isSpending ? "Expense name" : "Budget name"}</span>
          <input name="name" type="text" maxlength="60" placeholder="${isIncome ? "e.g. Salary" : isSpending ? "e.g. Groceries" : "e.g. Rent"}" required>
        </label>
        ${isIncome ? "" : `<label class="inventory-form-field">
          <span>Category</span>
          <select name="category" required>${budgetCategories.map(category => `<option value="${category}">${category}</option>`).join("")}</select>
        </label>`}
        ${isSpending ? `<label class="inventory-form-field">
          <span>Month</span>
          <input name="month" type="month" value="${getReportMonth()}" required>
        </label>` : ""}
        <label class="inventory-form-field">
          <span>Monthly amount (KSh)</span>
          <input name="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" required>
        </label>
        <label class="inventory-form-field">
          <span>Notes <small>Optional</small></span>
          <textarea name="notes" rows="3" maxlength="500" placeholder="Add a note"></textarea>
        </label>
      </div>
      <footer class="inventory-dialog-actions">
        <button class="inventory-cancel" type="button">Cancel</button>
        <button class="inventory-submit" type="submit">${editing ? "Save changes" : "Save " + (isIncome ? "income" : isSpending ? "spending" : "budget")}</button>
      </footer>
    </form>`;

  document.body.append(dialog);
  const form = dialog.querySelector(".inventory-form");
  if (editing) {
    form.elements.name.value = editing.name || "";
    if (form.elements.category) form.elements.category.value = editing.category || budgetCategories[0];
    if (form.elements.month) form.elements.month.value = editing.month || getReportMonth();
    form.elements.amount.value = editing.amount ?? "";
    form.elements.notes.value = editing.notes || "";
  }
  dialog.querySelector(".inventory-dialog-close").addEventListener("click", () => dialog.close());
  dialog.querySelector(".inventory-cancel").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const amount = Number(formData.get("amount"));
    if (!name || !Number.isFinite(amount) || amount < 0) return;

    const data = getPowerUpData();
    const entry = {
      id: editing?.id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      amount,
      notes: String(formData.get("notes") || "").trim()
    };
    const savedEntry = isIncome ? entry : isSpending ? { ...entry, month: String(formData.get("month") || getReportMonth()), category: String(formData.get("category")) } : { ...entry, category: String(formData.get("category")) };
    const entryIndex = data[targetList].findIndex(item => item.id === savedEntry.id);
    if (entryIndex >= 0) data[targetList][entryIndex] = savedEntry;
    else data[targetList].push(savedEntry);

    try {
      savePowerUpData(data);
    } catch {
      showToast("Unable to save this plan in browser storage.");
      return;
    }

    dialog.close();
    refreshFinancialPage();
    showToast(editing ? `${name} updated.` : isSpending ? `${name} recorded as monthly spending.` : `${name} added to your monthly plan.`);
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  dialog.querySelector('input[name="name"]').focus();
}

// Quest and achievement pages show goals, completion celebrations, and earned badges.
function renderQuestsPage() {
  const quests = getQuests();
  const canAddQuest = quests.length < 4;
  const completed = quests.filter(quest => questProgress(quest) === 100).length;
  return `
    <section class="quests-page">
      <header class="inventory-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-line"></span> GOALS WITH MOMENTUM</div>
          <h1>Make progress<br><em>visible.</em></h1>
          <p class="welcome-sub">Keep up to four active quests in motion. Update the amount saved to see your progress.</p>
        </div>
        <button class="inventory-action" type="button" data-quest-action="add" ${canAddQuest ? "" : "disabled"}>
          ${plusIcon} Add a quest
        </button>
      </header>
      <section class="inventory-summary quest-summary" aria-label="Quest summary">
        <article class="inventory-summary-card"><span class="inventory-label">ACTIVE QUESTS</span><strong>${quests.length} / 4</strong><span class="inventory-note">Up to four at a time</span></article>
        <article class="inventory-summary-card"><span class="inventory-label">COMPLETED</span><strong>${completed}</strong><span class="inventory-note">Goals at 100% progress</span></article>
        <article class="inventory-summary-card net-worth-summary"><span class="inventory-label">NEXT STEP</span><strong>${canAddQuest ? "Keep going" : "Quest limit"}</strong><span class="inventory-note">${canAddQuest ? "Add or update a goal" : "Delete a goal to add another"}</span></article>
      </section>
      ${renderMilestonesSummary()}
      <section class="panel quest-page-panel">
        <div class="panel-heading">
          <div><div class="section-kicker">YOUR CURRENT GOALS</div><h2>Active quests</h2></div>
          <span class="inventory-account-count">${quests.length} of 4</span>
        </div>
        <div class="quest-page-list">${renderQuestRows(quests)}</div>
      </section>
    </section>
    ${renderAppFooter()}`;
}

function openQuestDialog(questId = "") {
  const quests = getQuests();
  const quest = quests.find(item => item.id === questId);
  if (questId && !quest) return;
  if (!quest && quests.length >= 4) {
    showToast("You can have up to four active quests. Delete one to make room.");
    return;
  }

  const dialog = document.createElement("dialog");
  dialog.className = "inventory-dialog";
  dialog.innerHTML = `
    <form class="inventory-form">
      <header class="inventory-dialog-heading"><div><span class="section-kicker">GOALS WITH MOMENTUM</span><h2>${quest ? "Update quest progress" : "Create a quest"}</h2></div><button class="inventory-dialog-close" type="button" aria-label="Close dialog">×</button></header>
      <div class="inventory-form-fields">
        <label class="inventory-form-field"><span>Quest name</span><input name="name" type="text" maxlength="60" placeholder="e.g. Emergency fund" value="${escapeHTML(quest?.name || "")}" required></label>
        <div class="liability-rate-row">
          <label class="inventory-form-field"><span>Category</span><select name="category">${questCategories.map(item => `<option ${quest?.category === item ? "selected" : ""}>${item}</option>`).join("")}</select></label>
          <label class="inventory-form-field"><span>Priority tier</span><select name="tier">${questTiers.map(item => `<option value="${item.tier}" ${Number(quest?.tier || 2) === item.tier ? "selected" : ""}>${item.label}</option>`).join("")}</select></label>
        </div>
        <label class="inventory-form-field"><span>Current amount (KSh)</span><input name="current" type="number" min="0" step="0.01" inputmode="decimal" value="${Number(quest?.current || 0)}" required></label>
        <label class="inventory-form-field"><span>Target amount (KSh)</span><input name="target" type="number" min="1" step="0.01" inputmode="decimal" value="${Number(quest?.target || 0) || ""}" required></label>
        <label class="inventory-form-field"><span>Target deadline <small>Optional</small></span><input name="deadline" type="date" value="${escapeHTML(quest?.deadline || "")}"></label>
        <small class="liability-hint">With a deadline, NetraOS works out the monthly amount you need to save and warns you if you fall behind.</small>
      </div>
      <footer class="inventory-dialog-actions"><button class="inventory-cancel" type="button">Cancel</button><button class="inventory-submit" type="submit">${quest ? "Save progress" : "Create quest"}</button></footer>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector(".inventory-form");
  dialog.querySelector(".inventory-dialog-close").addEventListener("click", () => dialog.close());
  dialog.querySelector(".inventory-cancel").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", event => {
    event.preventDefault();
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const current = Number(formData.get("current"));
    const target = Number(formData.get("target"));
    if (!name || !Number.isFinite(current) || !Number.isFinite(target) || current < 0 || target <= 0) return;
    const wasComplete = quest ? questProgress(quest) === 100 : false;
    const deadline = String(formData.get("deadline") || "");
    if (deadline && !quest && deadline <= localDateValue()) {
      showToast("Choose a deadline in the future.");
      return;
    }
    const updatedQuest = {
      ...(quest || {}),
      id: quest?.id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name, current, target,
      category: String(formData.get("category") || questCategories[0]),
      tier: Number(formData.get("tier")) || 2,
      deadline,
      createdAt: quest?.createdAt || new Date().toISOString(),
      startAmount: quest?.startAmount ?? (quest?.createdAt ? 0 : current)
    };
    const updatedQuests = quest ? quests.map(item => item.id === quest.id ? updatedQuest : item) : [...quests, updatedQuest];
    try {
      saveQuests(updatedQuests);
    } catch {
      showToast("Unable to save this quest in browser storage.");
      return;
    }
    dialog.close();
    refreshFinancialPage();
    if (!wasComplete && questProgress(updatedQuest) === 100) {
      celebrateQuestCompletion(name);
      const next = getMilestonesEngine(updatedQuests).top;
      if (next) {
        const need = questPace(next).required;
        window.setTimeout(() => showToast(`Overflow: re-route this monthly saving to ${next.name}${need !== null ? ` (needs ${formatKsh(Math.ceil(need))}/mo)` : ""}.`), 1200);
      }
    }
    else showToast(quest ? "Quest progress updated." : `${name} added to your quests.`);
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  dialog.querySelector('input[name="name"]').focus();
}

function celebrateQuestCompletion(name) {
  const settings = getStoredSettings();
  if (settings.questSounds && globalThis.AudioContext) {
    try {
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 740;
      gain.gain.setValueAtTime(0.07, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.22);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.22);
      oscillator.onended = () => audio.close();
    } catch { /* Sound is optional and must not interrupt quest progress. */ }
  }
  if (!settings.questAnimations || settings.reduceMotion) {
    showToast(`${name} completed.`);
    return;
  }
  document.querySelector(".quest-celebration")?.remove();
  const celebration = document.createElement("div");
  celebration.className = "quest-celebration";
  celebration.setAttribute("role", "status");
  celebration.setAttribute("aria-live", "polite");
  const particles = Array.from({ length: 14 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 14;
    const distance = 28 + (index % 3) * 8;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    return `<i style="--particle-x:${x.toFixed(1)}px;--particle-y:${y.toFixed(1)}px;--particle-delay:${(index % 4) * 35}ms"></i>`;
  }).join("");
  celebration.innerHTML = `
    <div class="quest-celebration-particles" aria-hidden="true">${particles}</div>
    <span class="quest-celebration-badge" aria-hidden="true">✦</span>
    <span class="quest-celebration-copy"><small>MILESTONE UNLOCKED</small><strong data-celebrated-quest></strong><span>Quest complete · 100%</span></span>
    <span class="quest-celebration-check" aria-hidden="true">✓</span>`;
  celebration.querySelector("[data-celebrated-quest]").textContent = name;
  document.body.append(celebration);
  requestAnimationFrame(() => celebration.classList.add("is-visible"));
  window.setTimeout(() => celebration.remove(), 4600);
}

function deleteQuest(button) {
  const id = button.dataset.deleteQuest;
  if (!id) return;
  try {
    const quests = getQuests().filter(quest => quest.id !== id);
    saveQuests(quests);
    recordSecurityAudit("Removed a savings quest");
    refreshFinancialPage();
    showToast("Quest removed.");
  } catch {
    showToast("Unable to update browser storage.");
  }
}

function renderStatsPage() {
  const inventory = getInventoryEntries();
  const power = getPowerUpData();
  const reportSpending = spendingForReport(power.spending);
  const totals = getPowerUpTotals();
  const balance = getInventoryTotals();
  const quests = getQuests();
  const savingsRate = totals.reportIncome > 0
    ? Math.round((totals.cashAfterSpending / totals.reportIncome) * 1000) / 10
    : 0;
  const categories = budgetCategories.map(category => {
    const planned = power.budgets.filter(item => item.category === category)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0) * totals.reportMonths;
    const spent = reportSpending.filter(item => item.category === category)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return { category, planned, spent };
  }).filter(item => item.planned > 0 || item.spent > 0);
  const maxCategory = Math.max(1, ...categories.map(item => Math.max(item.planned, item.spent)));
  const assetMix = assetCategories.map(category => ({
    name: category.name,
    value: inventory.filter(item => item.type === "asset" && item.category === category.name)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0)
  }));
  const maxAsset = Math.max(1, ...assetMix.map(item => item.value));
  const categoryRows = categories.length
    ? categories.map(item => `
        <div class="stats-category-row">
          <div class="stats-category-heading"><strong>${escapeHTML(item.category)}</strong><span>${formatKsh(item.spent)} <small>spent</small></span></div>
          <div class="stats-pair-bars"><i class="planned-bar" style="width:${Math.round((item.planned / maxCategory) * 100)}%"></i><i class="spent-bar" style="width:${Math.round((item.spent / maxCategory) * 100)}%"></i></div>
          <small class="stats-planned-label">${formatKsh(item.planned)} planned</small>
        </div>`).join("")
    : `<div class="stats-empty">Add budget lines and spending records in Power-Up to see a category comparison.</div>`;
  const assetRows = assetMix.map(item => `
      <div class="stats-asset-row">
        <span>${escapeHTML(item.name)}</span>
        <div class="stats-single-track"><i style="width:${Math.round((item.value / maxAsset) * 100)}%"></i></div>
        <strong>${formatKsh(item.value)}</strong>
      </div>`).join("");
  const monthly = [
    { label: "Period income", value: totals.reportIncome, color: "income" },
    { label: "Period budget", value: totals.reportBudget, color: "planned" },
    { label: "Period spending", value: totals.spending, color: "spent" },
    { label: "After spending", value: totals.cashAfterSpending, color: "remaining" }
  ];
  const maxMonthly = Math.max(1, ...monthly.map(item => Math.abs(item.value)));
  const monthlyRows = monthly.map(item => `
      <div class="stats-monthly-row">
        <div><span>${item.label}</span><strong>${formatKsh(item.value)}</strong></div>
        <div class="stats-single-track"><i class="${item.color}" style="width:${Math.min(100, Math.round((Math.abs(item.value) / maxMonthly) * 100))}%"></i></div>
      </div>`).join("");

  return `
    <section class="stats-page">
      <header class="inventory-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-line"></span> YOUR FINANCIAL SIGNALS</div>
          <h1>See the full<br><em>pattern.</em></h1>
          <p class="welcome-sub">A live snapshot of your balances and monthly plan, based on the information you’ve entered.</p>
        </div>
        <button class="inventory-action secondary" type="button" data-jump="Power-Up">＋ Update monthly plan</button>
      </header>
      <section class="inventory-summary stats-summary" aria-label="Financial statistics">
        <article class="inventory-summary-card net-worth-summary"><span class="inventory-label">NET WORTH</span><strong>${formatKsh(balance.netWorth)}</strong><span class="inventory-note">Assets less liabilities</span></article>
        <article class="inventory-summary-card"><span class="inventory-label">PERIOD INCOME</span><strong>${formatKsh(totals.reportIncome)}</strong><span class="inventory-note">${power.incomes.length} income ${power.incomes.length === 1 ? "source" : "sources"}</span></article>
        <article class="inventory-summary-card"><span class="inventory-label">PERIOD SPENDING</span><strong>${formatKsh(totals.spending)}</strong><span class="inventory-note">${reportSpending.length} recorded ${reportSpending.length === 1 ? "expense" : "expenses"}</span></article>
        <article class="inventory-summary-card"><span class="inventory-label">AFTER SPENDING</span><strong>${formatKsh(totals.cashAfterSpending)}</strong><span class="inventory-note">${savingsRate}% of period income</span></article>
      </section>
      <section class="stats-panels">
        <article class="panel stats-panel">
          <div class="panel-heading"><div><div class="section-kicker">${escapeHTML(getReportPeriod().toUpperCase())} OVERVIEW</div><h2>Income &amp; outflow</h2></div><span class="inventory-account-count">${escapeHTML(reportMonthLabel())}</span></div>
          <div class="stats-monthly-list">${monthlyRows}</div>
        </article>
        <article class="panel stats-panel">
          <div class="panel-heading"><div><div class="section-kicker">SPENDING BREAKDOWN</div><h2>Budget vs. actual</h2></div><span class="inventory-account-count">${categories.length} categories</span></div>
          <div class="stats-category-list">${categoryRows}</div>
          <div class="stats-legend"><span><i class="planned-bar"></i>Planned</span><span><i class="spent-bar"></i>Spent</span></div>
        </article>
        <article class="panel stats-panel">
          <div class="panel-heading"><div><div class="section-kicker">WHAT YOU OWN</div><h2>Asset mix</h2></div><span class="inventory-account-count">${inventory.filter(item => item.type === "asset").length} assets</span></div>
          <div class="stats-asset-list">${assetRows}</div>
          <div class="inventory-panel-total"><span>Total assets</span><strong>${formatKsh(balance.assets)}</strong></div>
        </article>
        <article class="panel stats-panel">
          <div class="panel-heading"><div><div class="section-kicker">GOALS WITH MOMENTUM</div><h2>Quest progress</h2></div><span class="inventory-account-count">${quests.length} of 4</span></div>
          <div class="stats-quest-list">${quests.length ? quests.map(quest => `<div class="stats-quest-row"><span>${escapeHTML(quest.name)}</span><strong>${questProgress(quest)}%</strong><div class="quest-track"><i style="width:${questProgress(quest)}%"></i></div></div>`).join("") : `<div class="stats-empty">No active quests. Create a goal on the Quests page to track progress here.</div>`}</div>
        </article>
      </section>
    </section>
    ${renderAppFooter()}`;
}

function renderAchievementsPage() {
  const inventory = getInventoryEntries();
  const power = getPowerUpData();
  const totals = getPowerUpTotals();
  const balance = getInventoryTotals();
  const quests = getQuests();
  const highestQuestProgress = quests.reduce((highest, quest) => Math.max(highest, questProgress(quest)), 0);
  const milestones = [
    { id: "first-asset", icon: "◉", name: "First asset recorded", detail: "Add your first asset to Inventory.", progress: inventory.some(item => item.type === "asset") ? 1 : 0, target: 1 },
    { id: "monthly-plan", icon: "▤", name: "A plan in place", detail: "Add at least one income source and one budget line.", progress: Math.min(2, Number(power.incomes.length > 0) + Number(power.budgets.length > 0)), target: 2 },
    { id: "spending-tracked", icon: "↗", name: "Spending tracked", detail: "Record your first monthly expense.", progress: power.spending.length > 0 ? 1 : 0, target: 1 },
    { id: "goal-reached", icon: "◎", name: "Quest complete", detail: "Reach the target on any active quest.", progress: highestQuestProgress, target: 100, suffix: "%" },
    { id: "positive-flow", icon: "⌁", name: "Positive cash flow", detail: "Record income greater than spending for the selected period.", progress: totals.reportIncome > 0 ? Math.max(0, Math.min(100, Math.round((totals.cashAfterSpending / totals.reportIncome) * 100))) : 0, target: 100, suffix: "%", earned: totals.reportIncome > 0 && totals.cashAfterSpending > 0 },
    { id: "net-worth-100k", icon: "◇", name: "KSh 100,000 net worth", detail: "Build your net worth to KSh 100,000.", progress: Math.max(0, Math.min(100, Math.round((balance.netWorth / 100000) * 100))), target: 100, suffix: "%", earned: balance.netWorth >= 100000 }
  ];
  const earnedIds = milestones
    .filter(milestone => Number(milestone.progress) >= Number(milestone.target) || milestone.earned === true)
    .map(milestone => milestone.id);
  milestones.forEach(milestone => { milestone.isEarned = earnedIds.includes(milestone.id); });
  try {
    localStorage.setItem(achievementStorageKey, JSON.stringify(earnedIds));
  } catch {
    // Keep earned state visible in this render if storage is unavailable.
  }
  const earnedCount = milestones.filter(item => item.isEarned).length;
  const cards = milestones.map(milestone => {
    const progress = Math.min(100, Math.round((milestone.progress / milestone.target) * 100));
    const progressLabel = milestone.suffix === "%"
      ? `${Math.min(milestone.progress, 100)}% complete`
      : `${Math.min(milestone.progress, milestone.target)} of ${milestone.target}`;
    return `
      <article class="achievement-card ${milestone.isEarned ? "is-earned" : "is-locked"}">
        <div class="achievement-card-top"><span class="achievement-icon">${milestone.icon}</span><span class="achievement-status">${milestone.isEarned ? "EARNED" : "IN PROGRESS"}</span></div>
        <h2>${escapeHTML(milestone.name)}</h2>
        <p>${escapeHTML(milestone.detail)}</p>
        <div class="achievement-progress-label"><span>${milestone.isEarned ? "Milestone reached" : progressLabel}</span><strong>${milestone.isEarned ? "100%" : `${progress}%`}</strong></div>
        <div class="achievement-track"><i style="width:${milestone.isEarned ? 100 : progress}%"></i></div>
      </article>`;
  }).join("");

  return `
    <section class="achievements-page">
      <header class="inventory-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-line"></span> MILESTONES EARNED</div>
          <h1>Progress worth<br><em>keeping.</em></h1>
          <p class="welcome-sub">Milestones unlock when your saved financial records meet each goal. Add your first account, plan, or quest to get started.</p>
        </div>
        <div class="achievement-score"><strong>${earnedCount} / ${milestones.length}</strong><span>milestones earned</span></div>
      </header>
      <section class="achievement-grid" aria-label="Financial achievements">${cards}</section>
    </section>
    ${renderAppFooter()}`;
}

function setCashflowChartCollapsed(collapsed) {
  const panel = document.querySelector(".cashflow-panel");
  const chartContent = panel?.querySelector(".cashflow-content");
  const toggle = panel?.querySelector("[data-cashflow-toggle]");
  if (!panel || !chartContent || !toggle) return;
  // On phones the card's own chevron collapses the whole panel, so the saved desktop choice is not applied.
  if (phoneQuery.matches) { chartContent.hidden = false; panel.classList.remove("is-collapsed"); return; }
  chartContent.hidden = collapsed;
  panel.classList.toggle("is-collapsed", collapsed);
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.innerHTML = `${collapsed ? "Show" : "Hide"} chart <span aria-hidden="true">${collapsed ? "⌄" : "⌃"}</span>`;
  try { localStorage.setItem(cashflowChartCollapsedKey, String(collapsed)); } catch { /* Keep the current view when storage is unavailable. */ }
}

function restoreCashflowChartState() {
  let collapsed = false;
  try { collapsed = localStorage.getItem(cashflowChartCollapsedKey) === "true"; } catch { /* Use the expanded default. */ }
  setCashflowChartCollapsed(collapsed);
}
// Select a page, refresh its data, and update the active tab and URL.
function showPage(page) {
  if (crumb.textContent === "Settings" && page !== "Settings") {
    setAccent(getStoredSettings().accentProfile);
  }
  navItems.forEach(item => {
    const selected = item.dataset.page === page;
    item.classList.toggle("active", selected);
    item.setAttribute("aria-current", selected ? "page" : "false");
  });
  crumb.textContent = page;
  if (page === "Dashboard") {
    window.location.hash = "dashboard";
    content.innerHTML = dashboardMarkup;
    restoreCashflowChartState();
    updateDashboardWelcome();
    updateDashboardInventorySummary();
    updateDashboardPowerUpSummary();
    updateDashboardQuests();
    return;
  }
  if (page === "Inventory") {
    window.location.hash = "inventory";
    content.innerHTML = renderInventoryPage();
    return;
  }
  if (page === "Power-Up") {
    window.location.hash = "power-up";
    content.innerHTML = renderPowerUpPage();
    return;
  }
  if (page === "Quests") {
    window.location.hash = "quests";
    content.innerHTML = renderQuestsPage();
    return;
  }
  if (page === "Stats") {
    window.location.hash = "stats";
    content.innerHTML = renderStatsPage();
    return;
  }
  if (page === "Achievements") {
    window.location.hash = "achievements";
    content.innerHTML = renderAchievementsPage();
    return;
  }
  if (page === "Contact") {
    window.location.hash = "contact";
    content.innerHTML = renderContactPage();
    return;
  }
  if (page === "Profile") {
    window.location.hash = "profile";
    content.innerHTML = renderProfilePage();
    return;
  }
  if (page === "Settings") {
    window.location.hash = "settings";
    content.innerHTML = renderSettingsPage();
    return;
  }
  const info = pageDescriptions[page];
  if (!info) return;
  window.location.hash = encodeURIComponent(page.toLowerCase());
  content.innerHTML = `
    <section class="empty-state">
      <div class="empty-card">
        <div class="empty-glyph">${info.glyph}</div>
        <div class="section-kicker">${info.eyebrow}</div>
        <h2>${info.title}</h2>
        <p>${info.body}</p>
        <button class="empty-action">${info.action} <span>↗</span></button>
      </div>
    </section>
    ${renderAppFooter()}
  `;
}

function renderPowerUpPage() {
  const data = getPowerUpData();
  const reportSpending = spendingForReport(data.spending);
  const totals = getPowerUpReportTotals();
  const incomeRows = data.incomes.length
    ? data.incomes.map(item => `
        <div class="power-row">
          <span class="power-row-icon income-icon">↙</span>
          <span class="power-row-name">
            <strong>${escapeHTML(item.name)}</strong>
            ${item.notes ? `<small>${escapeHTML(item.notes)}</small>` : ""}
          </span>
          <strong class="power-row-amount">${formatKsh(item.amount)}<small>/ month</small></strong>
          <button class="inventory-row-edit" type="button" data-edit-power-item="income" data-item-id="${escapeHTML(item.id)}" aria-label="Edit ${escapeHTML(item.name)}" title="Edit income">Edit</button>
          <button class="inventory-delete" type="button" data-delete-power-item="income" data-item-id="${escapeHTML(item.id)}" aria-label="Delete ${escapeHTML(item.name)}" title="Delete income">×</button>
        </div>`).join("")
    : `<div class="power-empty">No income sources yet. Add your monthly income to get started.</div>`;
  const budgetRows = data.budgets.length
    ? data.budgets.map(item => `
        <div class="power-row">
          <span class="power-row-icon budget-icon">▤</span>
          <span class="power-row-name">
            <strong>${escapeHTML(item.name)}</strong>
            <small>${escapeHTML(item.category)}${item.notes ? " · " + escapeHTML(item.notes) : ""}</small>
          </span>
          <strong class="power-row-amount">${formatKsh(item.amount)}<small>/ month</small></strong>
          <button class="inventory-row-edit" type="button" data-edit-power-item="budget" data-item-id="${escapeHTML(item.id)}" aria-label="Edit ${escapeHTML(item.name)}" title="Edit budget line">Edit</button>
          <button class="inventory-delete" type="button" data-delete-power-item="budget" data-item-id="${escapeHTML(item.id)}" aria-label="Delete ${escapeHTML(item.name)}" title="Delete budget line">×</button>
        </div>`).join("")
    : `<div class="power-empty">No budget lines yet. Add a monthly plan for your spending.</div>`;
  const spendingRows = reportSpending.length
    ? reportSpending.map(item => `
        <div class="power-row">
          <span class="power-row-icon spending-icon">↗</span>
          <span class="power-row-name">
            <strong>${escapeHTML(item.name)}</strong>
            <small>${escapeHTML(item.category)} · ${escapeHTML(item.month || monthKey())}${item.notes ? " · " + escapeHTML(item.notes) : ""}</small>
          </span>
          <strong class="power-row-amount">${formatKsh(item.amount)}</strong>
          <button class="inventory-row-edit" type="button" data-edit-power-item="spending" data-item-id="${escapeHTML(item.id)}" aria-label="Edit ${escapeHTML(item.name)}" title="Edit spending item">Edit</button>
          <button class="inventory-delete" type="button" data-delete-power-item="spending" data-item-id="${escapeHTML(item.id)}" aria-label="Delete ${escapeHTML(item.name)}" title="Delete spending item">×</button>
        </div>`).join("")
    : `<div class="power-empty">No spending recorded for ${getReportPeriod().toLowerCase()}. Add an expense for ${reportMonthLabel()}.</div>`;
  const savingsRate = totals.reportIncome > 0
    ? Math.round((totals.cashAfterSpending / totals.reportIncome) * 1000) / 10
    : 0;

  return `
    <section class="power-page">
      <header class="inventory-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-line"></span> INCOME &amp; BUDGET</div>
          <h1>Give every shilling<br><em>a direction.</em></h1>
          <p class="welcome-sub">Build a monthly plan around the income you have and the priorities you choose.</p>
        </div>
        <button class="inventory-action" type="button" data-power-action="income">
          ${plusIcon} Add income
        </button>
      </header>

      <section class="inventory-summary power-summary" aria-label="Monthly plan summary">
        <article class="inventory-summary-card">
          <span class="inventory-label">PERIOD INCOME</span>
          <strong>${formatKsh(totals.reportIncome)}</strong>
          <span class="inventory-note">${data.incomes.length} income ${data.incomes.length === 1 ? "source" : "sources"}</span>
        </article>
        <article class="inventory-summary-card">
          <span class="inventory-label">PERIOD BUDGET</span>
          <strong>${formatKsh(totals.reportBudget)}</strong>
          <span class="inventory-note">Across ${data.budgets.length} budget ${data.budgets.length === 1 ? "line" : "lines"}</span>
        </article>
        <article class="inventory-summary-card">
          <span class="inventory-label">PERIOD SPENDING</span>
          <strong>${formatKsh(totals.spending)}</strong>
          <span class="inventory-note">${reportSpending.length} ${getReportPeriod().toLowerCase()} ${reportSpending.length === 1 ? "record" : "records"}</span>
        </article>
        <article class="inventory-summary-card net-worth-summary">
          <span class="inventory-label">AFTER SPENDING</span>
          <strong>${formatKsh(totals.cashAfterSpending)}</strong>
          <span class="inventory-note">${savingsRate}% of period income</span>
        </article>
      </section>

      ${renderTaxWidget()}

      <section class="inventory-columns power-columns" aria-label="Income and monthly budget">
        <article class="panel power-list-panel phone-collapsible">
          <div class="panel-heading">
            <div><div class="section-kicker">MONEY COMING IN</div><h2>Income sources</h2></div>
            <button class="phone-panel-toggle" type="button" aria-expanded="false" aria-label="Expand section details"><span class="toggle-text">Show</span>${chevronIcon}</button>
            <button class="inventory-add-small" type="button" data-power-action="income" aria-label="Add income">${plusIcon}<span class="add-label">Add income</span></button>
          </div>
          <div class="phone-collapsible-content"><div class="power-rows">${incomeRows}</div>
          <div class="inventory-panel-total"><span>Total monthly income</span><strong>${formatKsh(totals.income)}</strong></div></div>
        </article>

        <article class="panel power-list-panel phone-collapsible">
          <div class="panel-heading">
            <div><div class="section-kicker">MONEY WITH A JOB</div><h2>Monthly budget</h2></div>
            <button class="phone-panel-toggle" type="button" aria-expanded="false" aria-label="Expand section details"><span class="toggle-text">Show</span>${chevronIcon}</button>
            <button class="inventory-add-small" type="button" data-power-action="budget" aria-label="Add budget">${plusIcon}<span class="add-label">Add budget</span></button>
          </div>
          <div class="phone-collapsible-content"><div class="power-rows">${budgetRows}</div>
          <div class="inventory-panel-total"><span>Total planned budget</span><strong>${formatKsh(totals.budget)}</strong></div></div>
        </article>

        <article class="panel power-list-panel phone-collapsible">
          <div class="panel-heading">
            <div><div class="section-kicker">MONEY SPENT</div><h2>Monthly spending</h2></div>
            <button class="phone-panel-toggle" type="button" aria-expanded="false" aria-label="Expand section details"><span class="toggle-text">Show</span>${chevronIcon}</button>
            <button class="inventory-add-small" type="button" data-power-action="spending" aria-label="Add spending">${plusIcon}<span class="add-label">Add spending</span></button>
          </div>
          <div class="phone-collapsible-content"><div class="power-rows">${spendingRows}</div>
          <div class="inventory-panel-total"><span>Total monthly spending</span><strong>${formatKsh(totals.spending)}</strong></div></div>
        </article>
      </section>
    </section>
    ${renderAppFooter()}`;
}

// Tax brackets, contribution rates, and chart colors used by the payroll calculator.
const taxStorageKey = "netraos-tax-v1";
const KE_TAX = {
  nssfRate: 0.06,
  nssfUpperLimit: 108000,
  shifRate: 0.0275,
  shifMinimum: 300,
  ahlRate: 0.015,
  personalRelief: 2400,
  ringScale: 35,
  sliderMax: 1000000,
  bands: [
    { upTo: 24000, rate: 0.10 },
    { upTo: 32333, rate: 0.25 },
    { upTo: 500000, rate: 0.30 },
    { upTo: 800000, rate: 0.325 },
    { upTo: Infinity, rate: 0.35 }
  ]
};
const taxColors = { net: "var(--green)", paye: "#d8b451", nssf: "#2f6f8f", shif: "#c0584a", ahl: "#7a6bb0" };

// Calculate monthly take-home pay after statutory deductions and progressive PAYE.
function computeKenyaPayroll(grossInput) {
  const settings = getStoredSettings();
  const gross = Math.max(0, Math.round(Number(grossInput) || 0));
  const nssf = settings.taxNssf ? Math.round(Math.min(gross, KE_TAX.nssfUpperLimit) * KE_TAX.nssfRate) : 0;
  const ahl = settings.taxAhl ? Math.round(gross * KE_TAX.ahlRate) : 0;
  const shifRaw = settings.taxShif && gross > 0 ? Math.max(KE_TAX.shifMinimum, gross * KE_TAX.shifRate) : 0;
  const shif = Math.round(Math.min(shifRaw, Math.max(0, gross - nssf - ahl)));
  // NSSF, SHIF and the housing levy are all deducted before PAYE is worked out.
  const taxable = Math.max(0, gross - nssf - shif - ahl);
  let remaining = taxable;
  let lower = 0;
  let taxBeforeRelief = 0;
  for (const band of KE_TAX.bands) {
    if (remaining <= 0) break;
    const slice = Math.min(remaining, band.upTo - lower);
    taxBeforeRelief += slice * band.rate;
    remaining -= slice;
    lower = band.upTo;
  }
  const configuredRelief = settings.personalRelief + settings.insuranceRelief + settings.customRelief;
  const relief = settings.taxPaye ? Math.min(configuredRelief, taxBeforeRelief) : 0;
  const paye = settings.taxPaye ? Math.round(taxBeforeRelief - relief) : 0;
  const deductions = paye + nssf + shif + ahl;
  const net = Math.max(0, gross - deductions);
  return {
    gross, nssf, shif, ahl, taxable, paye, deductions, net,
    taxBeforeRelief: Math.round(taxBeforeRelief),
    relief: Math.round(relief),
    shifAtMinimum: settings.taxShif && gross > 0 && shifRaw === KE_TAX.shifMinimum && gross * KE_TAX.shifRate < KE_TAX.shifMinimum
  };
}

function solveGrossFromNet(targetNet) {
  const target = Math.max(0, Math.round(Number(targetNet) || 0));
  if (target === 0) return 0;
  let low = 0;
  let high = Math.max(target * 3, 1000);
  while (computeKenyaPayroll(high).net < target && high < 1e9) high *= 2;
  while (high - low > 0.5) {
    const mid = (low + high) / 2;
    if (computeKenyaPayroll(mid).net >= target) high = mid;
    else low = mid;
  }
  return Math.round(high);
}

function getTaxState() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(taxStorageKey) || "null"); } catch { stored = null; }
  if (stored && Number.isFinite(Number(stored.value)) && Number(stored.value) >= 0) {
    return { mode: stored.mode === "net" ? "net" : "gross", value: Math.round(Number(stored.value)) };
  }
  return { mode: "gross", value: Math.round(getPowerUpTotals().income) || 100000 };
}

function saveTaxState(state) {
  try { localStorage.setItem(taxStorageKey, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

function taxScenario(state) {
  return computeKenyaPayroll(state.mode === "net" ? solveGrossFromNet(state.value) : state.value);
}

function taxRing(fraction, radius, stroke, color) {
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(1, fraction)) * circumference;
  const size = (radius + stroke) * 2;
  return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false">
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="#e8ece9" stroke-width="${stroke}"></circle>
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" style="stroke:${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${filled.toFixed(2)} ${circumference.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"></circle>
  </svg>`;
}

function renderTaxResults(p) {
  const pct = value => (p.gross > 0 ? (value / p.gross) * 100 : 0);
  const fmtPct = value => (Math.round(value * 10) / 10).toFixed(1) + "%";
  const items = [
    { key: "paye", label: "PAYE", amount: p.paye, note: p.relief > 0 ? `After ${formatBaseKsh(p.relief)} personal relief` : "Income tax" },
    { key: "nssf", label: "NSSF", amount: p.nssf, note: p.gross >= KE_TAX.nssfUpperLimit ? `6% · capped at ${formatBaseKsh(KE_TAX.nssfUpperLimit * KE_TAX.nssfRate)}` : `6% of pay up to ${formatBaseKsh(KE_TAX.nssfUpperLimit)}` },
    { key: "shif", label: "SHIF", amount: p.shif, note: p.shifAtMinimum ? `Minimum ${formatBaseKsh(KE_TAX.shifMinimum)}` : "2.75% of gross" },
    { key: "ahl", label: "Housing Levy", amount: p.ahl, note: "1.5% of gross" }
  ];
  const takeHomePct = pct(p.net);
  const bar = p.gross > 0
    ? [{ key: "net", label: "Take-home", amount: p.net }, ...items].map(item =>
        `<span style="flex:${Math.max(item.amount, 0)} 1 0;background:${taxColors[item.key]}" title="${item.label}: ${formatBaseKsh(item.amount)}"></span>`).join("")
    : "";
  return `
    <div class="tax-hero">
      <div class="tax-hero-ring" role="img" aria-label="Take-home is ${fmtPct(takeHomePct)} of gross pay">
        ${taxRing(takeHomePct / 100, 52, 11, taxColors.net)}
        <div class="tax-hero-center"><strong>${p.gross > 0 ? Math.round(takeHomePct) : 0}%</strong><span>TAKE-HOME</span></div>
      </div>
      <div class="tax-hero-figures" role="status">
        <div><span>GROSS PAY</span><strong>${formatBaseKsh(p.gross)}</strong></div>
        <div class="tax-net"><span>NET PAY</span><strong>${formatBaseKsh(p.net)}</strong></div>
        <div><span>TOTAL DEDUCTIONS</span><strong>${formatBaseKsh(p.deductions)}</strong></div>
        <small>${formatBaseKsh(p.net * 12)} take-home over 12 months</small>
      </div>
    </div>
    <div class="tax-bar" aria-hidden="true">${bar}</div>
    <div class="tax-rings">
      ${items.map(item => `
        <div class="tax-ring-card">
          <div class="tax-mini-ring">
            ${taxRing(pct(item.amount) / KE_TAX.ringScale, 22, 6, taxColors[item.key])}
            <b>${fmtPct(pct(item.amount))}</b>
          </div>
          <span class="tax-ring-label">${item.label}</span>
          <strong>${formatBaseKsh(item.amount)}</strong>
        </div>`).join("")}
    </div>
    <div class="tax-table" role="table" aria-label="Deduction breakdown">
      ${items.map(item => `
        <div class="tax-row" role="row">
          <i style="background:${taxColors[item.key]}"></i>
          <span class="tax-row-name" role="cell"><strong>${item.label}</strong><small>${item.note}</small></span>
          <span class="tax-row-pct" role="cell">${fmtPct(pct(item.amount))}</span>
          <strong class="tax-row-amount" role="cell">−${formatBaseKsh(item.amount)}</strong>
        </div>`).join("")}
      <div class="tax-row tax-row-net" role="row">
        <i style="background:${taxColors.net}"></i>
        <span class="tax-row-name" role="cell"><strong>Take-home pay</strong><small>Taxable pay was ${formatBaseKsh(p.taxable)}</small></span>
        <span class="tax-row-pct" role="cell">${fmtPct(takeHomePct)}</span>
        <strong class="tax-row-amount" role="cell">${formatBaseKsh(p.net)}</strong>
      </div>
    </div>
    <p class="tax-employer">Your employer also pays a matching ${formatBaseKsh(p.nssf)} NSSF and ${formatBaseKsh(p.ahl)} Housing Levy on top of your gross pay.</p>`;
}

function taxFieldLabel(mode) {
  return mode === "net" ? "Monthly take-home (net) pay" : "Monthly gross salary";
}

function renderTaxWidget(compact = false) {
  const state = getTaxState();
  const p = taxScenario(state);
  const sliderValue = Math.min(state.value, KE_TAX.sliderMax);
  const inputId = compact ? "tax-amount-compact" : "tax-amount";
  return `
    <article class="panel tax-panel tax-collapsed${compact ? " tax-compact" : ""}" data-tax-mode="${state.mode}" aria-label="Gross to net calculator">
      <div class="panel-heading">
        <div>
          <div class="section-kicker">${compact ? "KENYA · TAKE-HOME PAY" : "KENYA · PAYE, NSSF, SHIF &amp; HOUSING LEVY"}</div>
          <h2>${compact ? "Take-home calculator" : "Gross-to-net take-home"}</h2>
        </div>
        <button type="button" class="tax-expand" data-tax-toggle aria-expanded="false" aria-controls="${compact ? "tax-body-compact" : "tax-body-full"}"><span>Show calculator</span><span class="tax-expand-icon" aria-hidden="true"><svg viewBox="0 0 12 12" focusable="false"><path d="m2.5 4.5 3.5 3.5 3.5-3.5" /></svg></span></button>
      </div>
      <div class="tax-body" id="${compact ? "tax-body-compact" : "tax-body-full"}">
        <div class="tax-toggle" role="group" aria-label="Calculate from">
          <button type="button" class="${state.mode === "gross" ? "active" : ""}" data-tax-mode-btn="gross" aria-pressed="${state.mode === "gross"}">Gross → Net</button>
          <button type="button" class="${state.mode === "net" ? "active" : ""}" data-tax-mode-btn="net" aria-pressed="${state.mode === "net"}">Net → Gross</button>
        </div>
        <div class="tax-controls">
          <label class="tax-field" for="${inputId}">
            <span class="tax-field-label">${taxFieldLabel(state.mode)}</span>
          </label>
          <div class="tax-input-wrap">
            <span>KSh</span>
            <input id="${inputId}" class="tax-input" type="text" inputmode="numeric" autocomplete="off" value="${state.value.toLocaleString("en-KE")}">
          </div>
          <input class="tax-slider" type="range" min="0" max="${KE_TAX.sliderMax}" step="1000" value="${sliderValue}" aria-label="Adjust monthly amount" style="--fill:${(sliderValue / KE_TAX.sliderMax) * 100}%">
          <div class="tax-slider-scale" aria-hidden="true"><span>0</span><span>250K</span><span>500K</span><span>750K</span><span>1M</span></div>
          ${compact
            ? `<button type="button" class="tax-use-income" data-jump="Power-Up">Full breakdown <span aria-hidden="true">↗</span></button>`
            : `<button type="button" class="tax-use-income" data-tax-use-income>Use my logged income</button>
          <p class="tax-footnote">Monthly estimate using 2026 statutory rates. NSSF, SHIF and the Housing Levy are deducted before PAYE. It excludes insurance relief, pension top-ups and mortgage interest, so check your payslip or KRA for exact figures. Rings are scaled so a full ring is ${KE_TAX.ringScale}% of gross.</p>`}
        </div>
        <div class="tax-results">${compact ? renderTaxCompactResults(p) : renderTaxResults(p)}</div>
      </div>
    </article>`;
}

function syncTaxPanel(panel, state, source) {
  const p = taxScenario(state);
  const input = panel.querySelector(".tax-input");
  const slider = panel.querySelector(".tax-slider");
  const formatted = state.value.toLocaleString("en-KE");
  if (source === input) {
    const caret = input.selectionStart ?? input.value.length;
    const digitsBefore = input.value.slice(0, caret).replace(/\D/g, "").length;
    input.value = formatted;
    let pos = 0;
    let seen = 0;
    while (pos < formatted.length && seen < digitsBefore) {
      if (/\d/.test(formatted[pos])) seen += 1;
      pos += 1;
    }
    input.setSelectionRange(pos, pos);
  } else {
    input.value = formatted;
  }
  const sliderValue = Math.min(state.value, KE_TAX.sliderMax);
  if (source !== slider) slider.value = sliderValue;
  slider.style.setProperty("--fill", `${(sliderValue / KE_TAX.sliderMax) * 100}%`);
  panel.querySelector(".tax-field-label").textContent = taxFieldLabel(state.mode);
  panel.querySelector(".tax-results").innerHTML = panel.classList.contains("tax-compact") ? renderTaxCompactResults(p) : renderTaxResults(p);
}

// Keep the expanded and compact tax widgets synced while a user edits an input.
document.addEventListener("input", event => {
  const el = event.target;
  if (!(el instanceof HTMLInputElement) || !el.matches(".tax-input, .tax-slider")) return;
  const panel = el.closest(".tax-panel");
  if (!panel) return;
  const digits = el.classList.contains("tax-slider") ? el.value : el.value.replace(/\D/g, "");
  const state = { mode: panel.dataset.taxMode === "net" ? "net" : "gross", value: Math.min(Number(digits) || 0, 99999999) };
  saveTaxState(state);
  syncTaxPanel(panel, state, el);
});

// Handle tax-widget collapse, gross/net mode changes, and income shortcuts.
document.addEventListener("click", event => {
  const taxToggle = event.target.closest("[data-tax-toggle]");
  const modeButton = event.target.closest("[data-tax-mode-btn]");
  const useIncome = event.target.closest("[data-tax-use-income]");
  if (!taxToggle && !modeButton && !useIncome) return;
  const panel = event.target.closest(".tax-panel");
  if (!panel) return;
  if (taxToggle) {
    const expanded = panel.classList.toggle("tax-collapsed") === false;
    taxToggle.setAttribute("aria-expanded", String(expanded));
    taxToggle.querySelector("span").textContent = expanded ? "Hide calculator" : "Show calculator";
    return;
  }
  const current = { mode: panel.dataset.taxMode === "net" ? "net" : "gross", value: Number(panel.querySelector(".tax-input").value.replace(/\D/g, "")) || 0 };

  if (modeButton) {
    const mode = modeButton.dataset.taxModeBtn === "net" ? "net" : "gross";
    if (mode === current.mode) return;
    const p = taxScenario(current);
    const state = { mode, value: mode === "net" ? p.net : p.gross };
    panel.dataset.taxMode = mode;
    panel.querySelectorAll("[data-tax-mode-btn]").forEach(button => {
      const active = button === modeButton;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    saveTaxState(state);
    syncTaxPanel(panel, state, null);
    return;
  }

  const logged = Math.round(getPowerUpTotals().income);
  if (!logged) {
    showToast("Add an income source first, then use it here.");
    return;
  }
  const state = { mode: current.mode, value: logged };
  saveTaxState(state);
  syncTaxPanel(panel, state, null);
});

function renderTaxCompactResults(p) {
  const pct = value => (p.gross > 0 ? (value / p.gross) * 100 : 0);
  const takeHomePct = pct(p.net);
  const items = [
    { key: "paye", label: "PAYE", amount: p.paye },
    { key: "nssf", label: "NSSF", amount: p.nssf },
    { key: "shif", label: "SHIF", amount: p.shif },
    { key: "ahl", label: "Housing Levy", amount: p.ahl }
  ];
  const bar = p.gross > 0
    ? [{ key: "net", label: "Take-home", amount: p.net }, ...items].map(item =>
        `<span style="flex:${Math.max(item.amount, 0)} 1 0;background:${taxColors[item.key]}" title="${item.label}: ${formatKsh(item.amount)}"></span>`).join("")
    : "";
  return `
    <div class="tax-hero">
      <div class="tax-hero-ring" role="img" aria-label="Take-home is ${Math.round(takeHomePct)}% of gross pay">
        ${taxRing(takeHomePct / 100, 52, 11, taxColors.net)}
        <div class="tax-hero-center"><strong>${p.gross > 0 ? Math.round(takeHomePct) : 0}%</strong><span>TAKE-HOME</span></div>
      </div>
      <div class="tax-hero-figures" role="status">
        <div class="tax-net"><span>NET PAY</span><strong>${formatKsh(p.net)}</strong></div>
        <div><span>GROSS · DEDUCTIONS</span><strong>${formatKsh(p.gross)} · −${formatKsh(p.deductions)}</strong></div>
      </div>
    </div>
    <div class="tax-bar" aria-hidden="true">${bar}</div>
    <div class="tax-legend">
      ${items.map(item => `<span><i style="background:${taxColors[item.key]}"></i>${item.label}<strong>${formatKsh(item.amount)}</strong></span>`).join("")}
    </div>`;
}

// Contact page: team directory, availability helpers, and a simple message form.
const supportChannels = [
  { dept: "Support", detail: "Help using NetraOS", email: "support@netraos.io", hours: "Mon – Fri, 08:00 – 18:00", sla: "Within 2 hours", window: { start: 8, end: 18 } },
  { dept: "Security & Privacy", detail: "Privacy and security questions", email: "security@netraos.io", hours: "Always monitored", sla: "Within 30 minutes", window: null },
  { dept: "Partnerships", detail: "Integrations and collaboration", email: "integrations@netraos.io", hours: "Mon – Fri, 09:00 – 17:00", sla: "Within 24 hours", window: { start: 9, end: 17 } },
  { dept: "Press & Media", detail: "Interviews and media enquiries", email: "press@netraos.io", hours: "Mon – Fri, 09:00 – 17:00", sla: "Within 48 hours", window: { start: 9, end: 17 } }
];

const contactDestinations = {
  support: { label: "General support", to: "support@netraos.io", tag: "Support" },
  bug: { label: "Report a problem", to: "support@netraos.io", tag: "Problem report" },
  security: { label: "Security or privacy", to: "security@netraos.io", tag: "Security" },
  partnerships: { label: "Partnerships", to: "integrations@netraos.io", tag: "Partnership" },
  press: { label: "Press & media", to: "press@netraos.io", tag: "Press" }
};

function nairobiNow() {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", weekday: "short", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type)?.value;
    const day = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get("weekday")];
    return { day, hour: (Number(get("hour")) % 24) + Number(get("minute")) / 60 };
  } catch {
    return null;
  }
}

function channelStatus(channel) {
  if (!channel.window) return { label: "Available", open: true };
  const now = nairobiNow();
  if (!now) return { label: "", open: false };
  const open = now.day >= 1 && now.day <= 5 && now.hour >= channel.window.start && now.hour < channel.window.end;
  return { label: open ? "Available now" : "Currently closed", open };
}

function renderContactPage() {
  const team = supportChannels.map(channel => {
    const status = channelStatus(channel);
    return `
      <li class="cx-team-row">
        <div class="cx-team-main">
          <strong>${channel.dept}</strong>
          <span>${channel.detail}</span>
          <a href="mailto:${channel.email}">${channel.email}</a>
        </div>
        <div class="cx-team-meta">
          <span>${channel.hours}</span>
          <span>${channel.sla}</span>
          ${status.label ? `<em class="${status.open ? "open" : "closed"}"><i></i>${status.label}</em>` : ""}
        </div>
      </li>`;
  }).join("");

  return `
    <section class="contact-page cx-page">
      <header class="cx-heading">
        <div class="eyebrow"><span class="eyebrow-line"></span> CONTACT</div>
        <h1>Get in touch.</h1>
        <p class="welcome-sub">Questions, feedback or partnerships — we read every message. Times shown are East Africa Time (EAT).</p>
      </header>

      <section class="cx-layout">
        <form class="panel cx-form" data-contact-form novalidate aria-label="Send us a message">
          <h2>Send us a message</h2>
          <p class="cx-form-lead">Your message opens in your email app, addressed to the right team.</p>
          <label class="cx-field"><span>Your name</span><input name="handle" type="text" maxlength="80" autocomplete="name" placeholder="Full name"></label>
          <label class="cx-field"><span>Topic</span>
            <select name="dest">${Object.entries(contactDestinations).map(([key, dest]) => `<option value="${key}">${dest.label}</option>`).join("")}</select>
          </label>
          <label class="cx-field"><span>Message</span><textarea name="payload" maxlength="2000" rows="6" placeholder="How can we help?"></textarea></label>
          <div class="cx-actions">
            <button class="cx-send" type="submit">Send message</button>
            <button class="cx-clear" type="button" data-contact-clear>Clear</button>
          </div>
          <p class="cx-status" role="status" aria-live="polite"></p>
          <p class="cx-note">For your safety, never include your PIN, M-Pesa credentials or security keys in a message.</p>
        </form>

        <aside class="cx-side">
          <article class="panel cx-card">
            <h2>Reach us directly</h2>
            <ul class="cx-lines">
              <li><span class="cx-label">Phone</span><a href="tel:+254700000988">+254 (0) 700 000 988</a></li>
              <li><span class="cx-label">WhatsApp</span><a href="https://wa.me/254799000988" target="_blank" rel="noopener">+254 (0) 799 000 988</a></li>
              <li><span class="cx-label">Email</span><a href="mailto:support@netraos.io">support@netraos.io</a></li>
              <li><span class="cx-label">Office</span><address>NetraOS Technologies Lab<br>The Mirage Towers, 8th Floor, Tower 2<br>Chiromo Road, Westlands<br>Nairobi, Kenya<br>P.O. Box 40100 - 00100</address></li>
            </ul>
          </article>
        </aside>
      </section>

      <section class="panel cx-card cx-team">
        <h2>Who to contact</h2>
        <ul class="cx-team-list">${team}</ul>
      </section>
    </section>
    ${renderAppFooter()}`;
}

// Validate contact form details and hand the message to the user's email program.
document.addEventListener("submit", event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches("[data-contact-form]")) return;
  event.preventDefault();
  const status = form.querySelector(".cx-status");
  const setStatus = (text, error = false) => {
    status.textContent = text;
    status.classList.toggle("error", error);
  };
  const data = new FormData(form);
  const handle = String(data.get("handle") || "").trim();
  const payload = String(data.get("payload") || "").trim();
  const dest = contactDestinations[String(data.get("dest"))] || contactDestinations.support;
  if (!handle) { setStatus("Please enter your name.", true); form.elements.handle.focus(); return; }
  if (payload.length < 10) { setStatus("Please write a little more so we can help.", true); form.elements.payload.focus(); return; }
  const subject = `[${dest.tag}] NetraOS message from ${handle}`;
  const body = `${payload}\n\n— ${handle}`;
  window.location.href = `mailto:${dest.to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  setStatus(`Opening your email app, addressed to ${dest.to}.`);
});

// Reset the contact form and its status line when the clear control is selected.
document.addEventListener("click", event => {
  const clear = event.target.closest("[data-contact-clear]");
  if (!clear) return;
  const form = clear.closest("form");
  form.reset();
  const status = form.querySelector(".cx-status");
  status.textContent = "";
  status.classList.remove("error");
});

// Shared popover menus and toast messages provide lightweight app feedback.
function closePopover() {
  document.querySelector(".action-popover")?.remove();
  document
    .querySelectorAll('[aria-expanded="true"]')
    .forEach(button => button.setAttribute("aria-expanded", "false"));
}

function showToast(message) {
  document.querySelector(".dashboard-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "dashboard-toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  document.body.append(toast);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.remove(), 2800);
}

function openMenu(button, choices) {
  closePopover();
  const menu = document.createElement("div");
  menu.className = "action-popover";
  menu.setAttribute("role", "menu");
  choices.forEach(choice => {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.dataset.menuChoice = choice.action;
    item.textContent = choice.label;
    menu.append(item);
  });
  document.body.append(menu);
  const rect = button.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - menu.offsetWidth - 12);
  const top = Math.min(rect.bottom + 8, window.innerHeight - menu.offsetHeight - 12);
  menu.style.left = Math.max(12, left) + "px";
  menu.style.top = Math.max(12, top) + "px";
  button.setAttribute("aria-expanded", "true");
}

// Collect dashboard values in a report-ready structure for PDF and spreadsheet exports.
function collectDashboardRows() {
  const rows = [["Dashboard item", "Value"]];
  document.querySelectorAll(".metric-card").forEach(card => {
    const label = card
      .querySelector(".metric-heading")
      ?.innerText.trim().replace(/\s+/g, " ");
    const value = card
      .querySelector(".metric-value")
      ?.innerText.trim().replace(/\s+/g, " ");

    if (label && value) {
      rows.push([label, value]);
    }
  });
  document.querySelectorAll(".allocation-legend > div").forEach(item => {
    const label = item.querySelector("span")?.innerText.trim();
    const value = item.querySelector("strong")?.innerText.trim();
    const share = item.querySelector("small")?.innerText.trim();
    if (label && value) {
      const formattedValue = value + (share ? " (" + share + ")" : "");
      rows.push(["Asset: " + label, formattedValue]);
    }
  });
  document.querySelectorAll(".quest-row").forEach(item => {
    const label = item
      .querySelector(".quest-title")
      ?.innerText.trim().replace(/\s+/g, " ");
    const value = item
      .querySelector(".quest-meta")
      ?.innerText.trim().replace(/\s+/g, " ");

    if (label && value) {
      rows.push(["Quest: " + label, value]);
    }
  });
  return rows;
}

function saveFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Auto-lock counts as set up only when a PIN exists and a timeout is chosen.
function isAutoLockSetUp(settings = getStoredSettings()) {
  return Boolean(((settings.localPinHash && settings.localPinSalt) || settings.accountPinEnabled) && settings.lockTimeoutMinutes > 0);
}

// Offer auto-lock setup 10 seconds after sign-up/sign-in. A restored session only
// sees it once per browser tab session, and never after the user opts out.
function scheduleAutoLockNudge({ force = false } = {}) {
  window.clearTimeout(autoLockNudgeTimer);
  try {
    if (force) sessionStorage.removeItem(autoLockNudgeSessionKey);
    else if (sessionStorage.getItem(autoLockNudgeSessionKey)) return;
  } catch { /* Without sessionStorage the prompt can still show once per load. */ }
  const settings = getStoredSettings();
  if (settings.autoLockPromptDismissed || isAutoLockSetUp(settings)) return;
  autoLockNudgeTimer = window.setTimeout(showAutoLockNudge, autoLockNudgeDelayMs);
}

function showAutoLockNudge() {
  const settings = getStoredSettings();
  if (appShell.hidden || settings.autoLockPromptDismissed || isAutoLockSetUp(settings)) return;
  // Never stack on top of another dialog the user is working in; try again shortly.
  if (document.querySelector("dialog[open]")) {
    autoLockNudgeTimer = window.setTimeout(showAutoLockNudge, 5000);
    return;
  }
  try { sessionStorage.setItem(autoLockNudgeSessionKey, "1"); } catch { /* Optional. */ }

  const dialog = document.createElement("dialog");
  dialog.className = "inventory-dialog autolock-dialog";
  dialog.setAttribute("aria-labelledby", "autolock-nudge-title");
  dialog.innerHTML = `
    <form class="inventory-form">
      <header class="inventory-dialog-heading">
        <div>
          <span class="section-kicker">SECURITY</span>
          <h2 id="autolock-nudge-title">Lock your workspace when you step away</h2>
        </div>
        <button class="inventory-dialog-close" type="button" aria-label="Close dialog">×</button>
      </header>
      <p class="autolock-copy">Auto-lock hides your finances after a period of inactivity. Choose a four-digit PIN and how long to wait in Settings. This is a screen lock for this device and does not encrypt browser storage.</p>
      <label class="autolock-optout">
        <input type="checkbox" name="dismissForever">
        <span>Do not show this again</span>
      </label>
      <footer class="inventory-dialog-actions">
        <button class="inventory-cancel" type="button">Maybe later</button>
        <button class="inventory-submit" type="submit">Set up auto-lock</button>
      </footer>
    </form>`;
  document.body.append(dialog);

  const form = dialog.querySelector("form");
  const optOut = dialog.querySelector('[name="dismissForever"]');
  let goToSettings = false;
  dialog.querySelector(".inventory-dialog-close").addEventListener("click", () => dialog.close());
  dialog.querySelector(".inventory-cancel").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  form.addEventListener("submit", event => {
    event.preventDefault();
    goToSettings = true;
    dialog.close();
  });
  // Every way of closing (buttons, backdrop, Escape) honours the checkbox.
  dialog.addEventListener("close", () => {
    if (optOut.checked) {
      const current = getStoredSettings();
      current.autoLockPromptDismissed = true;
      try { localStorage.setItem(settingsStorageKey, JSON.stringify(current)); } catch { showToast("Unable to save that preference in browser storage."); }
    }
    dialog.remove();
    if (goToSettings) {
      showPage("Settings");
      window.requestAnimationFrame(() => {
        const field = document.querySelector('select[name="lockTimeoutMinutes"]');
        field?.scrollIntoView({ block: "center" });
        field?.focus({ preventScroll: true });
      });
    }
  }, { once: true });
  dialog.showModal();
  dialog.querySelector(".inventory-submit").focus();
}

// Prompt no more than once every 30 days when the user has enabled local reminders.
function maybePromptForBackup() {
  window.clearTimeout(backupPromptTimer);
  const settings = getStoredSettings();
  if (!settings.monthlyBackupPrompt) return;
  const lastPrompt = Date.parse(settings.lastBackupPromptAt || "");
  const interval = 30 * 24 * 60 * 60 * 1000;
  // setTimeout stores its delay as a signed 32-bit integer (~24.8 days). A
  // 30-day delay overflows and fires immediately, which re-armed the timer
  // and made the confirm() dialog loop forever. Cap each wait and re-check
  // whether the reminder is actually due when the timer fires.
  const maxTimerDelay = 2147483647;
  const remaining = Number.isFinite(lastPrompt) ? interval - (Date.now() - lastPrompt) : 0;
  const delay = Math.min(maxTimerDelay, Math.max(1200, remaining));
  backupPromptTimer = window.setTimeout(() => {
    const current = getStoredSettings();
    if (!current.monthlyBackupPrompt) return;
    const last = Date.parse(current.lastBackupPromptAt || "");
    const due = !Number.isFinite(last) || Date.now() - last >= interval;
    if (!due) { maybePromptForBackup(); return; }
    current.lastBackupPromptAt = new Date().toISOString();
    // If the timestamp can't be saved the reminder would repeat on every
    // page load, so skip it rather than trap the user in a prompt loop.
    try { localStorage.setItem(settingsStorageKey, JSON.stringify(current)); } catch { return; }
    if (window.confirm("It’s time to save a local NetraOS backup. Download your data now?")) downloadAllLocalData("json");
    maybePromptForBackup();
  }, delay);
}

// Export only NetraOS-prefixed browser keys so unrelated site data is excluded.
function downloadAllLocalData(format) {
  const settings = getStoredSettings();
  settings.lastBackupPromptAt = new Date().toISOString();
  try { localStorage.setItem(settingsStorageKey, JSON.stringify(settings)); } catch { /* Export can continue if preference storage is unavailable. */ }
  if (format.toLowerCase() === "json") {
    recordSecurityAudit("Downloaded local data as JSON");
  }
  const data = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith("netraos-") || key.startsWith("netraos-sync-baseline-v1-")) continue;
    const value = localStorage.getItem(key);
    try { data[key] = JSON.parse(value); } catch { data[key] = value; }
  }
  if (format.toLowerCase() !== "json") recordSecurityAudit(`Downloaded local data as ${format.toUpperCase()}`);
  const snapshot = { exportedAt: new Date().toISOString(), storage: data };
  if (format === "json") {
    saveFile("netraos-local-data.json", JSON.stringify(snapshot, null, 2), "application/json;charset=utf-8");
  } else {
    const rows = [["Storage key", "Value"], ...Object.entries(data).map(([key, value]) => [key, JSON.stringify(value)])];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    saveFile("netraos-local-data.csv", csv, "text/csv;charset=utf-8");
  }
  showToast(`Local data downloaded as ${format.toUpperCase()}.`);
}

// Restore only NetraOS-prefixed keys from this app's JSON export format.
async function restoreLocalData(file) {
  if (!file || file.size > 50 * 1024 * 1024 || !/\.json$/i.test(file.name)) {
    showToast("Choose a NetraOS JSON backup smaller than 50 MB.");
    return;
  }
  try {
    const backup = JSON.parse(await file.text());
    const source = backup?.storage && typeof backup.storage === "object" ? backup.storage : backup;
    const entries = Object.entries(source).filter(([key]) => key.startsWith("netraos-") && key !== sessionStorageKey);
    if (!entries.length) throw new Error("No NetraOS records were found in that file.");
    for (const [key, value] of entries) {
      if (typeof value === "undefined" || typeof value === "function") throw new Error("The backup contains an unsupported value.");
      JSON.stringify(value);
      if (key === profileStorageKey && (!value || typeof value.name !== "string" || typeof value.email !== "string")) throw new Error("The profile in this backup is invalid.");
      if ([inventoryStorageKey, questStorageKey, achievementStorageKey].includes(key) && !Array.isArray(value)) throw new Error("A list in this backup is invalid.");
      if (key === powerUpStorageKey && (!value || !Array.isArray(value.incomes) || !Array.isArray(value.budgets) || !Array.isArray(value.spending))) throw new Error("The monthly plan in this backup is invalid.");
      if (key === settingsStorageKey && (!value || typeof value !== "object" || Array.isArray(value))) throw new Error("Settings in this backup are invalid.");
    }
    if (!window.confirm(`Restore ${entries.length} NetraOS records? Matching data in this browser will be replaced.`)) return;
    const previous = new Map(entries.map(([key]) => [key, localStorage.getItem(key)]));
    try {
      entries.forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
    } catch (error) {
      previous.forEach((value, key) => value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value));
      throw error;
    }
    recordSecurityAudit("Restored a local JSON backup");
    applyStoredSettings();
    setPrivacyMode(localStorage.getItem(privacyModeStorageKey) === "true");
    applyProfileAvatar();
    setProfileName(getStoredProfile()?.username || getStoredProfile()?.name || "Jordan Davis");
    updateCurrencySwitcher();
    scheduleAutoLock();
    showPage(crumb.textContent);
    showToast("NetraOS JSON backup restored.");
  } catch (error) {
    showToast(error.message || "Unable to read that backup file.");
  }
}

// Erase this app's own browser keys and cookie names, without touching other site data.
// Code delivery needs an email service. Auth and PIN recovery use a server-verified
// challenge endpoint; factory reset retains its send-only endpoint contract.
// EMAIL_CODE_ENDPOINT accepts POST {to,subject,code,purpose,expiresInMinutes}.
const EMAIL_CODE_ENDPOINT = "";
// Configure window.NETRAOS_EMAIL_AUTH_ENDPOINT before this file loads. The endpoint
// accepts POST {action:"send",to,purpose,expiresInMinutes} -> {challengeId}, then
// POST {action:"verify",challengeId,code,purpose} -> {verified:true|false}.
const EMAIL_AUTH_ENDPOINT = window.NETRAOS_EMAIL_AUTH_ENDPOINT || "";
const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_CODE_MAX_ATTEMPTS = 5;
const RESET_RESEND_SECONDS = 60;

function isLocalPreviewHost() {
  return location.protocol === "file:" || ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
}

function maskEmail(email) {
  const [user = "", domain = ""] = String(email).split("@");
  return `${user.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(6, user.length - 1)))}@${domain}`;
}

async function requestEmailChallenge(to, purpose) {
  if (window.NetraSupabase?.enabled) throw new Error("PIN recovery email codes are not set up yet. Supabase can verify your account email, but this custom challenge needs a server email function.");
  if (EMAIL_AUTH_ENDPOINT) {
    const response = await fetch(EMAIL_AUTH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", to, purpose, expiresInMinutes: RESET_CODE_TTL_MS / 60000 })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.challengeId) throw new Error(result.message || "The email service could not send a code. Try again shortly.");
    return { challengeId: result.challengeId, demo: false };
  }
  if (isLocalPreviewHost() || !EMAIL_AUTH_ENDPOINT) {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const salt = btoa(Array.from(saltBytes, byte => String.fromCharCode(byte)).join(""));
    return { code, salt, hash: await deriveLocalPinHash(code, salt), expires: Date.now() + RESET_CODE_TTL_MS, attempts: 0, demo: true };
  }
  throw new Error("Email verification is not configured for this app yet.");
}

async function confirmEmailChallenge(pending, code, purpose) {
  if (pending.demo) {
    if (Date.now() > pending.expires) throw new Error("That code has expired. Send a new one.");
    pending.attempts += 1;
    if (pending.attempts > RESET_CODE_MAX_ATTEMPTS) throw new Error("Too many incorrect attempts. Send a new code.");
    return (await deriveLocalPinHash(code, pending.salt)) === pending.hash;
  }
  const response = await fetch(EMAIL_AUTH_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "verify", challengeId: pending.challengeId, code, purpose })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "Unable to verify that code. Try again.");
  return result.verified === true;
}

function showPreferredNamePrompt(profile) {
  const dialog = document.createElement("dialog");
  dialog.className = "inventory-dialog";
  dialog.setAttribute("aria-labelledby", "preferred-name-title");
  dialog.innerHTML = `
    <form class="inventory-form" novalidate>
      <header class="inventory-dialog-heading"><div><span class="section-kicker">A QUICK HELLO</span><h2 id="preferred-name-title">Welcome to NetraOS</h2></div></header>
      <div class="inventory-form-fields">
        <p class="reset-copy">What name do you prefer being called?</p>
        <label class="inventory-form-field"><span>Your preferred name</span><input name="preferredName" type="text" autocomplete="nickname" maxlength="40" placeholder="The name you go by" required></label>
        <p class="reset-status" role="alert" aria-live="polite" data-preferred-name-error></p>
      </div>
      <footer class="inventory-dialog-actions"><button class="inventory-submit" type="submit">Continue</button></footer>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector("form");
  const error = dialog.querySelector("[data-preferred-name-error]");
  form.addEventListener("submit", event => {
    event.preventDefault();
    const preferredName = String(form.elements.preferredName.value || "").trim().replace(/\s+/g, " ");
    if (!preferredName) {
      error.textContent = "Enter the name you’d like us to use.";
      form.elements.preferredName.focus();
      return;
    }
    const completedProfile = { ...profile, username: preferredName };
    try {
      saveStoredProfile(completedProfile);
      enterApp(completedProfile);
      dialog.close();
    } catch {
      error.textContent = "Unable to save your profile. Check browser storage and try again.";
    }
  });
  dialog.addEventListener("cancel", event => event.preventDefault());
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  form.elements.preferredName.focus();
}
function showEmailCodeChallenge({ email, purpose, title, description, onVerified }) {
  let pending = null;
  let resendTimer = 0;
  const dialog = document.createElement("dialog");
  dialog.className = "inventory-dialog";
  dialog.setAttribute("aria-labelledby", "email-code-title");
  dialog.innerHTML = `
    <form class="inventory-form" novalidate>
      <header class="inventory-dialog-heading"><div><span class="section-kicker">EMAIL SECURITY CHECK</span><h2 id="email-code-title">${escapeHTML(title)}</h2></div><button class="inventory-dialog-close" type="button" aria-label="Close dialog">×</button></header>
      <div class="inventory-form-fields">
        <p class="reset-copy">${escapeHTML(description)} ${EMAIL_AUTH_ENDPOINT ? `A code will be sent to <b>${escapeHTML(maskEmail(email))}</b>.` : "A temporary code will be shown here. No email is sent until an email provider is connected."}</p>
        <div class="reset-demo" data-email-code-demo hidden></div>
        <label class="inventory-form-field" data-email-code-field hidden><span>Verification code</span><input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="6-digit code" required></label>
        <p class="reset-status" role="status" aria-live="polite" data-email-code-status></p>
      </div>
      <footer class="inventory-dialog-actions"><button class="inventory-cancel" type="button">Cancel</button><button class="inventory-submit" type="button" data-email-code-send>Send code</button><button class="inventory-submit" type="submit" data-email-code-verify hidden>Verify code</button></footer>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector("form");
  const sendButton = dialog.querySelector("[data-email-code-send]");
  const verifyButton = dialog.querySelector("[data-email-code-verify]");
  const codeField = dialog.querySelector("[data-email-code-field]");
  const status = dialog.querySelector("[data-email-code-status]");
  const demoBox = dialog.querySelector("[data-email-code-demo]");
  if (!EMAIL_AUTH_ENDPOINT) sendButton.textContent = "Generate preview code";
  const setStatus = (message, error = false) => { status.textContent = message; status.classList.toggle("error", error); };
  const close = () => { window.clearInterval(resendTimer); pending = null; dialog.close(); };
  dialog.querySelector(".inventory-dialog-close").addEventListener("click", close);
  dialog.querySelector(".inventory-cancel").addEventListener("click", close);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();

  sendButton.addEventListener("click", async () => {
    sendButton.disabled = true;
    setStatus("Sending code…");
    try {
      pending = await requestEmailChallenge(email, purpose);
      codeField.hidden = false;
      verifyButton.hidden = false;
      demoBox.hidden = !pending.demo;
      if (pending.demo) demoBox.innerHTML = `<b>Preview only:</b> no email service is connected. Your local test code is <strong>${pending.code}</strong>.`;
      setStatus(pending.demo ? "This is a local preview, so no email was sent. The temporary code is shown above." : "Your code is on its way. It may take a few minutes to arrive, and could land in spam.");
      form.elements.code.value = "";
      form.elements.code.focus();
      let seconds = RESET_RESEND_SECONDS;
      const tick = () => {
        sendButton.textContent = seconds > 0 ? `Resend code (${seconds}s)` : (EMAIL_AUTH_ENDPOINT ? "Resend code" : "Generate preview code");
        if (seconds <= 0) { window.clearInterval(resendTimer); sendButton.disabled = false; }
        seconds -= 1;
      };
      tick();
      resendTimer = window.setInterval(tick, 1000);
    } catch (error) {
      setStatus(friendlyAuthMessage(error, "We couldn’t send a code just now. Another try in a little while may help."), true);
      sendButton.disabled = false;
    }
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!pending) return;
    const code = String(form.elements.code.value || "").trim();
    if (!/^[0-9]{6}$/.test(code)) { setStatus("That code should be 6 digits. The code in your email may be worth checking.", true); return; }
    verifyButton.disabled = true;
    setStatus("Verifying code…");
    try {
      if (!await confirmEmailChallenge(pending, code, purpose)) { setStatus("That code didn’t match. The email code may be worth checking.", true); verifyButton.disabled = false; return; }
      close();
      await onVerified();
    } catch (error) {
      setStatus(friendlyAuthMessage(error, "We couldn’t verify that code just now. Another try may help."), true);
      verifyButton.disabled = false;
    }
  });
}

function showPinRecovery() {
  const email = String(getStoredProfile()?.email || "").trim();
  if (!email.includes("@")) { showToast("Add an email address to your local profile before resetting this PIN."); return; }
  showEmailCodeChallenge({
    email,
    purpose: "pin-recovery",
    title: "Reset your inactivity PIN",
    description: "Verify your email to choose a new four-digit PIN.",
    onVerified: showPinRecoveryForm
  });
}

function showPinRecoveryForm() {
  const dialog = document.createElement("dialog");
  dialog.className = "inventory-dialog";
  dialog.setAttribute("aria-labelledby", "pin-recovery-title");
  dialog.innerHTML = `
    <form class="inventory-form" novalidate>
      <header class="inventory-dialog-heading"><div><span class="section-kicker">PIN RECOVERY</span><h2 id="pin-recovery-title">Choose a new PIN</h2></div><button class="inventory-dialog-close" type="button" aria-label="Close dialog">×</button></header>
      <div class="inventory-form-fields"><p class="reset-copy">Set a new four-digit PIN for your inactivity lock.</p>
        <label class="inventory-form-field"><span>New four-digit PIN</span><input name="newPin" type="password" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{4}" maxlength="4" required></label>
        <label class="inventory-form-field"><span>Confirm new PIN</span><input name="confirmPin" type="password" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{4}" maxlength="4" required></label>
        <p class="reset-status" role="status" aria-live="polite" data-pin-recovery-status></p>
      </div>
      <footer class="inventory-dialog-actions"><button class="inventory-cancel" type="button">Cancel</button><button class="inventory-submit" type="submit">Save new PIN</button></footer>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector("form");
  const status = dialog.querySelector("[data-pin-recovery-status]");
  const close = () => dialog.close();
  dialog.querySelector(".inventory-dialog-close").addEventListener("click", close);
  dialog.querySelector(".inventory-cancel").addEventListener("click", close);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  form.elements.newPin.focus();
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const pin = String(form.elements.newPin.value || "");
    if (!/^[0-9]{4}$/.test(pin) || pin !== form.elements.confirmPin.value) {
      status.textContent = "Enter and confirm the same four-digit PIN.";
      status.classList.add("error");
      return;
    }
    try {
      const settings = getStoredSettings();
      Object.assign(settings, await createLocalPinVerifier(pin), { localPinLength: 4 });
      localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
      recordSecurityAudit("Reset local inactivity PIN by email verification");
      close();
      applyStoredSettings();
      showPage("Settings");
      scheduleAutoLock();
      showToast("Your inactivity PIN has been reset.");
    } catch {
      status.textContent = "Unable to save the new PIN in this browser.";
      status.classList.add("error");
    }
  });
}

async function sendResetCodeEmail(to, code) {
  if (window.NetraSupabase?.enabled) throw new Error("Factory-reset verification email is not set up yet. No preview code was generated or sent.");
  if (EMAIL_CODE_ENDPOINT) {
    const response = await fetch(EMAIL_CODE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject: "Your NetraOS verification code", code, purpose: "factory-reset", expiresInMinutes: RESET_CODE_TTL_MS / 60000 })
    });
    if (!response.ok) throw new Error("The email service could not send the code. Try again shortly.");
    return { demo: false };
  }
  if (isLocalPreviewHost()) return { demo: true };
  throw new Error("Email delivery is not set up for this app yet, so the reset cannot be verified.");
}

function performFactoryReset() {
  window.clearTimeout(autoLockTimer);
  for (const storage of [localStorage, sessionStorage]) {
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith("netraos-")) keys.push(key);
    }
    keys.forEach(key => storage.removeItem(key));
  }
  document.cookie.split(";").forEach(cookie => {
    const name = cookie.split("=")[0]?.trim();
    if (name?.startsWith("netraos_")) document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
  });
  document.querySelector("#security-lock-screen")?.remove();
  appShell.hidden = true;
  showPublicPage("landing");
  showToast("NetraOS data cleared from this browser.");
}

function clearAllLocalData() {
  if (window.NetraSupabase?.enabled) {
    showCloudFactoryReset();
    return;
  }
  const profile = getStoredProfile();
  const email = String(profile?.email || "").trim();
  if (!email.includes("@")) {
    showToast("Add an email address to your profile first so a verification code can be sent.");
    return;
  }
  let pending = null;
  let resendTimer = 0;
  const dialog = document.createElement("dialog");
  dialog.className = "inventory-dialog";
  dialog.innerHTML = `
    <form class="inventory-form reset-form" novalidate>
      <header class="inventory-dialog-heading"><div><span class="section-kicker">SECURITY CHECK</span><h2>Confirm factory reset</h2></div><button class="inventory-dialog-close" type="button" aria-label="Close dialog">×</button></header>
      <div class="inventory-form-fields">
        <p class="reset-copy">This permanently removes all NetraOS profiles, records, plans, goals and settings from this browser. It cannot be undone, so download a backup first.</p>
        <p class="reset-copy" data-reset-step-copy>We will email a 6-digit verification code to <b>${escapeHTML(maskEmail(email))}</b>.</p>
        <div class="reset-demo" data-reset-demo hidden></div>
        <label class="inventory-form-field" data-reset-code-field hidden><span>Verification code</span><input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="6-digit code"></label>
        <p class="reset-status" role="status" aria-live="polite" data-reset-status></p>
      </div>
      <footer class="inventory-dialog-actions">
        <button class="inventory-cancel" type="button">Cancel</button>
        <button class="inventory-submit" type="button" data-reset-send>Send code</button>
        <button class="inventory-submit danger" type="submit" data-reset-confirm hidden>Verify &amp; erase everything</button>
      </footer>
    </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector("form");
  const status = dialog.querySelector("[data-reset-status]");
  const sendButton = dialog.querySelector("[data-reset-send]");
  const confirmButton = dialog.querySelector("[data-reset-confirm]");
  const codeField = dialog.querySelector("[data-reset-code-field]");
  const demoBox = dialog.querySelector("[data-reset-demo]");
  const setStatus = (text, error = false) => { status.textContent = text; status.classList.toggle("error", error); };
  const close = () => { window.clearInterval(resendTimer); pending = null; dialog.close(); };

  function startCooldown() {
    let left = RESET_RESEND_SECONDS;
    sendButton.disabled = true;
    window.clearInterval(resendTimer);
    const tick = () => {
      sendButton.textContent = left > 0 ? `Resend code (${left}s)` : "Resend code";
      if (left <= 0) { window.clearInterval(resendTimer); sendButton.disabled = false; }
      left -= 1;
    };
    tick();
    resendTimer = window.setInterval(tick, 1000);
  }

  sendButton.addEventListener("click", async () => {
    sendButton.disabled = true;
    setStatus("Sending code…");
    try {
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
      const saltBytes = crypto.getRandomValues(new Uint8Array(16));
      const salt = btoa(Array.from(saltBytes, byte => String.fromCharCode(byte)).join(""));
      const hash = await deriveLocalPinHash(code, salt);
      const result = await sendResetCodeEmail(email, code);
      pending = { salt, hash, expires: Date.now() + RESET_CODE_TTL_MS, attempts: 0 };
      codeField.hidden = false;
      confirmButton.hidden = false;
      dialog.querySelector("[data-reset-step-copy]").innerHTML = `Enter the 6-digit code${result.demo ? "" : ` we sent to <b>${escapeHTML(maskEmail(email))}</b>`}. It expires in 10 minutes.`;
      demoBox.hidden = !result.demo;
      if (result.demo) demoBox.innerHTML = `<b>Preview mode:</b> no email service is connected here, so your code is <strong>${code}</strong>. On a live site this code is emailed instead.`;
      setStatus(result.demo ? "" : "Your code is on its way. It may take a few minutes to arrive, and could land in spam.");
      form.elements.code.value = "";
      form.elements.code.focus();
      startCooldown();
    } catch (error) {
      setStatus(friendlyAuthMessage(error, "We couldn’t send a code just now. Please try again in a little while."), true);
      sendButton.disabled = false;
    }
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!pending) return;
    const entered = String(form.elements.code.value || "").trim();
    if (Date.now() > pending.expires) { pending = null; setStatus("That code has expired. Send a new one.", true); return; }
    if (!/^[0-9]{6}$/.test(entered)) { setStatus("Enter the 6-digit code from the email.", true); return; }
    pending.attempts += 1;
    const ok = (await deriveLocalPinHash(entered, pending.salt)) === pending.hash;
    if (!ok) {
      const left = RESET_CODE_MAX_ATTEMPTS - pending.attempts;
      if (left <= 0) { pending = null; setStatus("Too many incorrect attempts. Send a new code.", true); form.elements.code.value = ""; return; }
      setStatus(`That code is not correct. ${left} ${left === 1 ? "attempt" : "attempts"} left.`, true);
      return;
    }
    close();
    performFactoryReset();
  });

  dialog.querySelector(".inventory-dialog-close").addEventListener("click", close);
  dialog.querySelector(".inventory-cancel").addEventListener("click", close);
  dialog.addEventListener("close", () => { window.clearInterval(resendTimer); dialog.remove(); }, { once: true });
  dialog.showModal();
}

function showCloudFactoryReset() {
  const dialog = document.createElement("dialog");
  dialog.className = "inventory-dialog";
  dialog.innerHTML = `<form class="inventory-form" novalidate><header class="inventory-dialog-heading"><div><span class="section-kicker">ACCOUNT SECURITY</span><h2>Clear NetraOS account data</h2></div><button class="inventory-dialog-close" type="button" aria-label="Close dialog">×</button></header><div class="inventory-form-fields"><p class="reset-copy">This permanently deletes synced profiles, records, plans, goals, settings, and activity for this account, and clears this device. Your Supabase Auth sign-in account will remain; this action does not delete that identity. Download a backup first.</p><label class="inventory-form-field"><span>Confirm your account password</span><input name="password" type="password" autocomplete="current-password" required></label><p class="reset-status" role="alert" aria-live="polite"></p></div><footer class="inventory-dialog-actions"><button class="inventory-cancel" type="button">Cancel</button><button class="inventory-submit danger" type="submit">Delete synced data</button></footer></form>`;
  document.body.append(dialog);
  const form = dialog.querySelector("form");
  const status = dialog.querySelector(".reset-status");
  const close = () => dialog.close();
  dialog.querySelector(".inventory-dialog-close").addEventListener("click", close);
  dialog.querySelector(".inventory-cancel").addEventListener("click", close);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const password = String(form.elements.password.value || "");
    const user = await window.NetraSupabase.getUser();
    if (!user?.email || !password) { status.textContent = "Enter your password to continue."; return; }
    if (!window.confirm("Delete all synced NetraOS data for this account and clear this device? This cannot be undone.")) return;
    form.querySelector('[type="submit"]').disabled = true;
    status.textContent = "Verifying and deleting account data…";
    const verified = await window.NetraSupabase.signIn(user.email, password);
    if (verified.error) { form.querySelector('[type="submit"]').disabled = false; status.textContent = "The password could not be verified."; return; }
    try {
      await window.NetraSupabase.deleteCloudData();
      dialog.close();
      performFactoryReset();
    } catch (error) {
      form.querySelector('[type="submit"]').disabled = false;
      status.textContent = error.message || "Unable to delete account data.";
    }
  });
  dialog.showModal();
  form.elements.password.focus();
}

// Download financial data as a plain CSV file.
function downloadSummary() {
  recordSecurityAudit("Downloaded dashboard CSV");
  const rows = collectDashboardRows();
  const csvEscape = value =>
    '"' + String(value).replace(/"/g, '""') + '"';
  const csv = rows.map(row => row.map(csvEscape).join(",")).join("\r\n");
  saveFile("netraos-dashboard.csv", csv, "text/csv;charset=utf-8");
  showToast("Dashboard CSV downloaded.");
}

// Download an Excel-compatible workbook using SpreadsheetML markup.
function downloadExcel() {
  recordSecurityAudit("Downloaded dashboard spreadsheet");
  const rows = collectDashboardRows();
  const xmlEscape = value =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  const xmlRows = rows
    .map(row => {
      const cells = row
        .map(value => `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`)
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");
  const workbook = `<?xml version="1.0"?>
    <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
      xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
      <Worksheet ss:Name="Dashboard">
        <Table>${xmlRows}</Table>
      </Worksheet>
    </Workbook>`;
  saveFile("netraos-dashboard.xls", workbook, "application/vnd.ms-excel;charset=utf-8");
  showToast("Dashboard Excel workbook downloaded.");
}

// Build a self-contained, vector-based A4 PDF report: cover summary, liabilities schedule,
// detail tables, and a translucent brand watermark. No external libraries are required.
function downloadPDF() {
  recordSecurityAudit("Downloaded financial PDF");
  const W = 595.28, H = 841.89, M = 40, CW = W - M * 2, FOOT = 56;
  const C = {
    ink: "#16241D", body: "#3B4A42", muted: "#6B7A71", green: "#13875F", deep: "#0E3B2C",
    gold: "#C9A24A", pale: "#F2F7F4", tint: "#E3F0E8", line: "#DCE6DF", white: "#FFFFFF",
    red: "#B94A3F", blue: "#3D7A94", purple: "#7F6BA6", amber: "#C98B2B", zebra: "#F7FAF8", sage: "#8DB8A2"
  };

  // Helvetica glyph widths (ASCII 32-126) so text can be aligned and truncated precisely.
  const regular = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const heavy = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
  const tw = (str, size, bold = false) => {
    const table = bold ? heavy : regular;
    let total = 0;
    for (const ch of str) total += table[ch.charCodeAt(0) - 32] ?? 556;
    return (total * size) / 1000;
  };
  const rgb = hex => {
    const raw = hex.replace("#", "");
    return [0, 2, 4].map(i => (parseInt(raw.slice(i, i + 2), 16) / 255).toFixed(3)).join(" ");
  };
  const n = value => String(Math.round(value * 100) / 100);
  const ascii = value => String(value ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
  const esc = value => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const fit = (value, size, bold, maxW) => {
    if (tw(value, size, bold) <= maxW) return value;
    let cut = value;
    while (cut.length > 1 && tw(cut + "...", size, bold) > maxW) cut = cut.slice(0, -1);
    return cut.trimEnd() + "...";
  };
  const wrap = (value, size, bold, maxW) => {
    const lines = [];
    let current = "";
    ascii(value).split(" ").forEach(word => {
      const attempt = current ? current + " " + word : word;
      if (!current || tw(attempt, size, bold) <= maxW) current = attempt;
      else { lines.push(current); current = word; }
    });
    if (current) lines.push(current);
    return lines;
  };
  const py = top => H - top;

  // Report data -----------------------------------------------------------------------
  const currencyState = getCurrencyState();
  const reportCurrency = currencyState.active === "KES" ? "KSh" : currencyState.active;
  const reportRate = currencyState.rates[currencyState.active] || 1;
  const cents = getStoredSettings().alwaysShowCents;
  const money = amount => `${reportCurrency} ${(Number(amount || 0) / reportRate).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
  const entries = getInventoryEntries();
  const totals = getInventoryTotals();
  const power = getPowerUpData();
  const reportSpending = spendingForReport(power.spending);
  const sum = list => list.reduce((total, item) => total + Number(item.amount || 0), 0);
  const plan = { income: sum(power.incomes), budget: sum(power.budgets), spending: sum(reportSpending) };
  const quests = getQuests();
  const assets = entries.filter(item => item.type === "asset");
  const liabilities = entries.filter(item => item.type === "liability");
  const profile = getStoredProfile();
  const preparedFor = ascii(profile?.name || document.body.dataset.userName || "NetraOS user");
  const holderEmail = ascii(profile?.email || "");
  const now = new Date();
  const reportDate = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const reportRef = `NOS-${localDateValue(now).replace(/-/g, "")}`;
  const period = getReportPeriod();
  const pct = (value, digits = 1) => `${(Math.round(value * 10 ** digits) / 10 ** digits).toFixed(digits)}%`;
  const savingsRate = plan.income > 0 ? ((plan.income - plan.spending) / plan.income) * 100 : 0;
  const debtToAsset = totals.assets > 0 ? (totals.liabilities / totals.assets) * 100 : null;
  const monthlyInstallments = liabilities.reduce((total, item) => total + Number(item.loan?.minInstallment || 0), 0);
  const debtService = plan.income > 0 ? (monthlyInstallments / plan.income) * 100 : null;
  const loanDates = liabilities.map(item => item.loan?.payoffDate).filter(Boolean).sort();
  const longestTenure = liabilities.reduce((max, item) => Math.max(max, Number(item.loan?.tenureMonths || 0)), 0);
  const debtHealth = debtToAsset === null ? "No assets recorded" : debtToAsset < 30 ? "Healthy" : debtToAsset <= 50 ? "Moderate" : "Elevated";
  const debtHealthColor = debtToAsset === null ? C.muted : debtToAsset < 30 ? C.green : debtToAsset <= 50 ? C.amber : C.red;

  // Page engine -----------------------------------------------------------------------
  const pages = [];
  let s = [];
  let y = 0;
  function newPage() { s = []; pages.push(s); y = 78; }
  function ensure(height) { if (y + height > H - FOOT) newPage(); }

  function txt(x, top, size, value, o = {}) {
    const bold = Boolean(o.bold);
    let text = ascii(value);
    if (o.maxW) text = fit(text, size, bold, o.maxW);
    const spacing = o.spacing || 0;
    const width = tw(text, size, bold) + spacing * text.length;
    const px = o.align === "r" ? x - width : o.align === "c" ? x - width / 2 : x;
    s.push(`${rgb(o.color || C.ink)} rg BT /${bold ? "F2" : "F1"} ${n(size)} Tf ${spacing ? n(spacing) + " Tc " : ""}${n(px)} ${n(py(top))} Td (${esc(text)}) Tj${spacing ? " 0 Tc" : ""} ET\n`);
  }
  function box(x, top, w, h, o = {}) {
    const bx = x, by = py(top) - h, r = Math.min(o.r || 0, w / 2, h / 2), k = r * 0.5523;
    const path = r > 0
      ? `${n(bx + r)} ${n(by)} m ${n(bx + w - r)} ${n(by)} l ${n(bx + w - r + k)} ${n(by)} ${n(bx + w)} ${n(by + r - k)} ${n(bx + w)} ${n(by + r)} c ${n(bx + w)} ${n(by + h - r)} l ${n(bx + w)} ${n(by + h - r + k)} ${n(bx + w - r + k)} ${n(by + h)} ${n(bx + w - r)} ${n(by + h)} c ${n(bx + r)} ${n(by + h)} l ${n(bx + r - k)} ${n(by + h)} ${n(bx)} ${n(by + h - r + k)} ${n(bx)} ${n(by + h - r)} c ${n(bx)} ${n(by + r)} l ${n(bx)} ${n(by + r - k)} ${n(bx + r - k)} ${n(by)} ${n(bx + r)} ${n(by)} c h`
      : `${n(bx)} ${n(by)} ${n(w)} ${n(h)} re`;
    const op = o.fill && o.stroke ? "B" : o.fill ? "f" : "S";
    s.push(`${o.fill ? rgb(o.fill) + " rg " : ""}${o.stroke ? rgb(o.stroke) + " RG " + n(o.lw || 0.75) + " w " : ""}${path} ${op}\n`);
  }
  function rule(x1, t1, x2, t2, color = C.line, width = 0.75) {
    s.push(`${rgb(color)} RG ${n(width)} w ${n(x1)} ${n(py(t1))} m ${n(x2)} ${n(py(t2))} l S\n`);
  }
  function circle(cx, cyPdf, r) {
    const k = r * 0.5523;
    return `${n(cx + r)} ${n(cyPdf)} m ${n(cx + r)} ${n(cyPdf + k)} ${n(cx + k)} ${n(cyPdf + r)} ${n(cx)} ${n(cyPdf + r)} c ${n(cx - k)} ${n(cyPdf + r)} ${n(cx - r)} ${n(cyPdf + k)} ${n(cx - r)} ${n(cyPdf)} c ${n(cx - r)} ${n(cyPdf - k)} ${n(cx - k)} ${n(cyPdf - r)} ${n(cx)} ${n(cyPdf - r)} c ${n(cx + k)} ${n(cyPdf - r)} ${n(cx + r)} ${n(cyPdf - k)} ${n(cx + r)} ${n(cyPdf)} c h`;
  }
  function slice(cx, cy, radius, start, end, fill) {
    const segments = Math.max(1, Math.ceil(Math.abs(end - start) / (Math.PI / 2)));
    const delta = (end - start) / segments;
    let angle = start;
    let out = `${rgb(fill)} rg ${n(cx)} ${n(cy)} m ${n(cx + radius * Math.cos(angle))} ${n(cy + radius * Math.sin(angle))} l `;
    for (let i = 0; i < segments; i += 1) {
      const next = angle + delta;
      const k = (4 / 3) * Math.tan((next - angle) / 4);
      const x0 = cx + radius * Math.cos(angle), y0 = cy + radius * Math.sin(angle);
      const x1 = cx + radius * Math.cos(next), y1 = cy + radius * Math.sin(next);
      out += `${n(x0 - radius * k * Math.sin(angle))} ${n(y0 + radius * k * Math.cos(angle))} ${n(x1 + radius * k * Math.sin(next))} ${n(y1 - radius * k * Math.cos(next))} ${n(x1)} ${n(y1)} c `;
      angle = next;
    }
    s.push(out + "h f\n");
  }
  function donut(cx, top, radius, groups, centerLabel, centerValue) {
    const cy = py(top);
    const total = groups.reduce((acc, g) => acc + g.value, 0);
    if (total > 0) {
      let angle = Math.PI / 2;
      groups.filter(g => g.value > 0).forEach(g => {
        const next = angle - (g.value / total) * Math.PI * 2;
        slice(cx, cy, radius, angle, next, g.color);
        angle = next;
      });
    } else {
      s.push(`${rgb(C.tint)} rg ${circle(cx, cy, radius)} f\n`);
    }
    s.push(`${rgb(C.white)} rg ${circle(cx, cy, radius * 0.62)} f\n`);
    txt(cx, top - 1, 6, centerLabel, { align: "c", color: C.muted, bold: true, spacing: 0.5 });
    let size = 9.5;
    while (size > 6 && tw(centerValue, size, true) > radius * 1.1) size -= 0.5;
    txt(cx, top + 10, size, centerValue, { align: "c", bold: true });
  }
  // Brand mark: a stylised eye inside a ring, drawn in a 256-unit design space.
  function eye(x, top, size, o = {}) {
    const scale = size / 256, bottom = py(top) - size;
    s.push(`q ${n(scale * 1000) / 1000} 0 0 -${n(scale * 1000) / 1000} ${n(x)} ${n(bottom + size)} cm\n`);
    if (o.tile) s.push(`${rgb("#0A0A0A")} rg 0 0 256 256 re f\n`);
    if (o.ring) s.push(`${rgb(o.ring)} RG ${n(o.ringWidth || 3)} w ${circle(128, 128, 112)} S\n`);
    s.push(`${rgb(o.lid)} RG ${o.lidWidth || 7} w 56.32 128 m 104.11 83.63 151.89 83.63 199.68 128 c 151.89 172.37 104.11 172.37 56.32 128 c S\n`);
    s.push(`${rgb(o.accent)} RG ${o.irisWidth || 5.5} w ${circle(128, 128, 33.28)} S\n`);
    s.push(`${rgb(o.accent)} RG ${o.irisWidth || 5.5} w 112.64 138.24 m 128 117.76 l 143.36 138.24 l S\n`);
    s.push(`${rgb(o.lid)} rg ${circle(128, 128, 8.19)} f\n`);
    s.push(`${rgb(o.accent)} rg ${circle(56.32, 128, 3.5)} f ${circle(199.68, 128, 3.5)} f\n`);
    s.push("Q\n");
  }

  // Reusable blocks -------------------------------------------------------------------
  function section(kicker, title) {
    ensure(50);
    box(M, y, 18, 2.2, { fill: C.gold });
    txt(M, y + 14, 6.6, kicker, { bold: true, color: C.green, spacing: 1 });
    txt(M, y + 30, 13.5, title, { bold: true });
    rule(M, y + 37, W - M, y + 37, C.line, 0.8);
    y += 50;
  }
  function kpi(x, top, w, h, label, value, sub, o = {}) {
    box(x, top, w, h, { fill: o.fill || C.white, stroke: o.stroke || C.line, lw: 0.8, r: 6 });
    if (o.accent) box(x, top + 11, 3, h - 22, { fill: o.accent });
    txt(x + 14, top + 17, 6.4, label, { bold: true, color: o.labelColor || C.muted, spacing: 0.6 });
    let size = 15.5;
    while (size > 9 && tw(ascii(value), size, true) > w - 26) size -= 0.5;
    txt(x + 14, top + 39, size, value, { bold: true, color: o.valueColor || C.ink });
    if (sub) txt(x + 14, top + h - 9, 6.6, sub, { color: o.subColor || C.muted, maxW: w - 24 });
  }
  function kpiRow(items, h = 62) {
    ensure(h + 14);
    const gap = 10, w = (CW - gap * (items.length - 1)) / items.length;
    items.forEach((item, index) => kpi(M + index * (w + gap), y, w, h, item.label, item.value, item.sub, item));
    y += h + 14;
  }
  function legend(x, top, rows, width) {
    rows.forEach((row, index) => {
      const rowTop = top + index * 21;
      box(x, rowTop - 6, 7, 7, { fill: row.color, r: 2 });
      txt(x + 13, rowTop, 7.4, row.label, { bold: true, color: C.body, maxW: width - 36 });
      txt(x + width, rowTop, 7.4, row.share, { bold: true, align: "r", color: C.ink });
      txt(x + 13, rowTop + 9.5, 6.6, row.value, { color: C.muted });
    });
  }
  function table(columns, rows, o = {}) {
    const rowH = o.rowH || 21, headH = 22;
    const widths = columns.map(col => col.w * CW);
    const head = () => {
      box(M, y, CW, headH, { fill: C.deep, r: 4 });
      let x = M;
      columns.forEach((col, i) => {
        const right = col.align === "r";
        txt(right ? x + widths[i] - 9 : x + 9, y + 14.4, 6.5, col.label, { bold: true, color: C.white, align: right ? "r" : "l", spacing: 0.5, maxW: widths[i] - 18 });
        x += widths[i];
      });
      y += headH;
    };
    ensure(headH + rowH * 2);
    head();
    rows.forEach((row, index) => {
      if (y + rowH > H - FOOT) { newPage(); head(); }
      if (index % 2 === 0) box(M, y, CW, rowH, { fill: C.zebra });
      let x = M;
      columns.forEach((col, i) => {
        const cell = typeof row[i] === "object" && row[i] !== null ? row[i] : { text: row[i] };
        const right = col.align === "r";
        txt(right ? x + widths[i] - 9 : x + 9, y + 13.6, 7.6, cell.text, { bold: cell.bold ?? col.bold, color: cell.color || (col.bold ? C.ink : C.body), align: right ? "r" : "l", maxW: widths[i] - 18 });
        x += widths[i];
      });
      rule(M, y + rowH, W - M, y + rowH, "#EBF1ED", 0.5);
      y += rowH;
    });
    if (o.total) {
      if (y + rowH + 2 > H - FOOT) newPage();
      box(M, y, CW, rowH + 2, { fill: C.tint, r: 4 });
      txt(M + 9, y + 14, 7.8, o.total[0], { bold: true, color: C.deep });
      txt(W - M - 9, y + 14, 7.8, o.total[1], { bold: true, color: C.deep, align: "r" });
      y += rowH + 2;
    }
    y += 16;
  }
  function note(message, color = C.muted) {
    ensure(30);
    box(M, y, CW, 26, { fill: C.zebra, stroke: C.line, lw: 0.6, r: 5 });
    txt(M + 12, y + 16, 7.8, message, { color, maxW: CW - 24 });
    y += 40;
  }

  // Page 1: summary -------------------------------------------------------------------
  newPage();
  txt(M, y + 10, 7, "CONFIDENTIAL  |  PERSONAL FINANCIAL REPORT", { bold: true, color: C.green, spacing: 1.2 });
  txt(M, y + 36, 25, "Financial Position Report", { bold: true });
  txt(M, y + 53, 8.6, `Period: ${period}   |   Currency: ${reportCurrency}   |   Generated ${reportDate}`, { color: C.muted });
  const holderX = W - M - 186;
  box(holderX, y - 4, 186, 66, { fill: C.pale, stroke: C.line, lw: 0.8, r: 8 });
  box(holderX, y + 8, 3, 42, { fill: C.gold });
  txt(holderX + 15, y + 12, 6.2, "ACCOUNT HOLDER", { bold: true, color: C.green, spacing: 0.9 });
  txt(holderX + 15, y + 28, 11.5, preparedFor, { bold: true, maxW: 160 });
  if (holderEmail) txt(holderX + 15, y + 40, 7, holderEmail, { color: C.muted, maxW: 160 });
  txt(holderX + 15, y + 53, 6.4, `REF ${reportRef}`, { color: C.muted, bold: true, spacing: 0.5 });
  y += 72;

  section("BALANCE SHEET", "Your position at a glance");
  kpiRow([
    { label: "NET WORTH", value: money(totals.netWorth), sub: "Assets less liabilities", fill: C.deep, stroke: C.deep, labelColor: "#A9D3BF", valueColor: C.white, subColor: "#A9D3BF" },
    { label: "TOTAL ASSETS", value: money(totals.assets), sub: `${assets.length} ${assets.length === 1 ? "item" : "items"} recorded`, accent: C.green },
    { label: "TOTAL LIABILITIES", value: money(totals.liabilities), sub: `${liabilities.length} ${liabilities.length === 1 ? "obligation" : "obligations"} recorded`, accent: C.red },
    { label: "DEBT-TO-ASSET", value: debtToAsset === null ? "n/a" : pct(debtToAsset), sub: debtHealth, accent: debtHealthColor, subColor: debtHealthColor }
  ]);

  section("MONTHLY PLAN", period + " cash flow");
  kpiRow([
    { label: "MONTHLY INCOME", value: money(plan.income), sub: `${power.incomes.length} ${power.incomes.length === 1 ? "source" : "sources"}`, accent: C.green },
    { label: "PLANNED BUDGET", value: money(plan.budget), sub: `${power.budgets.length} budget ${power.budgets.length === 1 ? "line" : "lines"}`, accent: C.blue },
    { label: "SPENT", value: money(plan.spending), sub: plan.budget > 0 ? `${pct((plan.spending / plan.budget) * 100, 0)} of budget used` : "No budget set", accent: C.red },
    { label: "SAVINGS RATE", value: plan.income > 0 ? pct(savingsRate) : "n/a", sub: "Income less recorded spending", accent: C.gold }
  ]);

  // Mix panels
  ensure(190);
  section("COMPOSITION", "Where your money sits and goes");
  const panelTop = y, panelH = 150, panelW = (CW - 12) / 2;
  box(M, panelTop, panelW, panelH, { fill: C.white, stroke: C.line, lw: 0.8, r: 8 });
  box(M + panelW + 12, panelTop, panelW, panelH, { fill: C.white, stroke: C.line, lw: 0.8, r: 8 });
  txt(M + 14, panelTop + 18, 7, "ASSET MIX", { bold: true, color: C.green, spacing: 0.8 });
  txt(M + panelW + 26, panelTop + 18, 7, "SPENDING BY CATEGORY", { bold: true, color: C.green, spacing: 0.8 });
  const assetGroups = [
    { label: "Bank accounts", cats: ["Bank accounts"], color: C.green },
    { label: "Mobile money", cats: ["Mobile money"], color: C.gold },
    { label: "Cash & savings", cats: ["Cash & savings"], color: C.blue },
    { label: "Investments", cats: ["Investments"], color: C.purple },
    { label: "Property & other", cats: ["Property & vehicles", "Other assets"], color: C.red }
  ].map(group => ({ ...group, value: sum(assets.filter(item => group.cats.includes(item.category))) }));
  const assetTotal = assetGroups.reduce((acc, g) => acc + g.value, 0);
  donut(M + 62, panelTop + 82, 40, assetGroups, "ASSETS", money(totals.assets));
  legend(M + 118, panelTop + 46, assetGroups.map(g => ({ color: g.color, label: g.label, share: assetTotal ? pct((g.value / assetTotal) * 100, 0) : "0%", value: money(g.value) })), panelW - 134);
  const spendPalette = [C.red, C.gold, C.blue, C.purple, C.green, C.sage, C.amber, C.muted];
  let spendGroups = budgetCategories.map((label, i) => ({ label, value: sum(reportSpending.filter(item => item.category === label)), color: spendPalette[i % spendPalette.length] })).filter(g => g.value > 0).sort((a, b) => b.value - a.value);
  if (spendGroups.length > 5) spendGroups = [...spendGroups.slice(0, 4), { label: "Other categories", value: spendGroups.slice(4).reduce((acc, g) => acc + g.value, 0), color: C.muted }];
  const spendTotal = spendGroups.reduce((acc, g) => acc + g.value, 0);
  const rightX = M + panelW + 12;
  donut(rightX + 62, panelTop + 82, 40, spendGroups, "SPENT", money(plan.spending));
  if (spendGroups.length) legend(rightX + 118, panelTop + 46, spendGroups.map(g => ({ color: g.color, label: g.label, share: pct((g.value / spendTotal) * 100, 0), value: money(g.value) })), panelW - 134);
  else txt(rightX + 118, panelTop + 82, 7.4, "No spending recorded for this period.", { color: C.muted, maxW: panelW - 134 });
  y += panelH + 16;

  // Cash flow bars
  ensure(130);
  section("CASH FLOW", "Income, budget and spending");
  const flow = [
    { label: "Income", value: plan.income, color: C.green },
    { label: "Planned budget", value: plan.budget, color: C.blue },
    { label: "Spent", value: plan.spending, color: C.red },
    { label: plan.budget - plan.spending >= 0 ? "Budget remaining" : "Over budget", value: plan.budget - plan.spending, color: plan.budget - plan.spending >= 0 ? C.gold : C.red }
  ];
  const flowMax = Math.max(1, ...flow.map(item => Math.abs(item.value)));
  const barX = M + 96, barW = CW - 96 - 110;
  box(M, y, CW, 98, { fill: C.white, stroke: C.line, lw: 0.8, r: 8 });
  flow.forEach((item, index) => {
    const top = y + 14 + index * 20;
    txt(M + 14, top + 8, 7.8, item.label, { bold: true, color: C.body });
    box(barX, top, barW, 9, { fill: "#EDF2EF", r: 4.5 });
    const length = Math.max(item.value === 0 ? 0 : 4, (Math.abs(item.value) / flowMax) * barW);
    if (length > 0) box(barX, top, length, 9, { fill: item.color, r: 4.5 });
    txt(W - M - 14, top + 8, 7.8, money(item.value), { bold: true, align: "r" });
  });
  y += 98 + 16;

  // Key observations
  const insights = [];
  if (!entries.length && !power.incomes.length && !power.budgets.length) insights.push("Add accounts, income and a monthly budget to unlock personalised observations.");
  if (entries.length) insights.push(totals.netWorth >= 0 ? `Net worth stands at ${money(totals.netWorth)}, with assets exceeding liabilities.` : `Liabilities exceed assets by ${money(Math.abs(totals.netWorth))}; reducing debt is the fastest way to improve net worth.`);
  if (plan.income > 0) insights.push(`Recorded spending uses ${pct((plan.spending / plan.income) * 100)} of income, leaving ${pct(Math.max(0, savingsRate))} unspent.`);
  if (debtService !== null && monthlyInstallments > 0) insights.push(`Minimum loan installments take ${pct(debtService)} of monthly income${debtService > 40 ? ", above the commonly cited 40% comfort guideline" : ", within the commonly cited 40% comfort guideline"}.`);
  const leadQuest = quests.find(q => Number(q.target) > 0);
  if (leadQuest) insights.push(`${leadQuest.name} is ${questProgress(leadQuest)}% funded (${money(leadQuest.current)} of ${money(leadQuest.target)}).`);
  ensure(26 + insights.length * 17 + 14);
  section("OBSERVATIONS", "What stands out");
  box(M, y - 6, CW, insights.length * 17 + 14, { fill: C.pale, stroke: C.line, lw: 0.6, r: 8 });
  insights.forEach((line, index) => {
    box(M + 14, y + 6 + index * 17 - 5, 4, 4, { fill: C.green, r: 1 });
    txt(M + 26, y + 6 + index * 17, 8, line, { color: C.body, maxW: CW - 40 });
  });
  y += insights.length * 17 + 20;

  // Liabilities schedule --------------------------------------------------------------
  section("DEBT & OBLIGATIONS", "Liabilities schedule");
  kpiRow([
    { label: "OUTSTANDING PRINCIPAL", value: money(totals.liabilities), sub: `${liabilities.length} ${liabilities.length === 1 ? "liability" : "liabilities"}`, accent: C.red },
    { label: "MIN. MONTHLY INSTALLMENTS", value: money(monthlyInstallments), sub: "Across all loans", accent: C.amber },
    { label: "DEBT SERVICE RATIO", value: debtService === null ? "n/a" : pct(debtService), sub: debtService === null ? "Add income to calculate" : "Installments / income", accent: debtService !== null && debtService > 40 ? C.red : C.green },
    { label: "LONGEST TENURE", value: longestTenure ? `${longestTenure} mo` : "n/a", sub: loanDates.length ? `Final payoff ${new Date(`${loanDates[loanDates.length - 1]}T12:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}` : "No payoff date set", accent: C.blue }
  ]);
  if (!liabilities.length) {
    note("No liabilities recorded. Add loans, cards or other debts in Inventory to see them here.");
  } else {
    const cols = ["LENDER / TYPE", "OUTSTANDING PRINCIPAL", "INTEREST (APR / TYPE)", "MIN. MONTHLY INSTALLMENT", "REMAINING TENURE"];
    liabilities.slice().sort((a, b) => Number(b.amount) - Number(a.amount)).forEach(item => {
      const loan = item.loan || null;
      const cardH = item.notes ? 90 : 78;
      ensure(cardH + 10);
      box(M, y, CW, cardH, { fill: C.white, stroke: C.line, lw: 0.8, r: 8 });
      box(M, y + 12, 3.2, cardH - 24, { fill: C.red });
      txt(M + 16, y + 20, 10.5, item.name, { bold: true, maxW: CW - 190 });
      txt(W - M - 14, y + 20, 7, item.category, { align: "r", color: C.muted, bold: true, spacing: 0.4 });
      rule(M + 14, y + 29, W - M - 14, y + 29, "#EBF1ED", 0.6);
      const colW = (CW - 28) / 5;
      const values = [
        loan?.lenderType || item.category,
        money(item.amount),
        loan ? formatLoanRate(loan) : "Not set",
        loan && loan.minInstallment !== null && loan.minInstallment !== undefined ? `${money(loan.minInstallment)}/mo` : "Not set",
        loan && loan.tenureMonths !== null && loan.tenureMonths !== undefined ? `${loan.tenureMonths} ${loan.tenureMonths === 1 ? "month" : "months"} left` : "Not set"
      ];
      const payoff = loan?.payoffDate ? `Payoff ${new Date(`${loan.payoffDate}T12:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}` : "";
      cols.forEach((label, i) => {
        const x = M + 14 + i * colW;
        txt(x, y + 42, 5.6, label, { bold: true, color: C.muted, spacing: 0.3, maxW: colW - 6 });
        const unset = values[i] === "Not set";
        txt(x, y + 56, 8.6, values[i], { bold: true, color: unset ? C.muted : i === 1 ? C.red : C.ink, maxW: colW - 8 });
        if (i === 4 && payoff) txt(x, y + 67, 6.4, payoff, { color: C.muted, maxW: colW - 8 });
      });
      if (item.notes) txt(M + 16, y + 83, 7, `Note: ${item.notes}`, { color: C.muted, maxW: CW - 32 });
      y += cardH + 10;
    });
    y += 4;
    note("Minimum installments and tenure are the figures you entered; actual balances depend on your lender's statements.");
  }

  // Detail tables ---------------------------------------------------------------------
  section("ASSETS", "Asset register");
  if (assets.length) {
    table(
      [{ label: "ACCOUNT / ITEM", w: 0.36, bold: true }, { label: "CATEGORY", w: 0.26 }, { label: "DETAIL", w: 0.2 }, { label: "BALANCE", w: 0.18, align: "r", bold: true }],
      assets.map(item => [item.name, item.category, item.mobileType || item.mobileReference || "-", money(item.amount)]),
      { total: ["Total assets", money(totals.assets)] }
    );
  } else note("No assets recorded yet.");

  section("INCOME & BUDGET", "Monthly plan lines");
  const planRows = [
    ...power.incomes.map(item => [item.name, { text: "INCOME", color: C.green, bold: true }, "Monthly source", money(item.amount)]),
    ...power.budgets.map(item => [item.name, { text: "BUDGET", color: C.blue, bold: true }, item.category, money(item.amount)])
  ];
  if (planRows.length) table([{ label: "ITEM", w: 0.36, bold: true }, { label: "TYPE", w: 0.16 }, { label: "CATEGORY", w: 0.3 }, { label: "MONTHLY AMOUNT", w: 0.18, align: "r", bold: true }], planRows);
  else note("No income or budget lines recorded yet.");

  section("SPENDING", `Recorded expenses (${period.toLowerCase()})`);
  if (reportSpending.length) {
    table(
      [{ label: "EXPENSE", w: 0.36, bold: true }, { label: "CATEGORY", w: 0.28 }, { label: "MONTH", w: 0.18 }, { label: "AMOUNT", w: 0.18, align: "r", bold: true }],
      reportSpending.map(item => [item.name, item.category, item.month || getReportMonth(), money(item.amount)]),
      { total: ["Total spending", money(plan.spending)] }
    );
  } else note("No spending recorded for this period.");

  section("GOALS", "Quest progress");
  if (quests.length) {
    quests.forEach(quest => {
      ensure(38);
      const progress = questProgress(quest);
      box(M, y, CW, 32, { fill: C.white, stroke: C.line, lw: 0.7, r: 6 });
      txt(M + 14, y + 14, 8.6, quest.name, { bold: true, maxW: CW * 0.5 });
      txt(W - M - 56, y + 14, 7.6, `${money(quest.current)} of ${money(quest.target)}`, { align: "r", color: C.muted });
      txt(W - M - 14, y + 14, 8.6, `${progress}%`, { align: "r", bold: true, color: progress === 100 ? C.green : C.ink });
      box(M + 14, y + 20, CW - 28, 5, { fill: "#EDF2EF", r: 2.5 });
      if (progress > 0) box(M + 14, y + 20, Math.max(5, ((CW - 28) * progress) / 100), 5, { fill: C.green, r: 2.5 });
      y += 40;
    });
  } else note("No quests created yet.");

  // Performance review: scored health indicators, a plain-language summary, and next-month guidance.
  section("PERFORMANCE REVIEW", "Summary of performance and financial health");
  const monthlyView = period !== "Year to date";
  const liquid = sum(assets.filter(item => ["Bank accounts", "Mobile money", "Cash & savings"].includes(item.category)));
  const spendBasis = plan.spending > 0 ? plan.spending : plan.budget;
  const clamp01 = value => Math.max(0, Math.min(1, value));
  const rating = score => score >= 75 ? { text: "Strong", color: C.green } : score >= 45 ? { text: "Fair", color: C.amber } : { text: "Weak", color: C.red };
  const annualRate = loan => {
    if (!loan || loan.interestRate === null || loan.interestRate === undefined) return null;
    const rate = Number(loan.interestRate), kind = String(loan.rateType || "");
    return kind.startsWith("per month") ? rate * 12 : kind.startsWith("per day") ? rate * 365 : rate;
  };
  const comps = [];
  const liveSavingsRate = plan.income > 0 && spendBasis > 0 ? ((plan.income - spendBasis) / plan.income) * 100 : null;
  if (monthlyView && liveSavingsRate !== null) comps.push({ weight: 25, score: clamp01(liveSavingsRate / 20) * 100, label: "Savings rate", result: pct(liveSavingsRate), meaning: liveSavingsRate >= 20 ? "Meets the 20% saving guideline" : "Below the 20% saving guideline" });
  if (monthlyView && plan.budget > 0 && plan.spending > 0) {
    const ratio = plan.spending / plan.budget;
    comps.push({ weight: 15, score: ratio <= 1 ? 100 : clamp01(1 - (ratio - 1) / 0.5) * 100, label: "Budget adherence", result: pct(ratio * 100, 0) + " used", meaning: ratio <= 1 ? "Spending within planned budget" : `Over budget by ${money(plan.spending - plan.budget)}` });
  }
  if (assets.length || liabilities.length) {
    const lev = totals.liabilities === 0 ? 0 : debtToAsset === null ? 100 : debtToAsset;
    comps.push({ weight: 15, score: lev < 30 ? 100 : lev >= 80 ? 0 : (1 - (lev - 30) / 50) * 100, label: "Debt-to-asset ratio", result: totals.liabilities === 0 ? "No debt" : debtToAsset === null ? "No assets" : pct(debtToAsset), meaning: lev < 30 ? "Debt is under 30% of assets" : lev <= 50 ? "Moderate leverage (30-50%)" : "Debt is heavy relative to assets" });
  }
  if (plan.income > 0 && (!liabilities.length || monthlyInstallments > 0)) {
    const load = debtService ?? 0;
    comps.push({ weight: 15, score: load <= 20 ? 100 : load >= 50 ? 0 : (1 - (load - 20) / 30) * 100, label: "Debt service ratio", result: liabilities.length ? pct(load) : "No debt", meaning: load <= 20 ? "Installments are well covered" : load <= 40 ? "Installments are manageable" : "Installments take a large share" });
  }
  const goalQuests = quests.filter(q => Number(q.target) > 0);
  if (goalQuests.length) {
    const avg = goalQuests.reduce((acc, q) => acc + questProgress(q), 0) / goalQuests.length;
    comps.push({ weight: 10, score: avg, label: "Goal progress", result: pct(avg, 0), meaning: "Average progress across quests" });
  }
  const outflow = plan.spending > 0 ? plan.spending : plan.budget;
  const coverMonths = outflow > 0 && monthlyView ? liquid / outflow : null;
  if (coverMonths !== null) comps.push({ weight: 20, score: clamp01(coverMonths / 6) * 100, label: "Emergency cover", result: `${coverMonths.toFixed(1)} months`, meaning: "Liquid savings vs monthly outflow" });
  const weightTotal = comps.reduce((acc, c) => acc + c.weight, 0);
  const healthScore = comps.length >= 2 ? Math.round(comps.reduce((acc, c) => acc + c.score * c.weight, 0) / weightTotal) : null;
  const health = healthScore === null ? { text: "Not enough data", color: C.muted } : healthScore >= 75 ? { text: "STRONG", color: C.green } : healthScore >= 55 ? { text: "STABLE", color: C.blue } : healthScore >= 35 ? { text: "NEEDS ATTENTION", color: C.amber } : { text: "AT RISK", color: C.red };

  const story = [];
  if (plan.income > 0 || plan.spending > 0) story.push(`In ${period.toLowerCase()}, income was ${money(plan.income)} against spending of ${money(plan.spending)}${monthlyView && plan.income > 0 && plan.spending > 0 ? `, a savings rate of ${pct(savingsRate)}` : ""}.`);
  if (entries.length) story.push(`Net worth is ${money(totals.netWorth)} with ${money(totals.assets)} in assets and ${money(totals.liabilities)} in liabilities.`);
  if (liabilities.length && monthlyInstallments > 0) story.push(`Loan installments of ${money(monthlyInstallments)} a month take ${debtService === null ? "an unknown share of" : pct(debtService) + " of"} income.`);
  if (coverMonths !== null) story.push(`Liquid savings cover roughly ${coverMonths.toFixed(1)} months of outflow.`);
  if (!monthlyView) story.push("Switch the report to This month or Last month for spending-based ratings.");
  if (!story.length) story.push("There is not yet enough recorded data to assess performance. Add accounts, income, budgets and spending to unlock this review.");
  const storyLines = wrap(story.join(" "), 8, false, CW - 196);
  const cardH = Math.max(100, storyLines.length * 11.5 + 40);
  ensure(cardH + 16);
  box(M, y, CW, cardH, { fill: C.white, stroke: C.line, lw: 0.8, r: 8 });
  box(M, y, 168, cardH, { fill: C.pale, r: 8 });
  txt(M + 16, y + 20, 6.4, "FINANCIAL HEALTH SCORE", { bold: true, color: C.muted, spacing: 0.7 });
  txt(M + 16, y + 52, 30, healthScore === null ? "--" : String(healthScore), { bold: true, color: health.color });
  if (healthScore !== null) txt(M + 16 + tw(String(healthScore), 30, true) + 5, y + 52, 10, "/ 100", { color: C.muted });
  box(M + 16, y + 62, 136, 5, { fill: "#DCE6DF", r: 2.5 });
  if (healthScore) box(M + 16, y + 62, Math.max(5, (136 * healthScore) / 100), 5, { fill: health.color, r: 2.5 });
  txt(M + 16, y + 82, 7.6, health.text, { bold: true, color: health.color, spacing: 0.8 });
  txt(M + 184, y + 20, 6.4, "PERFORMANCE SUMMARY", { bold: true, color: C.green, spacing: 0.8 });
  storyLines.forEach((line, index) => txt(M + 184, y + 36 + index * 11.5, 8, line, { color: C.body }));
  y += cardH + 16;

  if (comps.length) {
    table(
      [{ label: "INDICATOR", w: 0.24, bold: true }, { label: "RESULT", w: 0.16 }, { label: "RATING", w: 0.14 }, { label: "WHAT IT MEANS", w: 0.46 }],
      comps.map(c => { const r = rating(c.score); return [c.label, c.result, { text: r.text, color: r.color, bold: true }, c.meaning]; })
    );
  }

  // Next-month plan
  section("LOOKING AHEAD", "Suggestions for next month");
  const targetSave = plan.income > 0 ? plan.income * 0.2 : null;
  const questLeft = goalQuests.length ? goalQuests.reduce((acc, q) => acc + Math.max(0, Number(q.target) - Number(q.current)), 0) : null;
  kpiRow([
    { label: "SAVINGS TARGET", value: targetSave === null ? "n/a" : money(targetSave), sub: "20% of income guideline", accent: C.green },
    { label: "SPENDING CEILING", value: targetSave === null ? "n/a" : money(Math.max(0, plan.income - targetSave)), sub: "Keeps the savings target", accent: C.blue },
    { label: "INSTALLMENTS DUE", value: money(monthlyInstallments), sub: liabilities.length ? "Minimum payments" : "No loans recorded", accent: C.amber },
    { label: "GOAL TOP-UP", value: questLeft === null ? "n/a" : money(questLeft / 6), sub: questLeft === null ? "No quest set" : "Finishes quests in ~6 months", accent: C.gold }
  ]);

  const tips = [];
  if (plan.income === 0) tips.push({ p: "HIGH", title: "Record your income", detail: "No income is recorded, so savings and debt ratios cannot be measured. Add your salary and other sources in Power-Up." });
  if (monthlyView && liveSavingsRate !== null) {
    if (liveSavingsRate < 10) tips.push({ p: "HIGH", title: "Lift your savings rate", detail: `Your savings rate is ${pct(liveSavingsRate)}. Moving toward 20% means setting aside about ${money(plan.income * 0.2)} next month, mainly by trimming flexible categories.` });
    else if (liveSavingsRate < 20) tips.push({ p: "MEDIUM", title: "Close the gap to a 20% savings rate", detail: `You are saving ${pct(liveSavingsRate)} of income. Setting aside ${money(plan.income * 0.2)} next month would reach the 20% guideline.` });
    else tips.push({ p: "GOOD", title: "Keep your savings habit going", detail: `A ${pct(liveSavingsRate)} savings rate is healthy. Consider placing the surplus in an interest-earning account so it works for you.` });
  }
  if (monthlyView) {
    const over = budgetCategories.map(cat => ({ cat, planned: sum(power.budgets.filter(b => b.category === cat)), spent: sum(reportSpending.filter(e => e.category === cat)) })).filter(r => r.planned > 0 && r.spent > r.planned).sort((a, b) => (b.spent - b.planned) - (a.spent - a.planned));
    if (over.length) tips.push({ p: over[0].spent - over[0].planned > plan.income * 0.05 ? "HIGH" : "MEDIUM", title: `Rein in ${over[0].cat}`, detail: `${over[0].cat} ran ${money(over[0].spent - over[0].planned)} over its ${money(over[0].planned)} budget. Set a firm cap, or adjust the budget line so it reflects reality.` });
    const unbudgeted = budgetCategories.map(cat => ({ cat, planned: sum(power.budgets.filter(b => b.category === cat)), spent: sum(reportSpending.filter(e => e.category === cat)) })).filter(r => r.planned === 0 && r.spent > 0).sort((a, b) => b.spent - a.spent);
    if (unbudgeted.length) tips.push({ p: "LOW", title: `Budget for ${unbudgeted[0].cat}`, detail: `${money(unbudgeted[0].spent)} was spent on ${unbudgeted[0].cat} with no budget line. Add one so it is planned rather than a surprise.` });
    if (!reportSpending.length && plan.budget > 0) tips.push({ p: "LOW", title: "Log your spending", detail: "No expenses are recorded for this period, so budget tracking is flying blind. Record spending as it happens in Power-Up." });
  }
  if (debtService !== null && debtService > 40) tips.push({ p: "HIGH", title: "Ease the installment load", detail: `Installments take ${pct(debtService)} of income, above the 40% comfort guideline. Speak to lenders about restructuring only if the total cost stays acceptable.` });
  const costly = liabilities.filter(item => annualRate(item.loan) !== null && annualRate(item.loan) > 0).sort((a, b) => annualRate(b.loan) - annualRate(a.loan))[0];
  if (costly) tips.push({ p: annualRate(costly.loan) >= 30 ? "HIGH" : "MEDIUM", title: "Target the costliest debt first", detail: `${costly.name} carries the highest cost (${formatLoanRate(costly.loan)}). After minimum payments, directing any surplus here saves the most interest.` });
  const incomplete = liabilities.find(item => !item.loan || item.loan.minInstallment === null || item.loan.minInstallment === undefined);
  if (incomplete) tips.push({ p: "LOW", title: "Complete your loan details", detail: `Add the interest rate, installment and tenure for ${incomplete.name} so debt ratios and payoff dates are accurate.` });
  if (coverMonths !== null && coverMonths < 6) tips.push({ p: coverMonths < 3 ? "HIGH" : "MEDIUM", title: "Strengthen your emergency buffer", detail: `Liquid savings cover about ${coverMonths.toFixed(1)} months of outflow. Work toward 3 to 6 months, roughly ${money(outflow * 3)} to ${money(outflow * 6)}.` });
  const nextQuest = goalQuests.find(q => questProgress(q) < 100);
  if (nextQuest) tips.push({ p: "MEDIUM", title: `Keep funding ${nextQuest.name}`, detail: `This quest is ${questProgress(nextQuest)}% complete. About ${money((Number(nextQuest.target) - Number(nextQuest.current)) / 6)} a month would finish it in six months.` });
  if (!tips.length) tips.push({ p: "GOOD", title: "Add data to unlock suggestions", detail: "Record accounts, income, a budget and spending, and this section will give tailored guidance for next month." });
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2, GOOD: 3 };
  const tipColor = { HIGH: C.red, MEDIUM: C.amber, LOW: C.blue, GOOD: C.green };
  tips.sort((a, b) => order[a.p] - order[b.p]).slice(0, 6).forEach((tip, index) => {
    const lines = wrap(tip.detail, 7.8, false, CW - 74);
    const h = 34 + lines.length * 11;
    ensure(h + 8);
    box(M, y, CW, h, { fill: C.white, stroke: C.line, lw: 0.8, r: 7 });
    box(M, y + 10, 3, h - 20, { fill: tipColor[tip.p] });
    s.push(`${rgb(C.tint)} rg ${circle(M + 28, py(y + 21), 9)} f\n`);
    txt(M + 28, y + 24, 9, String(index + 1), { bold: true, align: "c", color: C.deep });
    txt(M + 46, y + 21, 9.4, tip.title, { bold: true, maxW: CW - 150 });
    txt(W - M - 14, y + 21, 6.2, tip.p === "GOOD" ? "ON TRACK" : tip.p + " PRIORITY", { bold: true, align: "r", color: tipColor[tip.p], spacing: 0.6 });
    lines.forEach((line, li) => txt(M + 46, y + 35 + li * 11, 7.8, line, { color: C.body }));
    y += h + 8;
  });
  note("Suggestions are rule-based guidelines drawn from your recorded figures, not personalised financial advice.");

  ensure(60);
  y += 4;
  box(M, y, CW, 46, { fill: C.pale, stroke: C.line, lw: 0.6, r: 8 });
  txt(M + 14, y + 16, 6.6, "IMPORTANT NOTICE", { bold: true, color: C.green, spacing: 0.8 });
  txt(M + 14, y + 29, 6.9, "This report is generated from information you entered in NetraOS and stored on your device. It is for personal planning only and", { color: C.muted });
  txt(M + 14, y + 38, 6.9, "is not financial, tax or legal advice. Verify figures with your lenders and official sources before acting on them.", { color: C.muted });
  y += 56;

  // Chrome: header band, footer, watermark (drawn last so page numbers are known) -------
  const total = pages.length;
  pages.forEach((stream, index) => {
    s = stream;
    box(0, 0, W, 52, { fill: C.deep });
    box(0, 50, W, 2, { fill: C.gold });
    eye(M, 11, 30, { tile: true, lid: "#F2F1E1", accent: "#E3B74B", ring: "#1F2937", ringWidth: 1, lidWidth: 7 });
    txt(M + 40, 26, 13.5, "NETRAOS", { bold: true, color: C.white, spacing: 1.2 });
    txt(M + 40, 38, 6.2, "YOUR FINANCIAL OPERATING SYSTEM", { color: "#A9D3BF", spacing: 0.7 });
    txt(W - M, 24, 7.4, "FINANCIAL POSITION REPORT", { bold: true, color: C.gold, align: "r", spacing: 0.9 });
    txt(W - M, 37, 6.8, `${period}  |  ${reportDate}`, { color: "#A9D3BF", align: "r" });
    rule(M, H - 40, W - M, H - 40, C.line, 0.7);
    txt(M, H - 28, 6.6, `NetraOS  |  Account holder: ${preparedFor}  |  ${reportRef}`, { color: C.muted, maxW: CW - 90 });
    txt(W - M, H - 28, 6.6, `Page ${index + 1} of ${total}`, { color: C.muted, bold: true, align: "r" });
    // Translucent watermark centred on the page, sitting over content at low opacity.
    s.push("q /G1 gs\n");
    eye((W - 300) / 2, 255, 300, { lid: C.green, accent: C.gold, ring: C.green, ringWidth: 2.2, lidWidth: 5, irisWidth: 4 });
    txt(W / 2, 600, 34, "NETRAOS", { bold: true, color: C.green, align: "c", spacing: 10 });
    txt(W / 2, 622, 8, "PRIVATE FINANCIAL REPORT", { bold: true, color: C.green, align: "c", spacing: 4 });
    s.push("Q\n");
  });

  // PDF assembly ----------------------------------------------------------------------
  const infoId = 6 + total * 2;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${6 + i * 2} 0 R`).join(" ")}] /Count ${total} >>`,
    "<< /Font << /F1 4 0 R /F2 5 0 R >> /ExtGState << /G1 << /Type /ExtGState /ca 0.07 /CA 0.07 >> >> >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
  ];
  pages.forEach((stream, index) => {
    const body = stream.join("");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources 3 0 R /Contents ${7 + index * 2} 0 R >>`);
    objects.push(`<< /Length ${body.length} >>\nstream\n${body}endstream`);
  });
  const pdfDate = `D:${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}00`;
  objects.push(`<< /Title (NetraOS Financial Position Report) /Author (${esc(preparedFor)}) /Creator (NetraOS) /Producer (NetraOS) /CreationDate (${pdfDate}) >>`);
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(offset => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  saveFile("netraos-financial-report.pdf", pdf, "application/pdf");
  showToast("Financial report downloaded.");
}

// Route menu selections to date, currency, profile, settings, and export actions.
function handleMenuChoice(action) {
  closePopover();
  if (action === "profile") {
    showPage("Profile");
    return;
  }
  if (action === "settings") {
    showPage("Settings");
    return;
  }
  if (action === "sign-out") {
    localStorage.removeItem(sessionStorageKey);
    window.clearTimeout(autoLockNudgeTimer);
    if (window.NetraSupabase?.enabled) window.NetraSupabase.signOut().catch(error => console.warn("Supabase sign-out failed:", error.message));
    showPublicPage("landing");
    return;
  }
  if (action.startsWith("period:")) {
    const period = action.slice("period:".length);
    localStorage.setItem(reportPeriodStorageKey, period);
    const button = document.querySelector(".period-button");
    if (button) button.innerHTML = `${period} <svg class="dropdown-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>`;
    refreshFinancialPage();
    showToast(`Showing ${period.toLowerCase()} spending.`);
    return;
  }
  if (action.startsWith("date:")) {
    const date = action.slice("date:".length);
    const label = document.querySelector(".date-select-label");
    if (label) label.textContent = date;
    showToast("Selected " + date + ".");
    return;
  }
  if (action.startsWith("setting:")) {
    const [, name, value] = action.split(":");
    if (name === "displayCurrency") {
      if (!getCurrencyState().rates[value]) {
        openCurrencyRatesDialog(value);
        return;
      }
      setSettingsDropdown(name, value, `${displayCurrencies[value].symbol} · ${displayCurrencies[value].name}`);
    } else if (name === "financialYearStartMonth") {
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      setSettingsDropdown(name, value, months[Number(value) - 1]);
    }
    return;
  }
  if (action === "currency:rates") {
    openCurrencyRatesDialog();
    return;
  }
  if (action.startsWith("currency:")) {
    const code = action.slice("currency:".length);
    const state = getCurrencyState();
    if (state.rates[code]) {
      state.active = code;
      saveCurrencyState(state);
      updateCurrencySwitcher();
      showPage(crumb.textContent);
      return;
    }
    openCurrencyRatesDialog(code);
    return;
  }
  if (action === "download-csv") {
    downloadSummary();
    return;
  }
  if (action === "download-excel") {
    downloadExcel();
    return;
  }
  if (action === "download-pdf") {
    downloadPDF();
    return;
  }
  showToast(action === "details" ? "Dashboard figures are at zero and ready for your accounts." : "You’re all caught up.");
}

// Page controls and delegated event handlers connect rendered controls to app actions.
navItems.forEach(item => {
  item.addEventListener("click", () => showPage(item.dataset.page));
});

// Phone sidebar menu: opens from the hamburger, closes on backdrop, Escape, navigation, or leaving phone width.
const navDrawer = document.querySelector("#mobile-drawer");
const navToggle = document.querySelector("[data-nav-toggle]");
const phoneNavQuery = window.matchMedia("(max-width: 880px)");

function setNavDrawer(open, { restoreFocus = true } = {}) {
  if (!navDrawer || !navToggle) return;
  const wasOpen = appShell.classList.contains("drawer-open");
  appShell.classList.toggle("drawer-open", open);
  document.body.classList.toggle("drawer-scroll-lock", open);
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  navDrawer.inert = !open;
  if (open) {
    (navDrawer.querySelector(".drawer-item.active") || navDrawer.querySelector(".drawer-item"))?.focus();
  } else if (wasOpen && restoreFocus) {
    navToggle.focus();
  }
}

// On phones the header's date, currency, privacy and theme buttons live in the sidebar. The real nodes are
// moved (not cloned) so every querySelector, delegated handler and stored setting keeps working.
const drawerTools = document.querySelector("[data-drawer-tools]");
const movableControls = [".date-select", ".theme-toggle"]
  .map(selector => document.querySelector(`.topbar-actions ${selector}`))
  .filter(Boolean);
function placeHeaderControls(isPhone) {
  if (!drawerTools) return;
  const home = document.querySelector(".topbar-actions");
  const profile = home?.querySelector(".profile-button");
  movableControls.forEach(control => {
    if (isPhone) drawerTools.append(control);
    else home.insertBefore(control, profile);
  });
}
placeHeaderControls(phoneNavQuery.matches);
phoneNavQuery.addEventListener("change", event => placeHeaderControls(event.matches));
// closePopover() resets every aria-expanded; re-assert the menu button's state after a tool is used.
drawerTools?.addEventListener("click", () => setTimeout(() =>
  navToggle.setAttribute("aria-expanded", String(appShell.classList.contains("drawer-open"))), 0));

navToggle?.addEventListener("click", () => setNavDrawer(!appShell.classList.contains("drawer-open")));
navDrawer?.addEventListener("click", event => {
  if (event.target.closest(".drawer-item, .top-brand")) setNavDrawer(false, { restoreFocus: false });
});
document.querySelector(".drawer-backdrop")?.addEventListener("click", () => setNavDrawer(false));
navDrawer?.querySelector(".drawer-close")?.addEventListener("click", () => setNavDrawer(false));
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && appShell.classList.contains("drawer-open") && !document.querySelector(".action-popover")) setNavDrawer(false);
  // Keep Tab focus inside the open drawer.
  if (event.key === "Tab" && appShell.classList.contains("drawer-open")) {
    const focusable = [...navDrawer.querySelectorAll("button, a[href]")];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
phoneNavQuery.addEventListener("change", event => { if (!event.matches) setNavDrawer(false, { restoreFocus: false }); });
phoneNavQuery.addEventListener("change", event => {
  if (!appShell.hidden) return;
  const currentPage = decodeURIComponent(window.location.hash.slice(1));
  if (event.matches && ["", "home", "welcome"].includes(currentPage)) {
    let introSeen = false;
    try { introSeen = localStorage.getItem(phoneIntroStorageKey) === "true"; } catch { /* Treat unavailable storage as a first visit. */ }
    if (introSeen) showPhoneWelcome();
    else showPhoneIntro();
  } else if (!event.matches && ["intro", "welcome"].includes(currentPage)) {
    showPublicPage("landing");
  }
});
// If the app locks or signs out while the menu is open, reset it so it is closed on return.
new MutationObserver(() => { if (appShell.hidden) setNavDrawer(false, { restoreFocus: false }); })
  .observe(appShell, { attributes: true, attributeFilter: ["hidden"] });

function friendlyAuthMessage(error, fallback = "We couldn’t complete that just now. This may work again in a little while.") {
  const message = String(error?.message || error || "").toLowerCase();
  if (/email.*rate limit|rate limit.*email|over_email_send_rate_limit/.test(message)) {
    return "We’ve sent several account emails recently, so delivery is paused for a little while. We should be able to send another in about an hour.";
  }
  if (/rate limit exceeded|429|too many requests/.test(message)) {
    return "There have been several attempts in a short time, so we’ve paused this for a little while. Another try soon may work.";
  }
  if (/invalid login credentials|invalid.*credentials/.test(message)) {
    return "Those sign-in details didn’t match an account. The email and password are worth checking, and “Forgot your password?” is there if you need a reset link.";
  }
  if (/email not confirmed|email.*not.*confirm/.test(message)) {
    return "This email still needs confirmation. The link may be in your inbox or spam folder. An expired link can be requested again after the email limit resets.";
  }
  if (/pgrst205|42p01|could not find the table|relation .* does not exist|schema cache/.test(message)) {
    return "Your sign-in was accepted, but the NetraOS database tables aren’t available yet. Run supabase/schema.sql in your Supabase project’s SQL Editor, then try again.";
  }
  if (/row.level security|permission denied|insufficient privilege|not authorized|42501/.test(message)) {
    return "Your sign-in was accepted, but a Supabase access policy is blocking account data. If you enabled the old authenticator policy, run supabase/migrations/20261015_remove_totp_aal2.sql in SQL Editor, then try again.";
  }
  if (/user already registered|already.*registered|already.*exists/.test(message)) {
    return "There’s already an account with this email. Signing in or using “Forgot your password?” should get you back in.";
  }
  if (/weak password|password.*too short/.test(message)) {
    return "A password with at least 8 characters is needed.";
  }
  if (/failed to fetch|network|load failed|fetch error/.test(message)) {
    return "We couldn’t reach the sign-in service just now. A connection check and another try may help.";
  }
  if (/sign-in succeeded|could not load your account/.test(message)) {
    return "You’re signed in, but your account data didn’t load just now. Your saved information is still here; another try in a little while may help.";
  }
  return fallback;
}

// Handle local sign-in, profile edits, settings, and financial record submissions.
document.addEventListener("submit", async event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  if (form.matches("[data-auth-form]")) {
    event.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    const error = form.querySelector(".auth-error");
    const fail = message => {
      error.textContent = message;
      error.classList.remove("success");
      error.hidden = false;
    };
    if (!email.includes("@") || password.length < 8) {
      fail("A valid email address and a password with at least 8 characters are needed.");
      return;
    }

    if (window.NETRAOS_SUPABASE_CONFIG && !window.NetraSupabase?.enabled) {
      fail("We couldn’t connect to the sign-in service just now. A connection check and another try may help.");
      return;
    }

    if (window.NetraSupabase?.enabled) {
      const isSignup = form.dataset.authForm === "signup";
      const name = String(formData.get("name") || "").trim();
      if (isSignup && name.length < 2) { fail("The name you’d like associated with your account is needed."); return; }
      if (isSignup && !formData.has("acceptTerms")) { fail("Please accept the Terms of Service and acknowledge the Privacy Policy to create your account."); return; }
      try {
        if (isSignup) {
          const termsAcceptedAt = new Date().toISOString();
          const result = await window.NetraSupabase.signUp(email, password, { full_name: name, terms_version: termsVersion, terms_accepted_at: termsAcceptedAt });
          if (result.error) throw result.error;
          if (!result.data.session) {
            error.textContent = `A confirmation email is on its way to ${email}. The link in it will finish setting up your account; you can return here to sign in afterward.`;
            error.classList.add("success");
            error.hidden = false;
            return;
          }
          const profile = await window.NetraSupabase.bootstrap();
          if (!profile) throw new Error("Account setup completed, but NetraOS couldn’t load your account.");
          showPreferredNamePrompt(profile);
          return;
        }
        const result = await window.NetraSupabase.signIn(email, password);
        if (result.error) throw result.error;
        const profile = await window.NetraSupabase.bootstrap();
        if (!profile) throw new Error("Sign-in succeeded, but NetraOS could not load your account.");
        if (!profile.username) showPreferredNamePrompt(profile);
        else enterApp(profile);
      } catch (authError) {
        fail(friendlyAuthMessage(authError, isSignup
          ? "We couldn’t finish setting up your account just now. This may work again in a little while."
          : "We couldn’t sign you in just now. Another try or the password-reset link may help."));
      }
      return;
    }

    if (form.dataset.authForm === "signup") {
      const name = String(formData.get("name") || "").trim();
      if (name.length < 2) {
        fail("The name you’d like associated with your profile is needed.");
        return;
      }
      if (!formData.has("acceptTerms")) {
        fail("Creating a profile requires accepting the Terms of Service and acknowledging the Privacy Policy.");
        return;
      }
      const currentProfile = getStoredProfile();
      if (currentProfile && String(currentProfile.email || "").toLowerCase() !== email) {
      fail("This browser already has a local profile. Its saved email address is the one to use when signing in.");
        return;
      }
      if (currentProfile?.passwordHash) {
      fail("A local profile already uses this email. The Log in option will take you back to it.");
        return;
      }
      let passwordVerifier;
      try { passwordVerifier = await createLocalPasswordVerifier(password); }
      catch { fail("We couldn’t set up your password securely in this browser. Please try another browser or device."); return; }
      const profile = {
        ...(currentProfile || {}),
        name,
        email,
        ...passwordVerifier,
        termsVersion,
        termsAcceptedAt: new Date().toISOString()
      };
      if (currentProfile) {
        showEmailCodeChallenge({
          email,
          purpose: "account-upgrade",
          title: "Verify your email",
          description: "We found this profile on your device. Verify your email to finish connecting it to an account.",
          onVerified: () => showPreferredNamePrompt(profile)
        });
        return;
      }
      showEmailCodeChallenge({
        email,
        purpose: "account-signup",
        title: "Verify your email",
        description: "We’ll use this code to finish setting up your account.",
        onVerified: () => showPreferredNamePrompt(profile)
      });
      return;
    }

    const profile = getStoredProfile();
    if (!profile || String(profile.email || "").toLowerCase() !== email) {
      fail("We couldn’t find a profile for that email in this browser. If this is your first time here, you can create a profile.");
      return;
    }
    if (!profile.passwordHash || !profile.passwordSalt) {
      fail("This profile uses an older sign-in method. Please create an account and confirm your email to finish upgrading it.");
      return;
    }
    let passwordMatches = false;
    try { passwordMatches = await verifyLocalPassword(password, profile); }
    catch { fail("We couldn’t verify your password securely in this browser. Another browser or device may help."); return; }
    if (!passwordMatches) { fail("That password didn’t match this local profile. Please try again."); return; }
    showEmailCodeChallenge({
      email,
      purpose: "login-two-factor",
      title: "Verify your sign-in",
      description: "We’ll use this code to finish signing you in.",
      onVerified: () => enterApp(profile)
    });
  }

  if (form.matches("[data-account-form='profile']")) {
    event.preventDefault();
    const formData = new FormData(form);
    const existingProfile = getStoredProfile() || {};
    const photoInput = form.querySelector('input[name="photo"]');
    const photoFile = photoInput?.files?.[0];
    if (photoFile && (!/^image\/(png|jpeg|webp)$/.test(photoFile.type) || photoFile.size > 5 * 1024 * 1024)) {
      showToast("Choose a PNG, JPEG, or WebP image smaller than 5 MB.");
      return;
    }
    let image = form.dataset.removeImage === "true" ? "" : existingProfile.image || "";
    if (photoFile) {
      try {
        image = await compressProfileImage(photoFile);
      } catch {
        showToast("Unable to process that profile image.");
        return;
      }
    }
    const profile = {
      ...existingProfile,
      name: String(formData.get("name") || "").trim(),
      username: String(formData.get("username") || "").trim().replace(/\s+/g, " "),
      email: String(formData.get("email") || "").trim().toLowerCase(),
      sex: String(formData.get("sex") || ""),
      dateOfBirth: String(formData.get("dateOfBirth") || ""),
      image
    };
    if (window.NetraSupabase?.enabled) {
      const authUser = await window.NetraSupabase.getUser();
      if (authUser?.email?.toLowerCase() !== profile.email.toLowerCase()) {
        showToast("Change the account email through Supabase Auth email verification before saving it here.");
        return;
      }
    }
    if (profile.name.length < 2 || !profile.username || profile.username.length > 40 || !profile.email.includes("@") || (profile.dateOfBirth && profile.dateOfBirth > localDateValue())) {
      showToast(profile.dateOfBirth > localDateValue()
        ? "Date of birth cannot be in the future."
        : "Enter a valid full name, preferred name, and email address.");
      return;
    }
    try {
      saveStoredProfile(profile);
      setProfileName(profile.username);
      applyProfileAvatar();
      if (profilePreviewUrl) URL.revokeObjectURL(profilePreviewUrl);
      profilePreviewUrl = "";
      showPage("Profile");
      showToast(window.NetraSupabase?.enabled ? "Profile saved; cloud sync queued." : "Profile saved in this browser.");
    } catch {
      showToast("Unable to save the profile.");
    }
  }

  if (form.matches("[data-account-form='settings']")) {
    event.preventDefault();
    const formData = new FormData(form);
    const previousSettings = getStoredSettings();
    const paydayRaw = String(formData.get("paydayAnchorDay") ?? "").trim();
    const paydayDay = Number(paydayRaw);
    if (!paydayRaw || !Number.isInteger(paydayDay) || paydayDay < 1 || paydayDay > 31) {
      showToast("Enter a payday between 1 and 31.");
      form.querySelector('[name="paydayAnchorDay"]')?.focus();
      return;
    }
    const settings = {
      alwaysShowCents: formData.has("alwaysShowCents"),
      reduceMotion: formData.has("reduceMotion"),
      darkMode: formData.has("darkMode"),
      goalNotifications: formData.has("goalNotifications"),
      monthlyReminders: formData.has("monthlyReminders"),
      performanceTelemetryConsent: formData.has("performanceTelemetryConsent"),
      financialYearStartMonth: Number(formData.get("financialYearStartMonth")),
      paydayAnchorDay: paydayDay,
      autoLockPromptDismissed: previousSettings.autoLockPromptDismissed,
      privacyShortcut: String(formData.get("privacyShortcut") || "Shift+S"),
      taxPaye: formData.has("taxPaye"),
      taxNssf: formData.has("taxNssf"),
      taxShif: formData.has("taxShif"),
      taxAhl: formData.has("taxAhl"),
      personalRelief: Math.max(0, Number(formData.get("personalRelief") || 0)),
      insuranceRelief: Math.max(0, Number(formData.get("insuranceRelief") || 0)),
      customRelief: Math.max(0, Number(formData.get("customRelief") || 0)),
      monthlyBackupPrompt: formData.has("monthlyBackupPrompt"),
      lastBackupPromptAt: previousSettings.lastBackupPromptAt,
      accentProfile: String(formData.get("accentProfile") || "emerald"),
      showXpPoints: formData.has("showXpPoints"),
      questSounds: formData.has("questSounds"),
      questAnimations: formData.has("questAnimations"),
      lockTimeoutMinutes: Number(formData.get("lockTimeoutMinutes") || 0),
      localPinSalt: previousSettings.localPinSalt,
      localPinHash: previousSettings.localPinHash,
      localPinLength: previousSettings.localPinLength,
      accountPinEnabled: previousSettings.accountPinEnabled
    };
    if (settings.monthlyBackupPrompt && !previousSettings.monthlyBackupPrompt) settings.lastBackupPromptAt = new Date().toISOString();
    const newPin = String(formData.get("newPin") || "");
    const confirmPin = String(formData.get("confirmPin") || "");
    const changingExistingPin = Boolean((previousSettings.localPinHash || previousSettings.accountPinEnabled) && (formData.has("clearPin") || newPin || confirmPin));
    if (changingExistingPin) {
      const currentPin = String(formData.get("currentPin") || "");
      let currentPinMatches = false;
      try { currentPinMatches = await verifyWorkspacePin(currentPin, previousSettings); } catch { /* Treat unavailable verification as an invalid confirmation. */ }
      if (!currentPinMatches) {
        showToast("Enter your current PIN to change or remove it, or use Forgot your current PIN.");
        form.querySelector('input[name="currentPin"]')?.focus();
        return;
      }
    }
    if (formData.has("clearPin")) {
      settings.localPinSalt = "";
      settings.localPinHash = "";
      settings.localPinLength = 4;
      settings.lockTimeoutMinutes = 0;
    } else if (newPin || confirmPin) {
      if (!/^[0-9]{4}$/.test(newPin) || newPin !== confirmPin) {
        showToast("Enter and confirm the same four-digit PIN.");
        return;
      }
      try {
        Object.assign(settings, await createLocalPinVerifier(newPin), { localPinLength: 4 });
      } catch {
        showToast("Secure local PIN setup is unavailable in this browser context.");
        return;
      }
    }
    if (settings.lockTimeoutMinutes && !settings.localPinHash && !settings.accountPinEnabled && !newPin) {
      showToast("Set a four-digit PIN before enabling auto-lock.");
      return;
    }
    const desiredCurrency = String(formData.get("displayCurrency") || "KES");
    const currencyState = getCurrencyState();
    if (!currencyState.rates[desiredCurrency]) {
      showToast(`Set a manual exchange rate for ${desiredCurrency} before selecting it.`);
      openCurrencyRatesDialog(desiredCurrency);
      return;
    }
    if (formData.has("clearPin") || newPin) {
      const cloud = window.NetraSupabase;
      if (cloud?.enabled) {
        let cloudUser = null;
        try { cloudUser = await cloud.getUser(); } catch {
          if (navigator.onLine || previousSettings.accountPinEnabled) {
            showToast("Unable to check your account session. Try again when connected.");
            return;
          }
        }
        if (!navigator.onLine && (cloudUser || previousSettings.accountPinEnabled)) {
          showToast("Connect to the internet before changing this account’s PIN.");
          return;
        }
        if (cloudUser) {
          try {
            const supported = formData.has("clearPin") ? await cloud.clearPin() : await cloud.setPin(newPin);
            settings.accountPinEnabled = !formData.has("clearPin") && supported;
          } catch {
            showToast("The account PIN could not be updated. Check your connection and try again.");
            return;
          }
        }
      }
    }
    currencyState.active = desiredCurrency;
    try {
      saveCurrencyState(currencyState);
      localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
      setPrivacyMode(formData.has("privacyShield"));
      recordSecurityAudit("Updated local security and privacy settings");
      applyStoredSettings();
      updateCurrencySwitcher();
      showPage(crumb.textContent);
      scheduleAutoLock();
      maybePromptForBackup();
      showToast("Settings saved.");
    } catch {
      showToast("Unable to save settings in browser storage.");
    }
  }
});

// Route clicks for app actions, dialog controls, profile menus, and theme/privacy toggles.
document.addEventListener("click", event => {
  const target = event.target;
  const homeLink = target.closest("[data-home-link]");
  if (homeLink) {
    event.preventDefault();
    if (!appShell.hidden) showPage("Dashboard");
    else showPublicPage("landing");
    return;
  }
  const passwordReset = target.closest("[data-password-reset]");
  if (passwordReset) {
    const form = passwordReset.closest(".auth-content")?.querySelector("[data-auth-form]");
    const email = String(form?.elements.email.value || "").trim().toLowerCase();
    if (!email.includes("@")) { showToast("Your account email is needed for a reset link. It can be added above whenever you’re ready."); form?.elements.email.focus(); return; }
    if (!window.NetraSupabase?.enabled) { showToast("Password reset isn’t available just now because the sign-in service couldn’t connect. It may work again in a little while."); return; }
    window.NetraSupabase.resetPassword(email).then(({ error }) => {
      if (error) showToast(friendlyAuthMessage(error, "We couldn’t send a reset link just now. Another try in a little while may help."));
      else showToast("If there’s an account for that email, a password reset link is on its way. It may take a few minutes to arrive.");
    }).catch(error => showToast(friendlyAuthMessage(error, "We couldn’t send a reset link just now. Another try in a little while may help.")));
    return;
  }
  const publicLink = target.closest("[data-public-action]");
  if (publicLink && publicLink.tagName === "A" && publicLink.target !== "_blank") {
    const action = publicLink.dataset.publicAction;
    if (["signup", "login", "landing", "terms", "privacy"].includes(action)) {
      event.preventDefault();
      showPublicPage(action);
      return;
    }
  }
  const themeToggle = target.closest("[data-theme-toggle]");
  if (themeToggle) {
    // Save the appearance choice with the other local preferences so it survives reloads.
    const settings = getStoredSettings();
    settings.darkMode = !settings.darkMode;
    appShell.classList.toggle("theme-dark", settings.darkMode);
    publicShell.classList.toggle("theme-dark", settings.darkMode);
    document.body.classList.toggle("theme-dark", settings.darkMode);
    try {
      localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
      applyStoredSettings();
      showToast(settings.darkMode ? "Dark mode enabled." : "Light mode enabled.");
    } catch {
      applyStoredSettings();
      showToast("Theme changed for this session; browser storage is unavailable.");
    }
    return;
  }
  const onboardingAction = target.closest("[data-onboarding-action]");
  if (onboardingAction) {
    const action = onboardingAction.dataset.onboardingAction;
    if (action === "account") openInventoryDialog("add-asset");
    else if (action === "goal") {
      const placeholder = getQuests().find(quest => !(Number(quest.target) > 0));
      openQuestDialog(placeholder?.id || "");
    } else if (action === "income") openPowerUpDialog("income");
    else if (action === "budget") openPowerUpDialog("budget");
    return;
  }
  const exploreLink = target.closest(".landing-text-link[href='#features']");
  if (exploreLink) {
    const features = document.querySelector("#features");
    if (features) {
      event.preventDefault();
      window.history.replaceState(null, "", "#features");
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      features.scrollIntoView({ behavior, block: "start" });
    }
    return;
  }
  if (target.closest(".landing-back-top")) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) window.scrollTo(0, 0);
    else window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const menuItem = target.closest("[data-menu-choice]");
  if (menuItem) {
    handleMenuChoice(menuItem.dataset.menuChoice);
    return;
  }
  const activeMenu = document.querySelector(".action-popover");
  if (activeMenu && !activeMenu.contains(target)) closePopover();
  const pageLink = target.closest("[data-jump]");
  if (pageLink) {
    event.preventDefault();
    showPage(pageLink.dataset.jump);
    return;
  }
  const button = target.closest("button");
  if (!button) return;
  if (button.matches("[data-security-audit-download]")) {
    const period = button.closest(".settings-audit")?.querySelector("[data-security-audit-period]")?.value;
    downloadSecurityAudit(period);
    return;
  }
  if (button.matches("[data-pin-recovery]")) {
    showPinRecovery();
    return;
  }
  if (button.matches("[data-settings-action]")) {
    if (button.dataset.settingsAction === "export-json") downloadAllLocalData("json");
    else if (button.dataset.settingsAction === "export-csv") downloadAllLocalData("csv");
    else if (button.dataset.settingsAction === "manage-rates") openCurrencyRatesDialog();
    else if (button.dataset.settingsAction === "clear-data") clearAllLocalData();
    return;
  }
  if (button.matches("[data-remove-profile-image]")) {
    const form = button.closest("form");
    const input = form?.querySelector('input[name="photo"]');
    const preview = document.querySelector(".profile-photo-preview");
    if (input) input.value = "";
    if (form) form.dataset.removeImage = "true";
    if (preview) {
      const name = form?.querySelector('input[name="name"]')?.value || "";
      const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
      preview.innerHTML = `<span>${escapeHTML(initials)}</span>`;
    }
    if (profilePreviewUrl) URL.revokeObjectURL(profilePreviewUrl);
    profilePreviewUrl = "";
    return;
  }
  if (button.matches("[data-public-action]")) {
    const action = button.dataset.publicAction;
    if (["signup", "login", "landing", "terms", "privacy"].includes(action)) {
      showPublicPage(action);
    }
    return;
  }
  if (button.matches(".period-button")) {
    openMenu(button, [
      { label: "This month", action: "period:This month" },
      { label: "Last month", action: "period:Last month" },
      { label: "Year to date", action: "period:Year to date" }
    ]);
    return;
  }
  if (button.matches("[data-settings-dropdown]")) {
    openMenu(button, settingsDropdownChoices(button.dataset.settingsDropdown));
    return;
  }
  if (button.matches(".date-select")) {
    openMenu(button, getRecentNavigationMonths(12));
    return;
  }
  if (button.matches(".currency-select")) {
    const current = getCurrencyState();
    const choices = Object.entries(displayCurrencies).map(([code, currency]) => ({
      label: `${code === current.active ? "✓ " : ""}${currency.symbol} · ${currency.name}${current.rates[code] ? "" : " · Set rate"}`,
      action: `currency:${code}`
    }));
    choices.push({ label: "Manage exchange rates…", action: "currency:rates" });
    openMenu(button, choices);
    return;
  }
  if (button.matches("[data-cashflow-toggle]")) {
    const panel = button.closest(".cashflow-panel");
    const chartContent = panel?.querySelector(".cashflow-content");
    if (chartContent) setCashflowChartCollapsed(!chartContent.hidden);
    return;
  }
  if (button.matches(".more-button")) {
    openMenu(button, [
      { label: "View details", action: "details" },
      { label: "Download Excel workbook (.xls)", action: "download-excel" },
      { label: "Download CSV", action: "download-csv" }
    ]);
    return;
  }
  if (button.matches(".delete-quest")) {
    deleteQuest(button);
    return;
  }
  if (button.matches("[data-quest-action='add']")) {
    openQuestDialog();
    return;
  }
  if (button.matches("[data-edit-quest]")) {
    openQuestDialog(button.dataset.editQuest);
    return;
  }
  if (button.matches("[data-inventory-action]")) {
    openInventoryDialog(button.dataset.inventoryAction);
    return;
  }
  if (button.matches("[data-power-action]")) {
    openPowerUpDialog(button.dataset.powerAction);
    return;
  }
  if (button.matches("[data-edit-power-item]")) {
    openPowerUpDialog(button.dataset.editPowerItem, button.dataset.itemId);
    return;
  }
  if (button.matches("[data-edit-entry]")) {
    const entry = getInventoryEntries().find(item => item.id === button.dataset.editEntry);
    if (entry) openInventoryDialog(entry.type === "asset" ? "add-asset" : "add-liability", entry.id);
    return;
  }
  if (button.matches(".phone-panel-toggle")) {
    const panel = button.closest(".phone-collapsible");
    setPhoneToggleState(panel, !panel.classList.contains("phone-expanded"));
    return;
  }
  if (button.matches("[data-delete-power-item]")) {
    const data = getPowerUpData();
    const list = button.dataset.deletePowerItem === "income"
      ? "incomes"
      : button.dataset.deletePowerItem === "spending" ? "spending" : "budgets";
    const updated = data[list].filter(item => item.id !== button.dataset.itemId);
    data[list] = updated;
    try {
      savePowerUpData(data);
      recordSecurityAudit("Removed a monthly plan item");
      refreshFinancialPage();
      showToast("Monthly plan item removed.");
    } catch {
      showToast("Unable to update browser storage.");
    }
    return;
  }
  if (button.matches(".inventory-delete")) {
    const id = button.dataset.deleteEntry;
    const entries = getInventoryEntries().filter(entry => entry.id !== id);
    try {
      saveInventoryEntries(entries);
      recordSecurityAudit("Removed an asset or liability record");
      content.innerHTML = renderInventoryPage();
      showToast("Inventory item removed.");
    } catch {
      showToast("Unable to update browser storage.");
    }
    return;
  }
  if (button.matches(".icon-button")) {
    showToast("You’re all caught up.");
    return;
  }
  if (button.matches(".profile-button")) {
    const profile = getStoredProfile();
    openMenu(button, [
      { label: profile?.username || profile?.name || "Your profile", action: "profile" },
      { label: "Settings", action: "settings" },
      { label: "Sign out", action: "sign-out" }
    ]);
    return;
  }
  if (button.matches(".empty-action")) {
    showToast("This section is ready for your financial data.");
    return;
  }
});

// Validate profile image uploads and show a local preview before saving the profile.
document.addEventListener("change", event => {
  const input = event.target;
  if (input instanceof HTMLSelectElement && input.name === "accentProfile") {
    const names = { emerald: "Emerald Terminal", amber: "Cyber Amber", matrix: "Matrix Green", blue: "Classic Blue", violet: "Electric Violet", coral: "Sunset Coral", aqua: "Aqua Teal" };
    setAccent(input.value);
    const previewName = input.form?.querySelector("[data-accent-preview-name]");
    if (previewName) previewName.textContent = names[input.value] || names.emerald;
    return;
  }
  if (input instanceof HTMLSelectElement && input.name === "lockTimeoutMinutes") {
    const autoLockOptions = input.form?.querySelector("[data-autolock-options]");
    const isNever = Number(input.value) === 0;
    if (autoLockOptions) autoLockOptions.hidden = isNever;
    if (isNever && autoLockOptions) {
      const removePin = autoLockOptions.querySelector('input[name="clearPin"]');
      if (removePin) removePin.checked = false;
      autoLockOptions.querySelectorAll('input[name="newPin"], input[name="confirmPin"]').forEach(field => { field.value = ""; });
    }
    return;
  }
  if (!(input instanceof HTMLInputElement)) return;
  if (input.matches("[data-settings-import]")) {
    const backupFile = input.files?.[0];
    if (backupFile) restoreLocalData(backupFile);
    input.value = "";
    return;
  }
  if (input.name !== "photo") return;
  const file = input.files?.[0];
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
    input.value = "";
    showToast("Choose a PNG, JPEG, or WebP image smaller than 5 MB.");
    return;
  }
  const preview = document.querySelector(".profile-photo-preview");
  if (!preview) return;
  if (profilePreviewUrl) URL.revokeObjectURL(profilePreviewUrl);
  profilePreviewUrl = URL.createObjectURL(file);
  preview.innerHTML = `<img src="${profilePreviewUrl}" alt="Selected profile photo preview">`;
  input.closest("form")?.removeAttribute("data-remove-image");
});

// Accept a dropped JSON backup only over the Settings restore target.
document.addEventListener("dragover", event => {
  if (event.target.closest?.("[data-settings-drop]")) event.preventDefault();
});
document.addEventListener("drop", event => {
  const dropTarget = event.target.closest?.("[data-settings-drop]");
  if (!dropTarget) return;
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0];
  if (file) restoreLocalData(file);
});

// Close open action menus when the user presses Escape.
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closePopover();
});

document.addEventListener("click", event => {
  const toggle = event.target.closest?.("[data-card-collapse-toggle]");
  if (toggle && content.contains(toggle)) {
    const card = toggle.closest("[data-card-collapsible]");
    if (card) toggleInformationCard(card, toggle.getAttribute("aria-expanded") !== "true");
    return;
  }
  const heading = event.target.closest?.("[data-card-collapse-heading], .panel-heading, .metric-heading");
  if (!heading || !content.contains(heading) || event.target.closest("button, a, input, select, textarea, [contenteditable='true']")) return;
  const card = heading.parentElement;
  if (card?.dataset.cardCollapsible === "true" && !(phoneQuery.matches && card.dataset.phoneCollapse === "no")) {
    const toggleButton = card.querySelector("[data-card-collapse-toggle]");
    toggleInformationCard(card, toggleButton?.getAttribute("aria-expanded") !== "true");
  }
});

// Initialize preferences and summaries before restoring any local session.
enhanceInformationCards(content);
phoneQuery.addEventListener("change", () => {
  enhanceInformationCards(content);
  content.querySelectorAll(".phone-collapsible").forEach(panel => setPhoneToggleState(panel, !phoneQuery.matches));
  restoreCashflowChartState();
});
const informationCardObserver = new MutationObserver(() => enhanceInformationCards(content));
informationCardObserver.observe(content, { childList: true, subtree: true });
updateDateSwitcher();
initializePrivacyMode();
const copyrightYear = document.querySelector("#footer-copyright-year");
if (copyrightYear) copyrightYear.textContent = String(new Date().getFullYear());
const authQuery = new URLSearchParams(window.location.search);
const authCallbackParams = new URLSearchParams(window.location.hash.slice(1));
const confirmationReturn = authQuery.get("auth") === "confirm" || authCallbackParams.get("type") === "signup";
const passwordRecoveryReturn = authQuery.get("auth") === "recovery" || authCallbackParams.get("type") === "recovery";
const initialPage = confirmationReturn ? "dashboard" : passwordRecoveryReturn ? "login" : decodeURIComponent(window.location.hash.slice(1));
updateDashboardInventorySummary();
updateDashboardPowerUpSummary();
updateDashboardQuests();
updateCurrencySwitcher();
applyStoredSettings();
let hasLocalSession = false;
try {
  hasLocalSession = !window.NetraSupabase?.enabled && localStorage.getItem(sessionStorageKey) === "active" && Boolean(getStoredProfile());
} catch { hasLocalSession = false; }
if (hasLocalSession && !["terms", "privacy"].includes(initialPage)) {
  appShell.hidden = false;
  publicShell.hidden = true;
  applyProfileAvatar();
  if (initialPage && initialPage !== "dashboard") {
    const match = navItems.find(item => item.dataset.page.toLowerCase() === initialPage);
    if (match) showPage(match.dataset.page);
    else if (initialPage === "profile" || initialPage === "settings") {
      showPage(initialPage === "profile" ? "Profile" : "Settings");
    }
  }
  scheduleAutoLock();
  maybePromptForBackup();
  scheduleAutoLockNudge();
} else if (["login", "signup", "terms", "privacy"].includes(initialPage)) {
  showPublicPage(initialPage);
} else if (phoneNavQuery.matches) {
  showPhoneSplash();
} else {
  showPublicPage("landing");
}

if (!appShell.hidden) restoreCashflowChartState();

window.addEventListener("netraos-auth-event", event => {
  if (event.detail?.event === "PASSWORD_RECOVERY") {
    window.history.replaceState(null, "", `${window.location.pathname}#login`);
    showPasswordResetForm();
  }
});
if (window.NETRAOS_LAST_AUTH_EVENT === "PASSWORD_RECOVERY") {
  window.history.replaceState(null, "", `${window.location.pathname}#login`);
  showPasswordResetForm();
}
window.addEventListener("netraos-cloud-refresh", () => {
  if (appShell.hidden || !crumb.textContent) return;
  if (content.querySelector(".settings-form, .account-form")) return;
  applyStoredSettings();
  updateCurrencySwitcher();
  setProfileName(getStoredProfile()?.username || getStoredProfile()?.name || "Jordan Davis");
  applyProfileAvatar();
  showPage(crumb.textContent);
});
window.addEventListener("netraos-sync-error", () => {
  if (!appShell.hidden) showToast(navigator.onLine
    ? "Saved on this device; cloud sync will retry. Check the Supabase setup if this continues."
    : "Saved on this device; cloud sync will resume when you’re online.");
});

// Supabase Auth, not the old browser-only flag, authorizes a cloud account.
if (window.NetraSupabase?.enabled && !["terms", "privacy"].includes(initialPage)) {
  window.NetraSupabase.getSession().then(async ({ data, error }) => {
    if (error) throw error;
    if (passwordRecoveryReturn) {
      window.history.replaceState(null, "", `${window.location.pathname}#login`);
      if (data.session) showPasswordResetForm();
      else {
        showPublicPage("login");
        showToast("This password reset link may have expired. Request a fresh link and open it on this device.");
      }
      return;
    }
    if (!data.session) {
      if (confirmationReturn) {
        window.history.replaceState(null, "", `${window.location.pathname}#login`);
        showPublicPage("login");
        showToast("Your email is confirmed. Please sign in to open your dashboard.");
      }
      return;
    }
    const profile = await window.NetraSupabase.bootstrap();
    if (!profile) return;
    if (confirmationReturn) window.history.replaceState(null, "", `${window.location.pathname}#dashboard`);
    appShell.hidden = false;
    publicShell.hidden = true;
    saveStoredProfile(profile);
    applyProfileAvatar();
    const page = initialPage && initialPage !== "dashboard"
      ? navItems.find(item => item.dataset.page.toLowerCase() === initialPage)?.dataset.page || "Dashboard"
      : "Dashboard";
    showPage(page);
    scheduleAutoLock();
    maybePromptForBackup();
    scheduleAutoLockNudge();
    showCookieBanner();
    if (confirmationReturn) showToast("Your email is confirmed. You’re signed in and your dashboard is ready.");
    if (!profile.username) showPreferredNamePrompt(profile);
  }).catch(error => {
    console.error("Unable to restore the Supabase session:", error);
    showPublicPage("login");
    showToast(friendlyAuthMessage(error, "We couldn’t connect to your account right now. Please check your connection; we’ll try again when you’re back online."));
  });
}

// The app uses required browser storage, but currently sets no cookies or analytics.
const cookieConsentStorageKey = "netraos-cookie-consent-v1";
function saveCookiePreferences(analytics) {
  const savedAt = new Date().toISOString();
  localStorage.setItem(cookieConsentStorageKey, JSON.stringify({ necessary: true, analytics: Boolean(analytics), savedAt }));
  let settings = {};
  try { settings = JSON.parse(localStorage.getItem(settingsStorageKey) || "{}"); } catch { /* Replace unreadable preferences with a minimal valid settings object. */ }
  settings.performanceTelemetryConsent = Boolean(analytics);
  localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
}

function openCookiePreferences() {
  document.querySelector("[data-cookie-banner]")?.remove();
  document.querySelector("[data-cookie-dialog]")?.remove();
  let analytics = false;
  try {
    const consent = JSON.parse(localStorage.getItem(cookieConsentStorageKey) || "null");
    analytics = consent?.analytics === true;
  } catch { /* Keep optional telemetry off when saved consent is unavailable. */ }
  const dialog = document.createElement("dialog");
  dialog.className = "cookie-dialog";
  dialog.dataset.cookieDialog = "";
  dialog.setAttribute("aria-labelledby", "cookie-dialog-title");
  dialog.innerHTML = `<form method="dialog"><div class="section-kicker">PRIVACY PREFERENCES</div><h2 id="cookie-dialog-title">Manage your choices</h2><p>NetraOS uses essential browser storage and Supabase Auth session storage. Account data syncs to your Supabase project when online. This version collects no analytics.</p><label class="cookie-choice"><span><strong>Essential browser and session storage</strong><small>Always on · Keeps this device’s working copy and your sign-in session.</small></span><input type="checkbox" checked disabled aria-label="Essential browser and session storage are always on"></label><label class="cookie-choice"><span><strong>Future performance telemetry</strong><small>Not collected in this version. Save your choice for when this feature is introduced.</small></span><input name="analytics" type="checkbox" ${analytics ? "checked" : ""}></label><div class="cookie-actions"><button type="button" class="cookie-button secondary" data-cookie-cancel>Cancel</button><button type="submit" class="cookie-button">Save preferences</button></div></form>`;
  document.body.append(dialog);
  dialog.querySelector("[data-cookie-cancel]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.addEventListener("submit", event => {
    event.preventDefault();
    try {
      saveCookiePreferences(dialog.elements.analytics.checked);
      dialog.close();
      showToast("Cookie preferences saved.");
    } catch {
      showToast("Unable to save preferences in browser storage.");
    }
  });
  dialog.showModal();
}

function showCookieBanner() {
  if (appShell.hidden || document.querySelector("[data-cookie-banner]")) return;
  try {
    if (localStorage.getItem(cookieConsentStorageKey)) return;
  } catch { /* Still show the notice when storage is unavailable. */ }
  const banner = document.createElement("aside");
  banner.className = "cookie-banner";
  banner.dataset.cookieBanner = "";
  banner.setAttribute("aria-label", "Cookie and browser storage notice");
  banner.innerHTML = `<div class="cookie-banner-copy"><strong>Your privacy matters</strong><p>NetraOS uses essential browser storage and Supabase Auth session storage. Account data syncs to your Supabase project when online. This version collects no analytics.</p></div><div class="cookie-actions"><button type="button" class="cookie-button secondary" data-cookie-manage>Manage</button><button type="button" class="cookie-button" data-cookie-accept>Accept</button></div>`;
  document.body.append(banner);
  banner.querySelector("[data-cookie-accept]").addEventListener("click", () => {
    try {
      saveCookiePreferences(false);
      banner.remove();
    } catch {
      showToast("Unable to save your choice in browser storage.");
    }
  });
}

document.addEventListener("click", event => {
  if (event.target.closest("[data-cookie-manage]")) openCookiePreferences();
});
if (!appShell.hidden) showCookieBanner();
