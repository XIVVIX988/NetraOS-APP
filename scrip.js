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

const navItems = [...document.querySelectorAll("[data-page]")];
const content = document.querySelector("#page-content");
const crumb = document.querySelector("#crumb-page");
const publicShell = document.querySelector("#public-shell");
const appShell = document.querySelector(".app-shell");
const profileStorageKey = "netraos-profile-v1";
const sessionStorageKey = "netraos-local-session-v1";
const settingsStorageKey = "netraos-settings-v1";
let toastTimer;
let profilePreviewUrl = "";
let landingScrollEffectsBound = false;
let landingRevealObserver = null;

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
if (initialProfile?.name) document.body.dataset.userName = initialProfile.name;
let dashboardMarkup = content.innerHTML;

function updateDashboardWelcome(date = new Date()) {
  const profile = getStoredProfile();
  const fullName = (document.body.dataset.userName || profile?.name || "Jordan Davis").trim();
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
const savingsProjectionStorageKey = "netraos-savings-projection-v1";
const privacyModeStorageKey = "netraos-privacy-mode-v1";
const currencyAmountPattern = /(?:KSh|USh|TSh|KES|USD|EUR|GBP|UGX|TZS|[$€£])\s*[+-]?\s*\d[\d,]*(?:\.\d+)?/i;
const displayCurrencies = {
  KES: { symbol: "KSh", locale: "en-KE", name: "Kenyan shilling" },
  USD: { symbol: "$", locale: "en-US", name: "US dollar" },
  EUR: { symbol: "€", locale: "de-DE", name: "Euro" },
  GBP: { symbol: "£", locale: "en-GB", name: "British pound" },
  UGX: { symbol: "USh", locale: "en-UG", name: "Ugandan shilling" },
  TZS: { symbol: "TSh", locale: "en-TZ", name: "Tanzanian shilling" }
};

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
  if (period === "Last month") return monthKey(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  return monthKey(today);
}

function spendingForReport(entries) {
  const currentMonth = monthKey();
  const period = getReportPeriod();
  return entries.filter(item => {
    const month = /^\d{4}-\d{2}$/.test(item.month || "") ? item.month : currentMonth;
    if (period === "Year to date") return month.slice(0, 4) === currentMonth.slice(0, 4) && month <= currentMonth;
    return month === getReportMonth();
  });
}

function getPowerUpReportTotals() {
  const data = getPowerUpData();
  const income = data.incomes.reduce((total, item) => total + Number(item.amount || 0), 0);
  const budget = data.budgets.reduce((total, item) => total + Number(item.amount || 0), 0);
  const spending = spendingForReport(data.spending).reduce((total, item) => total + Number(item.amount || 0), 0);
  return { income, budget, spending, surplus: income - budget };
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

function getStoredSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(settingsStorageKey) || "{}");
    return {
      alwaysShowCents: Boolean(saved.alwaysShowCents),
      reduceMotion: Boolean(saved.reduceMotion),
      darkMode: Boolean(saved.darkMode),
      goalNotifications: saved.goalNotifications !== false,
      monthlyReminders: saved.monthlyReminders !== false
    };
  } catch {
    return { alwaysShowCents: false, reduceMotion: false, darkMode: false, goalNotifications: true, monthlyReminders: true };
  }
}

function applyStoredSettings() {
  const settings = getStoredSettings();
  document.body.classList.toggle("reduce-motion", settings.reduceMotion);
  appShell.classList.toggle("theme-dark", settings.darkMode);
  const themeToggle = document.querySelector("[data-theme-toggle]");
  if (themeToggle) {
    themeToggle.setAttribute("aria-pressed", String(settings.darkMode));
    themeToggle.setAttribute("aria-label", settings.darkMode ? "Enable light mode" : "Enable dark mode");
    themeToggle.title = settings.darkMode ? "Enable light mode" : "Enable dark mode";
  }
  const darkModeInput = document.querySelector('input[name="darkMode"]');
  if (darkModeInput) darkModeInput.checked = settings.darkMode;
}

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

function showPublicPage(page = "landing") {
  if (!publicShell || !appShell) return;
  appShell.hidden = true;
  publicShell.hidden = false;
  document.body.classList.toggle("public-view", page === "landing");
  document.body.classList.toggle("auth-view", page !== "landing");
  window.location.hash = page === "landing" ? "home" : page;
  if (page === "landing") {
    publicShell.innerHTML = `
      <div class="public-page">
        <header class="public-header landing-header">
          <a class="public-brand" href="#home" aria-label="NetraOS home">${renderBrandMark()}<span><strong>NETRA<span>OS</span></strong><small>YOUR FINANCIAL OPERATING SYSTEM</small></span></a>
          <nav class="public-nav" aria-label="Public navigation"><div class="landing-nav-links"><a class="landing-nav-current" href="#home">Home</a><a href="#features">Features</a><a href="#about">About</a><a href="#faq">FAQ</a><a href="#contact">Contact</a></div><button type="button" data-public-action="login">Log in</button><button class="public-nav-cta" type="button" data-public-action="signup">Open NetraOS <span>↗</span></button></nav>
        </header>
        <main>
          <section class="landing-hero landing-hero-v2">
            <div class="landing-copy landing-copy-v2">
              <div class="landing-eyebrow landing-manifesto" aria-label="Income. Spending. Goals. In one view."><span>Income</span><b>·</b><span>Spending</span><b>·</b><span>Goals</span><strong>In one view</strong></div>
              <h1>See your money<br>with <em>new clarity.</em></h1>
              <p>NetraOS turns scattered balances and plans into one clear picture—so your next financial move feels easier to make.</p>
              <div class="landing-actions"><button class="public-primary" type="button" data-public-action="signup">Get started <span>↗</span></button><a class="landing-text-link" href="#features">Explore the system <span>↓</span></a></div>
              <div class="landing-assurance landing-assurance-v2"><span>✳</span><div><strong>Private by design</strong><small>Your preview data stays in this browser.</small></div></div>
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
          <section class="landing-feature-strip" id="features" aria-label="NetraOS features"><article><span>◉</span><div><strong>Balance sheet</strong><small>Assets, debts, cash, and net worth</small></div></article><article><span>▣</span><div><strong>Mobile money</strong><small>Track M-Pesa alongside your assets</small></div></article><article><span>⇄</span><div><strong>Multi-currency</strong><small>Switch currencies with manual rates</small></div></article><article><span>↗</span><div><strong>Monthly plan</strong><small>Income, budgets, and spending</small></div></article><article><span>⌁</span><div><strong>What-if projections</strong><small>Compound savings with inflation options</small></div></article><article><span>％</span><div><strong>Kenya tax calculator</strong><small>Estimate take-home pay</small></div></article><article><span>◎</span><div><strong>Quests & milestones</strong><small>Follow goals and celebrate progress</small></div></article><article><span>◈</span><div><strong>Privacy & exports</strong><small>Mask amounts and download polished PDFs</small></div></article></section>
          <section class="landing-deep-dive" id="about"><div class="landing-deep-copy"><div class="landing-eyebrow"><i></i> A BETTER VIEW, STEP BY STEP</div><h2>From the big picture<br>to your next move.</h2><p>Bring your financial basics together, then build from there. NetraOS keeps the essentials close without making money management feel like another job.</p><ul><li><i>✓</i> See bank, cash, and M-Pesa balances together</li><li><i>✓</i> Switch display currency using rates you manage</li><li><i>✓</i> Project compounding savings month by month</li><li><i>✓</i> Keep amounts private and export a polished PDF</li></ul><button class="public-primary" type="button" data-public-action="signup">Build your financial picture <span>↗</span></button></div><div class="insight-collage"><article class="insight-card insight-progress"><div class="insight-card-head"><span><small>QUEST PROGRESS</small><strong>Emergency fund</strong></span><i>◈</i></div><div class="insight-progress-line"><span></span></div><div class="insight-card-foot"><small>One goal at a time</small><strong>0%</strong></div></article><article class="insight-card insight-rate"><small>SAVINGS RATE</small><strong>0<span>%</span></strong><div class="insight-sparkline"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><small>Calculated from your monthly plan</small></article><article class="insight-card insight-budget"><i>▤</i><small>MONTHLY BUDGET</small><strong>KSh 0</strong><span>Set your first budget line</span></article><article class="insight-card insight-note"><span>✳</span><p>Your plan should work for your life—not the other way around.</p></article></div></section>
          <section class="landing-faq" id="faq" aria-labelledby="landing-faq-title"><div class="landing-faq-intro"><span class="landing-faq-index">NETRAOS / FAQ</span><h2 id="landing-faq-title">A few useful<br>answers.</h2><p>Quick details about how the system works and where your information stays.</p></div><div class="landing-faq-list"><details><summary>What can I track in NetraOS?<span aria-hidden="true">+</span></summary><p>Record assets and liabilities, plan income and monthly budgets, track spending, and follow your savings goals and financial progress.</p></details><details><summary>Does NetraOS connect to my bank?<span aria-hidden="true">+</span></summary><p>No. This version does not connect to bank accounts. You add and update your information yourself.</p></details><details><summary>Where is my financial information stored?<span aria-hidden="true">+</span></summary><p>Your entries are saved in this browser on this device. They are not sent to a NetraOS account or synced to another device.</p></details><details><summary>Can I export my dashboard?<span aria-hidden="true">+</span></summary><p>Yes. Use the dashboard download controls to export a PDF or spreadsheet copy of your financial summary.</p></details></div></section>
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
        <footer class="public-footer"><span>NETRAOS · YOUR FINANCIAL OPERATING SYSTEM</span><span>Kenyan shillings · KSh</span></footer>
      </div>`;
    setupLandingScrollEffects();
  } else {
    const isSignup = page === "signup";
    publicShell.innerHTML = `
      <div class="auth-page">
        <button class="auth-back" type="button" data-public-action="landing">← Back to NetraOS</button>
        <section class="auth-card">
          <button class="public-brand auth-brand" type="button" data-public-action="landing" aria-label="Back to NetraOS home">${renderBrandMark()}<span><strong>NETRA<span>OS</span></strong><small>YOUR FINANCIAL OPERATING SYSTEM</small></span></button>
          <div class="section-kicker">${isSignup ? "START WITH A CLEAR PICTURE" : "WELCOME BACK"}</div>
          <h1>${isSignup ? "Create your account." : "Log in to NetraOS."}</h1>
          <p class="auth-description">${isSignup ? "Set up your local profile and start organizing your finances." : "Continue to your financial command center."}</p>
          <form class="auth-form" data-auth-form="${isSignup ? "signup" : "login"}" novalidate>
            ${isSignup ? `<label class="inventory-form-field"><span>Full name</span><input name="name" type="text" autocomplete="name" maxlength="80" placeholder="Your name" required></label>` : ""}
            <label class="inventory-form-field"><span>Email address</span><input name="email" type="email" autocomplete="email" maxlength="120" placeholder="you@example.com" required></label>
            <label class="inventory-form-field"><span>Password</span><input name="password" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" minlength="8" placeholder="At least 8 characters" required></label>
            <div class="auth-error" role="alert" hidden></div>
            <button class="public-primary auth-submit" type="submit">${isSignup ? "Create local profile" : "Log in"} <span>↗</span></button>
          </form>
          <p class="auth-switch">${isSignup ? "Already have a local profile?" : "New to NetraOS?"} <button type="button" data-public-action="${isSignup ? "login" : "signup"}">${isSignup ? "Log in" : "Create an account"}</button></p>
          <p class="auth-preview-note">Local prototype: sign-in information is not sent to a server. Passwords are not stored; this page does not provide production authentication.</p>
        </section>
      </div>`;
  }
}

function renderProfilePage() {
  const profile = getStoredProfile() || { name: document.body.dataset.userName || "Jordan Davis", email: "" };
  const initials = profile.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  const photo = profile.image
    ? `<img src="${escapeHTML(profile.image)}" alt="Profile photo">`
    : `<span>${escapeHTML(initials)}</span>`;
  const maxDate = localDateValue();
  return `
    <section class="account-page">
      <header class="inventory-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> YOUR ACCOUNT</div><h1>Your profile.</h1><p class="welcome-sub">Manage the name and email shown in this local NetraOS profile.</p></div></header>
      <section class="panel account-panel">
        <div class="profile-summary"><span class="profile-initials profile-photo-preview">${photo}</span><div><strong>${escapeHTML(profile.name)}</strong><small>${escapeHTML(profile.email || "No email added")}</small></div></div>
        <form class="account-form" data-account-form="profile">
          <div class="inventory-form-field profile-photo-field"><label for="profile-photo-input"><span>Profile image <small>Optional · PNG, JPEG, or WebP up to 5 MB</small></span></label><input id="profile-photo-input" name="photo" type="file" accept="image/png,image/jpeg,image/webp"><button class="profile-photo-remove" type="button" data-remove-profile-image>Remove image</button></div>
          <label class="inventory-form-field"><span>Full name</span><input name="name" type="text" maxlength="80" value="${escapeHTML(profile.name)}" required></label>
          <label class="inventory-form-field"><span>Email address</span><input name="email" type="email" maxlength="120" value="${escapeHTML(profile.email || "")}" required></label>
          <label class="inventory-form-field"><span>Sex <small>Optional</small></span><select name="sex"><option value="">Prefer not to say</option><option value="female" ${profile.sex === "female" ? "selected" : ""}>Female</option><option value="male" ${profile.sex === "male" ? "selected" : ""}>Male</option><option value="intersex" ${profile.sex === "intersex" ? "selected" : ""}>Intersex</option><option value="other" ${profile.sex === "other" ? "selected" : ""}>Other</option></select></label>
          <label class="inventory-form-field"><span>Date of birth <small>Optional</small></span><input name="dateOfBirth" type="date" max="${maxDate}" value="${escapeHTML(profile.dateOfBirth || "")}"></label>
          <div class="account-form-actions"><span>Saved in this browser</span><button class="inventory-submit" type="submit">Save changes</button></div>
        </form>
      </section>
      <section class="account-notice"><span>i</span><p>This is a local profile for the app preview. NetraOS currently has no account server or cloud sync.</p></section>
    </section>
    <footer class="page-footer"><span>NETRAOS <i>·</i> YOUR FINANCIAL OPERATING SYSTEM</span><span>Private by design <i>✳</i></span></footer>`;
}

function renderSettingsPage() {
  const settings = getStoredSettings();
  return `
    <section class="account-page">
      <header class="inventory-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> APP PREFERENCES</div><h1>Make it yours.</h1><p class="welcome-sub">Choose how NetraOS behaves in this browser.</p></div></header>
      <form class="settings-form" data-account-form="settings">
        <section class="panel settings-panel"><div class="panel-heading"><div><div class="section-kicker">DISPLAY</div><h2>Regional preferences</h2></div></div>
          <label class="settings-field"><span><strong>Currency</strong><small>NetraOS currently displays Kenyan shillings.</small></span><strong class="settings-value">KSh · Kenyan shilling</strong></label>
          <label class="settings-field"><span><strong>Dark mode</strong><small>Use a darker color theme across your workspace.</small></span><input name="darkMode" type="checkbox" ${settings.darkMode ? "checked" : ""}></label>
          <label class="settings-field"><span><strong>Always show cents</strong><small>Show two decimal places in money amounts.</small></span><input name="alwaysShowCents" type="checkbox" ${settings.alwaysShowCents ? "checked" : ""}></label>
          <label class="settings-field"><span><strong>Reduce motion</strong><small>Use fewer animation and hover effects.</small></span><input name="reduceMotion" type="checkbox" ${settings.reduceMotion ? "checked" : ""}></label>
        </section>
        <section class="panel settings-panel"><div class="panel-heading"><div><div class="section-kicker">REMINDER PREFERENCES</div><h2>What to keep an eye on</h2></div></div>
          <label class="settings-field"><span><strong>Quest progress</strong><small>Saved as a preference; this preview does not send notifications.</small></span><input name="goalNotifications" type="checkbox" ${settings.goalNotifications ? "checked" : ""}></label>
          <label class="settings-field"><span><strong>Monthly plan</strong><small>Saved as a preference; this preview does not send notifications.</small></span><input name="monthlyReminders" type="checkbox" ${settings.monthlyReminders ? "checked" : ""}></label>
        </section>
        <div class="settings-actions"><span>Preferences save to this browser.</span><button class="inventory-submit" type="submit">Save changes</button></div>
      </form>
    </section>
    <footer class="page-footer"><span>NETRAOS <i>·</i> YOUR FINANCIAL OPERATING SYSTEM</span><span>Private by design <i>✳</i></span></footer>`;
}

function enterApp(profile) {
  try {
    localStorage.setItem(sessionStorageKey, "active");
  } catch {
    showToast("Unable to start a local session. Browser storage may be disabled.");
    return;
  }
  setProfileName(profile.name);
  applyProfileAvatar();
  applyStoredSettings();
  publicShell.hidden = true;
  appShell.hidden = false;
  showPage("Dashboard");
}

function getInventoryEntries() {
  try {
    const entries = JSON.parse(localStorage.getItem(inventoryStorageKey) || "[]");
    return Array.isArray(entries) ? entries : [];
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
  const data = getPowerUpData();
  const income = data.incomes.reduce((total, item) => total + Number(item.amount || 0), 0);
  const budget = data.budgets.reduce((total, item) => total + Number(item.amount || 0), 0);
  const spending = data.spending.reduce((total, item) => total + Number(item.amount || 0), 0);

  return { income, budget, spending, surplus: income - budget };
}

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

function renderQuestRows(quests, dashboard = false) {
  if (!quests.length) {
    return `<p class="empty-quests">No active goals yet. Add a quest when you are ready.</p>`;
  }

  return quests.map(quest => {
    const progress = questProgress(quest);
    return `
      <div class="quest-row ${progress === 100 ? "is-complete" : ""}" data-quest-id="${escapeHTML(quest.id)}">
        <span class="quest-icon shield">${progress === 100 ? "✦" : "◈"}</span>
        <div class="quest-info">
          <div class="quest-title">
            ${escapeHTML(quest.name)}
            ${progress === 100 ? `<span class="quest-xp quest-complete-badge">COMPLETE</span>` : dashboard ? "" : `<span class="quest-xp">ACTIVE</span>`}
          </div>
          <div class="quest-meta">${formatKsh(quest.current)} <span>of</span> ${formatKsh(quest.target)}</div>
          <div class="quest-track"><i style="width:${progress}%"></i></div>
        </div>
        <strong class="quest-percent">${progress}%</strong>
        ${dashboard ? "" : `<button class="quest-update" type="button" data-edit-quest="${escapeHTML(quest.id)}" aria-label="Update ${escapeHTML(quest.name)} progress">Update progress</button>`}
        <button class="delete-quest" type="button" data-delete-quest="${escapeHTML(quest.id)}" aria-label="Delete ${escapeHTML(quest.name)} goal" title="Delete goal">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m3 3v7m6-7v7" /></svg>
        </button>
      </div>`;
  }).join("");
}

function updateDashboardQuests() {
  const quests = getQuests();
  const list = document.querySelector(".quests-panel .quest-list");
  const badge = document.querySelector(".quests-panel .count-badge");
  if (list) list.innerHTML = renderQuestRows(quests, true);
  if (badge) badge.textContent = quests.length;
  updateDashboardOnboarding();
  updateSavingsProjection();
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
  updateSavingsProjection();
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

function initializePrivacyMode() {
  const toggle = document.querySelector("[data-privacy-toggle]");
  if (!toggle) return;
  let enabled = false;
  try {
    enabled = localStorage.getItem(privacyModeStorageKey) === "true";
  } catch {
    // Privacy masking remains available for this session when storage is unavailable.
  }
  const syncToggle = () => {
    appShell.classList.toggle("privacy-mode", enabled);
    document.body.classList.toggle("privacy-mode", enabled);
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.setAttribute("aria-label", enabled ? "Show currency amounts" : "Hide currency amounts");
    toggle.title = enabled ? "Show currency amounts" : "Hide currency amounts";
  };
  syncToggle();
  markPrivacySensitiveSubtree(document.body);
  const observer = new MutationObserver(records => {
    records.forEach(record => {
      if (record.type === "characterData") markPrivacySensitiveText(record.target);
      else record.addedNodes.forEach(node => markPrivacySensitiveSubtree(node));
    });
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  toggle.addEventListener("click", () => {
    enabled = !enabled;
    try {
      localStorage.setItem(privacyModeStorageKey, String(enabled));
    } catch {
      // Keep the toggle responsive for the current session.
    }
    syncToggle();
  });
}

function getSavingsProjectionState() {
  try {
    const saved = JSON.parse(localStorage.getItem(savingsProjectionStorageKey) || "{}");
    const savedContribution = Number(saved.contribution ?? 5000);
    const savedReturn = Number(saved.annualReturn ?? 5);
    const savedInflation = Number(saved.inflationRate ?? 5);
    return {
      contribution: Number.isFinite(savedContribution) ? Math.max(0, Math.min(50000, Math.round(savedContribution / 5000) * 5000)) : 5000,
      annualReturn: Number.isFinite(savedReturn) ? Math.max(0, Math.min(12, Math.round(savedReturn))) : 5,
      inflationRate: Number.isFinite(savedInflation) ? Math.max(0, Math.min(15, Math.round(savedInflation * 2) / 2)) : 5,
      inflationAdjusted: Boolean(saved.inflationAdjusted),
      years: [1, 3, 5].includes(Number(saved.years)) ? Number(saved.years) : 3,
      minimized: Boolean(saved.minimized)
    };
  } catch {
    return { contribution: 5000, annualReturn: 5, inflationRate: 5, inflationAdjusted: false, years: 3, minimized: false };
  }
}

function updateProjectionInspection(chart, index) {
  const samples = chart?.projectionSamples;
  if (!samples?.length) return;
  const sampleIndex = Math.max(0, Math.min(samples.length - 1, Number(index) || 0));
  const sample = samples[sampleIndex];
  const hitArea = chart.querySelector(".projection-hit-area");
  const cursorLine = chart.querySelector("#projection-cursor-line");
  const cursorPoint = chart.querySelector("#projection-cursor-point");
  if (hitArea) {
    hitArea.setAttribute("aria-valuemax", String(samples.length - 1));
    hitArea.setAttribute("aria-valuenow", String(sampleIndex));
    hitArea.setAttribute("aria-valuetext", sample.label);
  }
  if (cursorLine) {
    cursorLine.setAttribute("x1", sample.x.toFixed(1));
    cursorLine.setAttribute("x2", sample.x.toFixed(1));
  }
  if (cursorPoint) {
    cursorPoint.setAttribute("cx", sample.x.toFixed(1));
    cursorPoint.setAttribute("cy", sample.y.toFixed(1));
  }
  const panel = chart.closest(".projection-panel");
  if (!panel) return;
  const period = panel.querySelector("[data-projection-insight-period]");
  const balance = panel.querySelector("[data-projection-insight-balance]");
  const contributions = panel.querySelector("[data-projection-insight-contributions]");
  const growth = panel.querySelector("[data-projection-insight-growth]");
  if (period) period.textContent = sample.label;
  if (balance) balance.textContent = formatKsh(sample.balance);
  if (contributions) contributions.textContent = formatKsh(sample.contributions);
  if (growth) growth.textContent = formatKsh(sample.balance - sample.contributions);
}

function updateSavingsProjection(changedInput = null, selectedYears = null, changes = null) {
  const panel = document.querySelector(".projection-panel");
  if (!panel) return;
  const contributionInput = panel.querySelector("#projection-contribution");
  const returnInput = panel.querySelector("#projection-return");
  const inflationInput = panel.querySelector("#projection-inflation");
  if (!contributionInput || !returnInput || !inflationInput) return;
  const state = getSavingsProjectionState();
  if (changedInput?.dataset.projectionInput === "contribution") state.contribution = Number(contributionInput.value) || 0;
  if (changedInput?.dataset.projectionInput === "returnRate") state.annualReturn = Number(returnInput.value) || 0;
  if (changedInput?.dataset.projectionInput === "inflationRate") state.inflationRate = Number(inflationInput.value) || 0;
  if (changes && typeof changes === "object") Object.assign(state, changes);
  if ([1, 3, 5].includes(Number(selectedYears))) state.years = Number(selectedYears);
  contributionInput.value = String(state.contribution);
  returnInput.value = String(state.annualReturn);
  inflationInput.value = String(state.inflationRate);
  try {
    localStorage.setItem(savingsProjectionStorageKey, JSON.stringify(state));
  } catch {
    // Keep the simulator usable when browser storage is unavailable.
  }

  const contributionValue = panel.querySelector("#projection-contribution-value");
  const returnValue = panel.querySelector("#projection-return-value");
  const inflationValue = panel.querySelector("#projection-inflation-value");
  const minimumValue = panel.querySelector("[data-projection-min]");
  const maximumValue = panel.querySelector("[data-projection-max]");
  if (contributionValue) contributionValue.textContent = formatKsh(state.contribution);
  if (returnValue) returnValue.textContent = `${state.annualReturn}%`;
  if (inflationValue) inflationValue.textContent = `${state.inflationRate}%`;
  const inflationToggle = panel.querySelector("[data-projection-inflation-toggle]");
  if (inflationToggle) inflationToggle.setAttribute("aria-checked", String(state.inflationAdjusted));
  const inflationControl = panel.querySelector("[data-projection-inflation-control]");
  if (inflationControl) inflationControl.hidden = !state.inflationAdjusted;
  panel.classList.toggle("is-collapsed", state.minimized);
  const projectionBody = panel.querySelector("[data-projection-body]");
  if (projectionBody) projectionBody.hidden = state.minimized;
  const collapseToggle = panel.querySelector("[data-projection-toggle]");
  if (collapseToggle) {
    collapseToggle.setAttribute("aria-expanded", String(!state.minimized));
    collapseToggle.setAttribute("aria-label", state.minimized ? "Expand projections" : "Minimize projections");
    const toggleLabel = collapseToggle.querySelector("[data-projection-toggle-label]");
    if (toggleLabel) toggleLabel.textContent = state.minimized ? "Expand" : "Minimize";
    const toggleIcon = collapseToggle.querySelector(".projection-collapse-icon");
    if (toggleIcon) toggleIcon.textContent = state.minimized ? "+" : "−";
  }
  const balanceLabel = panel.querySelector("#projection-balance-label");
  if (balanceLabel) balanceLabel.textContent = state.inflationAdjusted ? "BALANCE IN TODAY’S MONEY" : "PROJECTED BALANCE";
  if (minimumValue) minimumValue.textContent = formatKsh(0);
  if (maximumValue) maximumValue.textContent = formatKsh(50000);
  panel.querySelectorAll("[data-projection-years]").forEach(button => {
    const selected = Number(button.dataset.projectionYears) === state.years;
    button.setAttribute("aria-pressed", String(selected));
  });

  const quests = getQuests();
  const startingBalance = quests.reduce((sum, quest) => sum + Math.max(0, Number(quest.current) || 0), 0);
  const plannedMonthlySavings = getPowerUpData().budgets
    .filter(item => item.category === "Savings & investing")
    .reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0);
  const monthlyContribution = plannedMonthlySavings + state.contribution;
  const plannedSavingsValue = panel.querySelector("#projection-planned-savings-value");
  const totalMonthlyValue = panel.querySelector("#projection-monthly-total-value");
  if (plannedSavingsValue) plannedSavingsValue.textContent = formatKsh(plannedMonthlySavings);
  if (totalMonthlyValue) totalMonthlyValue.textContent = formatKsh(monthlyContribution);
  const months = state.years * 12;
  const monthlyRate = Math.pow(1 + state.annualReturn / 100, 1 / 12) - 1;
  const inflationMonthlyRate = Math.pow(1 + state.inflationRate / 100, 1 / 12) - 1;
  const growthRate = state.inflationAdjusted ? (1 + monthlyRate) / (1 + inflationMonthlyRate) - 1 : monthlyRate;
  let balance = startingBalance;
  let totalContributions = startingBalance;
  const monthlyValues = [{ month: 0, balance, contributions: totalContributions }];
  for (let month = 1; month <= months; month += 1) {
    const contribution = state.inflationAdjusted ? monthlyContribution / Math.pow(1 + inflationMonthlyRate, month) : monthlyContribution;
    balance = balance * (1 + growthRate) + contribution;
    totalContributions += contribution;
    monthlyValues.push({ month, balance, contributions: totalContributions });
  }
  const startValue = panel.querySelector("#projection-start-value");
  const projectedValue = panel.querySelector("#projection-balance");
  const growthValue = panel.querySelector("#projection-growth");
  const horizonLabel = panel.querySelector("#projection-end-label");
  const linePath = panel.querySelector("#projection-line");
  const areaPath = panel.querySelector("#projection-area");
  const point = panel.querySelector("#projection-point");
  const chart = panel.querySelector(".projection-chart");
  const granularityLabel = panel.querySelector("#projection-granularity");
  if (startValue) startValue.textContent = formatKsh(startingBalance);
  if (projectedValue) projectedValue.textContent = formatKsh(balance);
  if (growthValue) growthValue.textContent = formatKsh(balance - totalContributions);
  if (horizonLabel) horizonLabel.textContent = `${state.years} ${state.years === 1 ? "year" : "years"}`;
  if (granularityLabel) granularityLabel.textContent = state.years === 1 ? "Monthly points" : "Yearly points";

  const chartLeft = 38, chartRight = 620, chartTop = 28, chartBottom = 184;
  const sampleMonths = state.years === 1
    ? monthlyValues.map(value => value.month)
    : Array.from({ length: state.years + 1 }, (_, year) => year * 12);
  const projectionSamples = sampleMonths.map((month, index) => {
    const value = monthlyValues[month];
    const x = chartLeft + (index / (sampleMonths.length - 1)) * (chartRight - chartLeft);
    return {
      ...value,
      x,
      y: 0,
      label: month === 0 ? "Today" : state.years === 1 ? `Month ${month}` : `Year ${month / 12}`
    };
  });
  if (chart) {
    chart.projectionSamples = projectionSamples;
    if (!chart.dataset.projectionInteractive) {
      chart.dataset.projectionInteractive = "true";
      chart.addEventListener("pointermove", event => {
        const bounds = chart.getBoundingClientRect();
        if (!bounds.width) return;
        const progress = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        updateProjectionInspection(chart, Math.round(progress * (chart.projectionSamples.length - 1)));
      });
      chart.addEventListener("pointerleave", () => updateProjectionInspection(chart, chart.projectionSamples.length - 1));
      chart.querySelector(".projection-hit-area")?.addEventListener("keydown", event => {
        const hitArea = event.currentTarget;
        const current = Number(hitArea.getAttribute("aria-valuenow")) || 0;
        let next = current;
        if (event.key === "ArrowRight" || event.key === "ArrowUp") next += 1;
        else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next -= 1;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = chart.projectionSamples.length - 1;
        else return;
        event.preventDefault();
        updateProjectionInspection(chart, next);
      });
    }
  }
  const maxSampleBalance = Math.max(1, ...projectionSamples.map(sample => sample.balance)) * 1.08;
  projectionSamples.forEach(sample => {
    sample.y = chartBottom - (sample.balance / maxSampleBalance) * (chartBottom - chartTop);
  });
  const points = projectionSamples.map((sample, index) => {
    return `${index ? "L" : "M"}${sample.x.toFixed(1)} ${sample.y.toFixed(1)}`;
  }).join(" ");
  if (linePath) linePath.setAttribute("d", points);
  if (areaPath) areaPath.setAttribute("d", `${points} L${chartRight} ${chartBottom} L${chartLeft} ${chartBottom} Z`);
  if (point) {
    point.setAttribute("cx", String(chartRight));
    point.setAttribute("cy", projectionSamples[projectionSamples.length - 1].y.toFixed(1));
  }
  updateProjectionInspection(chart, projectionSamples.length - 1);
  if (chart) chart.setAttribute("aria-label", `Projected savings grow from ${formatKsh(startingBalance)} to ${formatKsh(balance)} over ${state.years} ${state.years === 1 ? "year" : "years"}, with an assumed ${state.annualReturn}% annual return${state.inflationAdjusted ? ` and ${state.inflationRate}% inflation, shown in today’s money` : ""}.`);
}

function formatBaseKsh(amount) {
  const alwaysShowCents = getStoredSettings().alwaysShowCents;
  return "KSh " + Number(amount || 0).toLocaleString("en-KE", {
    minimumFractionDigits: alwaysShowCents ? 2 : 0,
    maximumFractionDigits: 2
  });
}

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
      <p class="currency-rate-note">Enter how many Kenyan shillings equal one unit of each currency. Values stay in this browser; the app uses these rates for display only.</p>
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
    showPage(crumb.textContent);
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
          </span>
          <strong class="inventory-account-amount">${formatKsh(entry.amount)}</strong>
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
          <span aria-hidden="true">＋</span> Add an account
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
        <article class="panel inventory-list-panel">
          <div class="panel-heading">
            <div><div class="section-kicker">WHAT YOU OWN</div><h2>Assets</h2></div>
            <button class="inventory-add-small" type="button" data-inventory-action="add-asset">＋ Add asset</button>
          </div>
          <div class="inventory-rows">${renderInventoryRows("asset", assetCategories)}</div>
          <div class="inventory-panel-total"><span>Total assets</span><strong>${formatKsh(totals.assets)}</strong></div>
        </article>

        <article class="panel inventory-list-panel">
          <div class="panel-heading">
            <div><div class="section-kicker">WHAT YOU OWE</div><h2>Liabilities</h2></div>
            <button class="inventory-add-small" type="button" data-inventory-action="add-liability">＋ Add liability</button>
          </div>
          <div class="inventory-rows">${renderInventoryRows("liability", liabilityCategories)}</div>
          <div class="inventory-panel-total"><span>Total liabilities</span><strong>${formatKsh(totals.liabilities)}</strong></div>
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
    <footer class="page-footer">
      <span>NETRAOS <i>·</i> YOUR FINANCIAL OPERATING SYSTEM</span>
      <span>Private by design <i>✳</i></span>
    </footer>`;
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
    const colors = ["#11845e", "#55a985", "#95c6aa", "#c9e2d3"];
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
  const data = getPowerUpData();
  const totals = getPowerUpReportTotals();
  const periodButton = document.querySelector(".period-button");
  if (periodButton) periodButton.innerHTML = `${getReportPeriod()} <svg class="dropdown-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" /></svg>`;
  const metricCards = document.querySelectorAll(".metric-card");
  const incomeCard = metricCards[1];
  const savingsCard = metricCards[2];
  const spendingCard = metricCards[3];

  if (incomeCard) {
    incomeCard.querySelector(".metric-value").textContent = formatKsh(totals.income);
    incomeCard.querySelector(".metric-foot .muted").textContent =
    `${data.incomes.length} monthly ${data.incomes.length === 1 ? "source" : "sources"}`;
    incomeCard.querySelector(".metric-trailing").textContent = "TOTAL";
  }

  const savingsRate = totals.income > 0
    ? Math.round((totals.surplus / totals.income) * 1000) / 10
    : 0;
  if (savingsCard) {
    savingsCard.querySelector(".metric-value").textContent = savingsRate + "%";
    savingsCard.querySelector(".positive-pill").textContent = "PLAN";
    savingsCard.querySelector(".muted").textContent = "projected savings rate";
  }

  if (spendingCard) {
    spendingCard.querySelector(".metric-value").textContent = formatKsh(totals.spending);
    spendingCard.querySelector(".metric-foot .muted").textContent =
      `Of ${formatKsh(totals.budget)} budget`;
    spendingCard.querySelector(".metric-trailing").textContent =
      `${totals.budget > 0 ? Math.round((totals.spending / totals.budget) * 100) : 0}%`;
    spendingCard.querySelector(".metric-caption .under-budget").textContent =
      formatKsh(totals.budget - totals.spending);
    const progress = spendingCard.querySelector(".spend-progress");
    if (progress) progress.style.width = `${totals.budget > 0 ? Math.min(100, (totals.spending / totals.budget) * 100) : 0}%`;
  }

  updateDashboardCashflowChart(totals);
}

function updateDashboardCashflowChart(totals = getPowerUpTotals()) {
  const chart = document.querySelector(".cashflow-panel");
  if (!chart) return;

  const maximum = Math.max(totals.income, totals.spending);
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
    const income = isCurrent ? totals.income : 0;
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
    const net = totals.income - totals.spending;
    netValue.textContent = `${net >= 0 ? "+" : "−"}${formatKsh(Math.abs(net))}`;
  }
}

function reportMonthLabel() {
  if (getReportPeriod() === "Year to date") return "YTD";
  return new Date(`${getReportMonth()}-01T12:00:00`).toLocaleDateString(undefined, { month: "short" });
}

function refreshFinancialPage() {
  if (crumb.textContent === "Dashboard") {
    content.innerHTML = dashboardMarkup;
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

function openInventoryDialog(action) {
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
          <h2>Add an inventory item</h2>
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
          <span>Current balance (KSh)</span>
          <input name="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" required>
        </label>
        <label class="inventory-form-field">
          <span>Notes <small>Optional</small></span>
          <textarea name="notes" rows="3" maxlength="500" placeholder="Add a note about this item"></textarea>
        </label>
      </div>
      <footer class="inventory-dialog-actions">
        <button class="inventory-cancel" type="button">Cancel</button>
        <button class="inventory-submit" type="submit">Save item</button>
      </footer>
    </form>`;

  document.body.append(dialog);
  const form = dialog.querySelector(".inventory-form");
  const typeSelect = dialog.querySelector("#inventory-entry-type");
  const categorySelect = dialog.querySelector("#inventory-entry-category");

  function refreshCategories() {
    const categories = typeSelect?.value === "liability"
      ? liabilityCategories
      : assetCategories;
    categorySelect.innerHTML = categories
      .map(category => `<option value="${category.name}">${category.name}</option>`)
      .join("");
    dialog.querySelector(".mobile-money-fields").hidden = categorySelect.value !== "Mobile money";
  }

  refreshCategories();
  typeSelect?.addEventListener("change", refreshCategories);
  categorySelect.addEventListener("change", () => {
    dialog.querySelector(".mobile-money-fields").hidden = categorySelect.value !== "Mobile money";
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

    const entries = getInventoryEntries();
    entries.push({
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: String(formData.get("type")),
      name,
      category: String(formData.get("category")),
      amount,
      mobileType: String(formData.get("category") === "Mobile money" ? formData.get("mobileType") || "Mobile wallet" : ""),
      mobileReference: String(formData.get("category") === "Mobile money" ? formData.get("mobileReference") || "" : "").trim(),
      notes: String(formData.get("notes") || "").trim()
    });

    try {
      saveInventoryEntries(entries);
    } catch {
      showToast("Unable to save this item in browser storage.");
      return;
    }

    dialog.close();
    dialog.remove();
    content.innerHTML = renderInventoryPage();
    showToast(`${name} added to your inventory.`);
  });

  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  dialog.querySelector('input[name="name"]').focus();
}

function openPowerUpDialog(kind) {
  const isIncome = kind === "income";
  const isSpending = kind === "spending";
  const dialog = document.createElement("dialog");
  dialog.className = "inventory-dialog";
  dialog.innerHTML = `
    <form class="inventory-form">
      <header class="inventory-dialog-heading">
        <div>
          <span class="section-kicker">${isIncome ? "MONEY COMING IN" : isSpending ? "MONEY SPENT" : "MONTHLY PLAN"}</span>
          <h2>${isIncome ? "Add an income source" : isSpending ? "Record monthly spending" : "Add a budget line"}</h2>
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
        <button class="inventory-submit" type="submit">Save ${isIncome ? "income" : isSpending ? "spending" : "budget"}</button>
      </footer>
    </form>`;

  document.body.append(dialog);
  const form = dialog.querySelector(".inventory-form");
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
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      amount,
      notes: String(formData.get("notes") || "").trim()
    };
    if (isIncome) data.incomes.push(entry);
    else if (isSpending) data.spending.push({ ...entry, month: String(formData.get("month") || getReportMonth()), category: String(formData.get("category")) });
    else data.budgets.push({ ...entry, category: String(formData.get("category")) });

    try {
      savePowerUpData(data);
    } catch {
      showToast("Unable to save this plan in browser storage.");
      return;
    }

    dialog.close();
    refreshFinancialPage();
    showToast(isSpending ? `${name} recorded as monthly spending.` : `${name} added to your monthly plan.`);
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  dialog.querySelector('input[name="name"]').focus();
}

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
          <span aria-hidden="true">＋</span> Add a quest
        </button>
      </header>
      <section class="inventory-summary quest-summary" aria-label="Quest summary">
        <article class="inventory-summary-card"><span class="inventory-label">ACTIVE QUESTS</span><strong>${quests.length} / 4</strong><span class="inventory-note">Up to four at a time</span></article>
        <article class="inventory-summary-card"><span class="inventory-label">COMPLETED</span><strong>${completed}</strong><span class="inventory-note">Goals at 100% progress</span></article>
        <article class="inventory-summary-card net-worth-summary"><span class="inventory-label">NEXT STEP</span><strong>${canAddQuest ? "Keep going" : "Quest limit"}</strong><span class="inventory-note">${canAddQuest ? "Add or update a goal" : "Delete a goal to add another"}</span></article>
      </section>
      <section class="panel quest-page-panel">
        <div class="panel-heading">
          <div><div class="section-kicker">YOUR CURRENT GOALS</div><h2>Active quests</h2></div>
          <span class="inventory-account-count">${quests.length} of 4</span>
        </div>
        <div class="quest-page-list">${renderQuestRows(quests)}</div>
      </section>
    </section>
    <footer class="page-footer"><span>NETRAOS <i>·</i> YOUR FINANCIAL OPERATING SYSTEM</span><span>Private by design <i>✳</i></span></footer>`;
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
        <label class="inventory-form-field"><span>Current amount (KSh)</span><input name="current" type="number" min="0" step="0.01" inputmode="decimal" value="${Number(quest?.current || 0)}" required></label>
        <label class="inventory-form-field"><span>Target amount (KSh)</span><input name="target" type="number" min="1" step="0.01" inputmode="decimal" value="${Number(quest?.target || 0) || ""}" required></label>
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
    const updatedQuest = { id: quest?.id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`, name, current, target };
    const updatedQuests = quest ? quests.map(item => item.id === quest.id ? updatedQuest : item) : [...quests, updatedQuest];
    try {
      saveQuests(updatedQuests);
    } catch {
      showToast("Unable to save this quest in browser storage.");
      return;
    }
    dialog.close();
    refreshFinancialPage();
    if (!wasComplete && questProgress(updatedQuest) === 100) celebrateQuestCompletion(name);
    else showToast(quest ? "Quest progress updated." : `${name} added to your quests.`);
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  dialog.querySelector('input[name="name"]').focus();
}

function celebrateQuestCompletion(name) {
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
    refreshFinancialPage();
    showToast("Quest removed.");
  } catch {
    showToast("Unable to update browser storage.");
  }
}

function renderStatsPage() {
  const inventory = getInventoryEntries();
  const power = getPowerUpData();
  const totals = getPowerUpTotals();
  const balance = getInventoryTotals();
  const quests = getQuests();
  const savingsRate = totals.income > 0
    ? Math.round(((totals.income - totals.spending) / totals.income) * 1000) / 10
    : 0;
  const categories = budgetCategories.map(category => {
    const planned = power.budgets.filter(item => item.category === category)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const spent = power.spending.filter(item => item.category === category)
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
    { label: "Monthly income", value: totals.income, color: "income" },
    { label: "Planned budget", value: totals.budget, color: "planned" },
    { label: "Monthly spending", value: totals.spending, color: "spent" },
    { label: "Budget remaining", value: totals.budget - totals.spending, color: "remaining" }
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
        <article class="inventory-summary-card"><span class="inventory-label">MONTHLY INCOME</span><strong>${formatKsh(totals.income)}</strong><span class="inventory-note">${power.incomes.length} income ${power.incomes.length === 1 ? "source" : "sources"}</span></article>
        <article class="inventory-summary-card"><span class="inventory-label">MONTHLY SPENDING</span><strong>${formatKsh(totals.spending)}</strong><span class="inventory-note">${power.spending.length} recorded ${power.spending.length === 1 ? "expense" : "expenses"}</span></article>
        <article class="inventory-summary-card"><span class="inventory-label">SAVINGS RATE</span><strong>${savingsRate}%</strong><span class="inventory-note">Income less recorded spending</span></article>
      </section>
      <section class="stats-panels">
        <article class="panel stats-panel">
          <div class="panel-heading"><div><div class="section-kicker">MONTHLY OVERVIEW</div><h2>Income &amp; outflow</h2></div><span class="inventory-account-count">KSh / month</span></div>
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
    <footer class="page-footer"><span>NETRAOS <i>·</i> YOUR FINANCIAL OPERATING SYSTEM</span><span>Private by design <i>✳</i></span></footer>`;
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
    { id: "positive-flow", icon: "⌁", name: "Positive cash flow", detail: "Record monthly income greater than spending.", progress: totals.income > 0 ? Math.max(0, Math.min(100, Math.round(((totals.income - totals.spending) / totals.income) * 100))) : 0, target: 100, suffix: "%", earned: totals.income > 0 && totals.income > totals.spending },
    { id: "net-worth-100k", icon: "◇", name: "KSh 100,000 net worth", detail: "Build your net worth to KSh 100,000.", progress: Math.max(0, Math.min(100, Math.round((balance.netWorth / 100000) * 100))), target: 100, suffix: "%", earned: balance.netWorth >= 100000 }
  ];
  let earnedIds = [];
  try {
    const savedIds = JSON.parse(localStorage.getItem(achievementStorageKey) || "[]");
    earnedIds = Array.isArray(savedIds) ? savedIds : [];
  } catch {
    earnedIds = [];
  }
  milestones.forEach(milestone => {
    if (milestone.progress >= milestone.target || milestone.earned) {
      if (!earnedIds.includes(milestone.id)) earnedIds.push(milestone.id);
    }
    milestone.isEarned = earnedIds.includes(milestone.id);
  });
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
          <p class="welcome-sub">Your milestones unlock as you build healthy financial habits. Earned achievements stay on your record.</p>
        </div>
        <div class="achievement-score"><strong>${earnedCount} / ${milestones.length}</strong><span>milestones earned</span></div>
      </header>
      <section class="achievement-grid" aria-label="Financial achievements">${cards}</section>
    </section>
    <footer class="page-footer"><span>NETRAOS <i>·</i> YOUR FINANCIAL OPERATING SYSTEM</span><span>Private by design <i>✳</i></span></footer>`;
}

// Navigation
function showPage(page) {
  navItems.forEach(item => {
    const selected = item.dataset.page === page;
    item.classList.toggle("active", selected);
    item.setAttribute("aria-current", selected ? "page" : "false");
  });
  crumb.textContent = page;
  if (page === "Dashboard") {
    window.location.hash = "dashboard";
    content.innerHTML = dashboardMarkup;
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
    <footer class="page-footer">
      <span>NETRAOS <i>·</i> YOUR FINANCIAL OPERATING SYSTEM</span>
      <span>Private by design <i>✳</i></span>
    </footer>
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
          <button class="inventory-delete" type="button" data-delete-power-item="spending" data-item-id="${escapeHTML(item.id)}" aria-label="Delete ${escapeHTML(item.name)}" title="Delete spending item">×</button>
        </div>`).join("")
    : `<div class="power-empty">No spending recorded for ${getReportPeriod().toLowerCase()}. Add an expense for ${reportMonthLabel()}.</div>`;
  const savingsRate = totals.income > 0
    ? Math.round((totals.surplus / totals.income) * 1000) / 10
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
          <span aria-hidden="true">＋</span> Add income
        </button>
      </header>

      <section class="inventory-summary power-summary" aria-label="Monthly plan summary">
        <article class="inventory-summary-card">
          <span class="inventory-label">MONTHLY INCOME</span>
          <strong>${formatKsh(totals.income)}</strong>
          <span class="inventory-note">${data.incomes.length} income ${data.incomes.length === 1 ? "source" : "sources"}</span>
        </article>
        <article class="inventory-summary-card">
          <span class="inventory-label">PLANNED BUDGET</span>
          <strong>${formatKsh(totals.budget)}</strong>
          <span class="inventory-note">Across ${data.budgets.length} budget ${data.budgets.length === 1 ? "line" : "lines"}</span>
        </article>
        <article class="inventory-summary-card">
          <span class="inventory-label">MONTHLY SPENDING</span>
          <strong>${formatKsh(totals.spending)}</strong>
          <span class="inventory-note">${reportSpending.length} ${getReportPeriod().toLowerCase()} ${reportSpending.length === 1 ? "record" : "records"}</span>
        </article>
        <article class="inventory-summary-card net-worth-summary">
          <span class="inventory-label">BUDGET REMAINING</span>
          <strong>${formatKsh(totals.budget - totals.spending)}</strong>
          <span class="inventory-note">${savingsRate}% projected savings rate</span>
        </article>
      </section>

      ${renderTaxWidget()}

      <section class="inventory-columns power-columns" aria-label="Income and monthly budget">
        <article class="panel power-list-panel">
          <div class="panel-heading">
            <div><div class="section-kicker">MONEY COMING IN</div><h2>Income sources</h2></div>
            <button class="inventory-add-small" type="button" data-power-action="income">＋ Add income</button>
          </div>
          <div class="power-rows">${incomeRows}</div>
          <div class="inventory-panel-total"><span>Total monthly income</span><strong>${formatKsh(totals.income)}</strong></div>
        </article>

        <article class="panel power-list-panel">
          <div class="panel-heading">
            <div><div class="section-kicker">MONEY WITH A JOB</div><h2>Monthly budget</h2></div>
            <button class="inventory-add-small" type="button" data-power-action="budget">＋ Add budget</button>
          </div>
          <div class="power-rows">${budgetRows}</div>
          <div class="inventory-panel-total"><span>Total planned budget</span><strong>${formatKsh(totals.budget)}</strong></div>
        </article>

        <article class="panel power-list-panel">
          <div class="panel-heading">
            <div><div class="section-kicker">MONEY SPENT</div><h2>Monthly spending</h2></div>
            <button class="inventory-add-small" type="button" data-power-action="spending">＋ Add spending</button>
          </div>
          <div class="power-rows">${spendingRows}</div>
          <div class="inventory-panel-total"><span>Total monthly spending</span><strong>${formatKsh(totals.spending)}</strong></div>
        </article>
      </section>
    </section>
    <footer class="page-footer">
      <span>NETRAOS <i>·</i> YOUR FINANCIAL OPERATING SYSTEM</span>
      <span>Private by design <i>✳</i></span>
    </footer>`;
}

// Kenya gross-to-net calculator (monthly): PAYE, NSSF, SHIF and Affordable Housing Levy
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
const taxColors = { net: "#13875f", paye: "#d8b451", nssf: "#2f6f8f", shif: "#c0584a", ahl: "#7a6bb0" };

function computeKenyaPayroll(grossInput) {
  const gross = Math.max(0, Math.round(Number(grossInput) || 0));
  const nssf = Math.round(Math.min(gross, KE_TAX.nssfUpperLimit) * KE_TAX.nssfRate);
  const ahl = Math.round(gross * KE_TAX.ahlRate);
  const shifRaw = gross > 0 ? Math.max(KE_TAX.shifMinimum, gross * KE_TAX.shifRate) : 0;
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
  const relief = Math.min(KE_TAX.personalRelief, taxBeforeRelief);
  const paye = Math.round(taxBeforeRelief - relief);
  const deductions = paye + nssf + shif + ahl;
  const net = Math.max(0, gross - deductions);
  return {
    gross, nssf, shif, ahl, taxable, paye, deductions, net,
    taxBeforeRelief: Math.round(taxBeforeRelief),
    relief: Math.round(relief),
    shifAtMinimum: gross > 0 && shifRaw === KE_TAX.shifMinimum && gross * KE_TAX.shifRate < KE_TAX.shifMinimum
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
    <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${filled.toFixed(2)} ${circumference.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"></circle>
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
        <button type="button" class="tax-expand" data-tax-toggle aria-expanded="false" aria-controls="${compact ? "tax-body-compact" : "tax-body-full"}"><span>Show calculator</span><span class="tax-expand-icon" aria-hidden="true">⌄</span></button>
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

document.addEventListener("input", event => {
  const projectionInput = event.target.closest?.("[data-projection-input]");
  if (projectionInput) updateSavingsProjection(projectionInput);
});

document.addEventListener("click", event => {
  const projectionToggle = event.target.closest?.("[data-projection-toggle]");
  if (projectionToggle) {
    const state = getSavingsProjectionState();
    updateSavingsProjection(null, null, { minimized: !state.minimized });
    return;
  }
  const inflationToggle = event.target.closest?.("[data-projection-inflation-toggle]");
  if (inflationToggle) {
    const state = getSavingsProjectionState();
    updateSavingsProjection(null, null, { inflationAdjusted: !state.inflationAdjusted });
    return;
  }
  const horizonButton = event.target.closest?.("[data-projection-years]");
  if (!horizonButton) return;
  const panel = horizonButton.closest(".projection-panel");
  if (!panel) return;
  panel.querySelectorAll("[data-projection-years]").forEach(button => {
    const selected = button === horizonButton;
    button.setAttribute("aria-pressed", String(selected));
  });
  updateSavingsProjection(null, Number(horizonButton.dataset.projectionYears));
});

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

// Contact page
const supportChannels = [
  { dept: "Core Systems & Support", email: "support@netraos.io", hours: "Mon – Fri: 08:00 – 18:00", sla: "< 2 hours", window: { start: 8, end: 18 } },
  { dept: "Security & Privacy Desk", email: "security@netraos.io", hours: "24 / 7 / 365 (Automated)", sla: "< 30 mins", window: null },
  { dept: "Partnerships & Banking APIs", email: "integrations@netraos.io", hours: "Mon – Fri: 09:00 – 17:00", sla: "24 Hours", window: { start: 9, end: 17 } },
  { dept: "Media & Relations", email: "press@netraos.io", hours: "Mon – Fri: 09:00 – 17:00", sla: "48 Hours", window: { start: 9, end: 17 } }
];

const contactDestinations = {
  support: { label: "Tech Support", to: "support@netraos.io", tag: "SUPPORT" },
  bug: { label: "Bug Report", to: "support@netraos.io", tag: "BUG REPORT" },
  security: { label: "Security", to: "security@netraos.io", tag: "SECURITY" }
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
  if (!channel.window) return { label: "ALWAYS ON", open: true };
  const now = nairobiNow();
  if (!now) return { label: "", open: false };
  const open = now.day >= 1 && now.day <= 5 && now.hour >= channel.window.start && now.hour < channel.window.end;
  return { label: open ? "OPEN NOW" : "CLOSED", open };
}

function renderSystemPill() {
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  return online
    ? `<span class="system-pill" data-system-pill role="status"><i></i>All Nodes Operational <small>Latency: 14ms · Nairobi Server Hub</small></span>`
    : `<span class="system-pill warn" data-system-pill role="status"><i></i>Sync Delay <small>You're offline · changes are saved locally</small></span>`;
}

function refreshSystemPills() {
  document.querySelectorAll("[data-system-pill]").forEach(pill => {
    pill.outerHTML = renderSystemPill();
  });
}

window.addEventListener("online", refreshSystemPills);
window.addEventListener("offline", refreshSystemPills);

function renderContactPage() {
  const channelRows = supportChannels.map(channel => {
    const status = channelStatus(channel);
    return `
      <div class="contact-row" role="row">
        <span class="contact-dept" role="cell"><strong>${channel.dept}</strong>${status.label ? `<small class="${status.open ? "open" : "closed"}"><i></i>${status.label}</small>` : ""}</span>
        <a class="contact-email" role="cell" href="mailto:${channel.email}">${channel.email}</a>
        <span class="contact-hours" role="cell">${channel.hours}</span>
        <span class="contact-sla" role="cell">${channel.sla}</span>
      </div>`;
  }).join("");

  return `
    <section class="contact-page">
      <header class="inventory-heading">
        <div>
          <div class="eyebrow"><span class="eyebrow-line"></span> SUPPORT NODE</div>
          <h1>Talk to the<br><em>NetraOS team.</em></h1>
          <p class="welcome-sub">Pick a channel, check who is online, or open the terminal to send a message. All times are East Africa Time (EAT).</p>
        </div>
        ${renderSystemPill()}
      </header>

      <section class="contact-grid">
        <article class="panel contact-channels">
          <div class="panel-heading">
            <div><div class="section-kicker">SYSTEM STATUS &amp; DIRECT CHANNELS</div><h2>Departments</h2></div>
          </div>
          <div class="contact-table" role="table" aria-label="Support departments">
            <div class="contact-row contact-head" role="row">
              <span role="columnheader">DEPARTMENT</span><span role="columnheader">CONTACT ENDPOINT</span><span role="columnheader">OPERATING HOURS (EAT)</span><span role="columnheader">TARGET SLA</span>
            </div>
            ${channelRows}
          </div>
        </article>

        <article class="panel contact-lines">
          <div class="panel-heading">
            <div><div class="section-kicker">COMMAND DIRECT LINES</div><h2>Call or message</h2></div>
          </div>
          <div class="contact-line-list">
            <a class="contact-line" href="tel:+254700000988"><span class="contact-line-icon">☎</span><span><small>PRIMARY OPERATIONS DESK</small><strong>+254 (0) 700 000 988</strong></span></a>
            <a class="contact-line" href="https://wa.me/254799000988" target="_blank" rel="noopener"><span class="contact-line-icon">✉</span><span><small>ENCRYPTED DISPATCH (WHATSAPP ONLY)</small><strong>+254 (0) 799 000 988</strong></span></a>
            <a class="contact-line emergency" href="tel:*384*988%23"><span class="contact-line-icon">⚠</span><span><small>EMERGENCY SYSTEM OVERRIDE / ACCOUNT LOCK</small><strong>Dial *384*988#</strong><em>USSD Emergency Shield</em></span></a>
          </div>
        </article>
      </section>

      <section class="contact-grid contact-grid-lower">
        <form class="terminal" data-contact-form novalidate aria-label="Contact terminal">
          <div class="terminal-bar"><i></i><i></i><i></i><span>[NETRA_OS_TERMINAL v2.4] &gt; INIT_CONTACT_STREAM...</span></div>
          <div class="terminal-body">
            <label class="terminal-field"><span>USER_IDENTIFIER</span><input name="handle" type="text" maxlength="80" autocomplete="name" placeholder="Enter your name / handle"></label>
            <label class="terminal-field"><span>SIGNAL_DESTINATION</span>
              <select name="dest">${Object.entries(contactDestinations).map(([key, dest]) => `<option value="${key}">${dest.label}</option>`).join("")}</select>
            </label>
            <label class="terminal-field"><span>COMMUNICATION_PAYLOAD</span><textarea name="payload" maxlength="2000" rows="5" placeholder="Type message here..."></textarea></label>
            <div class="terminal-actions">
              <button class="terminal-send" type="submit">[ SEND_TRANSMISSION ]</button>
              <button class="terminal-clear" type="button" data-contact-clear>[ CLEAR_BUFFER ]</button>
            </div>
            <div class="terminal-status" role="status" aria-live="polite">STATUS: <b>READY TO TRANSMIT</b></div>
            <p class="terminal-note">Sending opens your email app with the message filled in. Never include your PIN, M-Pesa credentials or master security key.</p>
          </div>
        </form>

        <div class="contact-side">
          <article class="panel contact-hq">
            <div class="panel-heading">
              <div><div class="section-kicker">PHYSICAL HQ &amp; DATA OPERATIONS</div><h2>NetraOS Technologies Lab</h2></div>
            </div>
            <dl class="contact-dl">
              <div><dt>Location</dt><dd>The Mirage Towers, 8th Floor, Tower 2</dd></div>
              <div><dt>Street</dt><dd>Chiromo Road, Westlands</dd></div>
              <div><dt>City</dt><dd>Nairobi, Kenya</dd></div>
              <div><dt>Postal address</dt><dd>P.O. Box 40100 - 00100</dd></div>
            </dl>
          </article>

          <article class="panel contact-security">
            <div class="panel-heading">
              <div><div class="section-kicker">ENCRYPTION &amp; VERIFICATION</div><h2>Private by design</h2></div>
            </div>
            <dl class="contact-dl">
              <div><dt>PGP key fingerprint</dt><dd class="mono">8F2A 991B C4DE 0012 3456 7890 NETRA OS HQ</dd></div>
              <div><dt>End-to-end encryption</dt><dd>Active (TLS 1.3 / AES-256)</dd></div>
              <div><dt>Zero-knowledge guarantee</dt><dd>Support engineers never request your PIN, M-Pesa credentials, or master security key.</dd></div>
            </dl>
          </article>
        </div>
      </section>
    </section>
    <footer class="page-footer">
      <span>NETRAOS <i>·</i> YOUR FINANCIAL OPERATING SYSTEM</span>
      <span>Private by design <i>✳</i></span>
    </footer>`;
}

document.addEventListener("submit", event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches("[data-contact-form]")) return;
  event.preventDefault();
  const status = form.querySelector(".terminal-status");
  const setStatus = (text, error = false) => {
    status.innerHTML = `STATUS: <b class="${error ? "error" : ""}">${text}</b>`;
  };
  const data = new FormData(form);
  const handle = String(data.get("handle") || "").trim();
  const payload = String(data.get("payload") || "").trim();
  const dest = contactDestinations[String(data.get("dest"))] || contactDestinations.support;
  if (!handle) { setStatus("ERROR · USER_IDENTIFIER REQUIRED", true); form.elements.handle.focus(); return; }
  if (payload.length < 10) { setStatus("ERROR · PAYLOAD TOO SHORT", true); form.elements.payload.focus(); return; }
  const subject = `[${dest.tag}] NetraOS message from ${handle}`;
  const body = `${payload}\n\n— ${handle}`;
  window.location.href = `mailto:${dest.to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  setStatus(`HANDED TO YOUR EMAIL APP · ${dest.to}`);
});

document.addEventListener("click", event => {
  const clear = event.target.closest("[data-contact-clear]");
  if (!clear) return;
  const form = clear.closest("form");
  form.reset();
  form.querySelector(".terminal-status").innerHTML = "STATUS: <b>BUFFER CLEARED · READY TO TRANSMIT</b>";
});

// Menus and short status messages
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

// Dashboard export data
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
  document.querySelectorAll(".activity-row").forEach(item => {
    const label = item.querySelector("strong")?.innerText.trim();
    const value = item.querySelector(".activity-amount")?.innerText.trim();
    if (label && value) {
      rows.push(["Activity: " + label, value]);
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

// CSV export
function downloadSummary() {
  const rows = collectDashboardRows();
  const csvEscape = value =>
    '"' + String(value).replace(/"/g, '""') + '"';
  const csv = rows.map(row => row.map(csvEscape).join(",")).join("\r\n");
  saveFile("netraos-dashboard.csv", csv, "text/csv;charset=utf-8");
  showToast("Dashboard CSV downloaded.");
}

// Excel-compatible SpreadsheetML export
function downloadExcel() {
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

// Build a self-contained, vector-based financial report PDF.
function downloadPDF() {
  const W = 612;
  const H = 792;
  const colors = {
    ink: "#17251D", muted: "#64736A", green: "#126B4A", deep: "#103B2C",
    gold: "#D9B653", pale: "#F3F8F5", line: "#DDE8E1", white: "#FFFFFF",
    red: "#C65B50", blue: "#4D8197", purple: "#8973A8", light: "#EAF2ED"
  };
  const toRgb = hex => {
    const raw = hex.replace("#", "");
    return [0, 2, 4].map(index => (parseInt(raw.slice(index, index + 2), 16) / 255).toFixed(3)).join(" ");
  };
  const ascii = value => String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
  const escaped = value => ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const short = (value, max = 30) => {
    const text = ascii(value);
    return text.length > max ? text.slice(0, Math.max(0, max - 3)) + "..." : text;
  };
  const currencyState = getCurrencyState();
  const reportCurrency = currencyState.active === "KES" ? "KSh" : currencyState.active;
  const reportRate = currencyState.rates[currencyState.active] || 1;
  const reportMoney = amount => `${reportCurrency} ${ (Number(amount || 0) / reportRate).toLocaleString("en-US", { minimumFractionDigits: getStoredSettings().alwaysShowCents ? 2 : 0, maximumFractionDigits: 2 })}`;
  const entries = getInventoryEntries();
  const totals = getInventoryTotals();
  const power = getPowerUpData();
  const reportSpending = spendingForReport(power.spending);
  const plan = {
    income: power.incomes.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    budget: power.budgets.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    spending: reportSpending.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  };
  plan.surplus = plan.income - plan.spending;
  const quests = getQuests();
  const savingsRate = plan.income > 0 ? Math.round(((plan.income - plan.spending) / plan.income) * 1000) / 10 : 0;
  const initials = (getStoredProfile()?.name || "NetraOS").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase() || "NO";
  const reportDate = new Date().toLocaleDateString("en-KE", { year: "numeric", month: "long", day: "numeric" });
  const streams = [];

  function text(stream, x, y, size, value, color = colors.ink, bold = false) {
    stream.push(`${toRgb(color)} rg BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escaped(value)}) Tj ET\n`);
  }
  function rect(stream, x, y, w, h, fill, stroke = "", lineWidth = 1) {
    if (fill) stream.push(`${toRgb(fill)} rg `);
    if (stroke) stream.push(`${toRgb(stroke)} RG ${lineWidth} w `);
    stream.push(`${x} ${y} ${w} ${h} re ${fill && stroke ? "B" : fill ? "f" : "S"}\n`);
  }
  function line(stream, x1, y1, x2, y2, color = colors.line, width = 1) {
    stream.push(`${toRgb(color)} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`);
  }
  function circlePath(stream, cx, cy, r) {
    const k = r * 0.5522847498;
    stream.push(`${(cx + r).toFixed(2)} ${cy.toFixed(2)} m ${(cx + r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx + k).toFixed(2)} ${(cy + r).toFixed(2)} ${cx.toFixed(2)} ${(cy + r).toFixed(2)} c ${(cx - k).toFixed(2)} ${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx - r).toFixed(2)} ${cy.toFixed(2)} c ${(cx - r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx - k).toFixed(2)} ${(cy - r).toFixed(2)} ${cx.toFixed(2)} ${(cy - r).toFixed(2)} c ${(cx + k).toFixed(2)} ${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx + r).toFixed(2)} ${cy.toFixed(2)} c`);
  }
  function drawLogo(stream, x, y, size, light = false) {
    const scale = size / 256;
    stream.push(`q ${scale} 0 0 -${scale} ${x} ${y + size} cm\n`);
    stream.push(toRgb('#0A0A0A') + ' rg 0 0 256 256 re f\n');
    stream.push(toRgb('#1F2937') + ' RG 0.8 w [2 2] 0 d 51.2 128 m 204.8 128 l 128 51.2 m 128 204.8 l S [] 0 d\n');
    circlePath(stream, 128, 128, 71.68);
    stream.push(toRgb('#1F2937') + ' RG 0.75 w [3 3] 0 d S [] 0 d\n');
    stream.push(toRgb('#F2F1E1') + ' RG 6.14 w 56.32 128 m 104.11 83.63 151.89 83.63 199.68 128 c 151.89 172.37 104.11 172.37 56.32 128 c S\n');
    circlePath(stream, 128, 128, 33.28);
    stream.push(toRgb('#E3B74B') + ' RG 5.12 w S\n');
    stream.push(toRgb('#E3B74B') + ' RG 4.1 w 112.64 138.24 m 128 117.76 l 143.36 138.24 l S\n');
    circlePath(stream, 128, 128, 8.19);
    stream.push(toRgb('#F2F1E1') + ' rg f\n');
    circlePath(stream, 56.32, 128, 3.07);
    stream.push(toRgb('#E3B74B') + ' rg f\n');
    circlePath(stream, 199.68, 128, 3.07);
    stream.push(toRgb('#E3B74B') + ' rg f\n');
    stream.push('Q\n');
  }
  function drawWatermark(stream) {
    const size = 176, x = 218, y = 340, scale = size / 256;
    stream.push(`q ${scale} 0 0 -${scale} ${x} ${y + size} cm\n`);
    stream.push(toRgb('#CAD4CE') + ' RG 3.2 w 56.32 128 m 104.11 83.63 151.89 83.63 199.68 128 c 151.89 172.37 104.11 172.37 56.32 128 c S\n');
    circlePath(stream, 128, 128, 33.28);
    stream.push(toRgb('#D3B05F') + ' RG 2.8 w S\n');
    stream.push(toRgb('#D3B05F') + ' RG 2.2 w 112.64 138.24 m 128 117.76 l 143.36 138.24 l S\n');
    circlePath(stream, 128, 128, 8.19);
    stream.push(toRgb('#CAD4CE') + ' rg f\n');
    circlePath(stream, 56.32, 128, 3.07);
    stream.push(toRgb('#D3B05F') + ' rg f\n');
    circlePath(stream, 199.68, 128, 3.07);
    stream.push(toRgb('#D3B05F') + ' rg f\n');
    stream.push('Q\n');
    text(stream, 306 - (initials.length * 4), 357, 8, initials, '#A9B4AD', true);
  }
  function drawHeader(stream, title, pageNo, pageCount) {
    rect(stream, 0, 700, W, 92, colors.deep);
    drawLogo(stream, 42, 723, 42, true);
    text(stream, 96, 753, 18, "NETRAOS", colors.white, true);
    text(stream, 97, 737, 8, "YOUR FINANCIAL OPERATING SYSTEM", "#C9DDD2");
    text(stream, 42, 674, 19, title, colors.ink, true);
    text(stream, 42, 657, 9, `Generated ${reportDate}  |  ${getReportPeriod()}  |  Display: ${reportCurrency}`, colors.muted);
    line(stream, 42, 642, 570, 642, colors.line, 1);
    text(stream, 500, 24, 8, `PAGE ${pageNo} / ${pageCount}`, colors.muted);
    text(stream, 42, 24, 8, "PRIVATE FINANCIAL SUMMARY  |  SAVED LOCALLY IN THIS BROWSER", colors.muted);
  }
  function pieSlice(stream, cx, cy, radius, start, end, fill) {
    const segments = Math.max(1, Math.ceil(Math.abs(end - start) / (Math.PI / 2)));
    const delta = (end - start) / segments;
    let angle = start;
    const sx = cx + radius * Math.cos(angle);
    const sy = cy + radius * Math.sin(angle);
    stream.push(`${toRgb(fill)} rg ${cx.toFixed(2)} ${cy.toFixed(2)} m ${sx.toFixed(2)} ${sy.toFixed(2)} l `);
    for (let i = 0; i < segments; i += 1) {
      const next = angle + delta;
      const k = (4 / 3) * Math.tan((next - angle) / 4);
      const x0 = cx + radius * Math.cos(angle), y0 = cy + radius * Math.sin(angle);
      const x1 = cx + radius * Math.cos(next), y1 = cy + radius * Math.sin(next);
      const c1x = x0 - radius * k * Math.sin(angle), c1y = y0 + radius * k * Math.cos(angle);
      const c2x = x1 + radius * k * Math.sin(next), c2y = y1 - radius * k * Math.cos(next);
      stream.push(`${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${x1.toFixed(2)} ${y1.toFixed(2)} c `);
      angle = next;
    }
    stream.push("h f\n");
  }
  function drawOverview(pageCount) {
    const s = [];
    drawHeader(s, "Financial Snapshot", 1, pageCount);

    const summary = [
      { label: "TOTAL ASSETS", value: totals.assets, fill: colors.pale },
      { label: "TOTAL LIABILITIES", value: totals.liabilities, fill: "#FBF2F0" },
      { label: "NET WORTH", value: totals.netWorth, fill: "#EDF5EF" }
    ];
    summary.forEach((item, index) => {
      const x = 42 + index * 178;
      rect(s, x, 570, 166, 56, item.fill, colors.line);
      text(s, x + 12, 609, 8, item.label, colors.muted, true);
      text(s, x + 12, 585, 15, reportMoney(item.value), index === 1 ? colors.red : colors.ink, true);
    });

    rect(s, 42, 350, 256, 202, colors.white, colors.line);
    rect(s, 314, 350, 256, 202, colors.white, colors.line);
    drawWatermark(s);
    text(s, 58, 529, 10, "ASSET MIX", colors.ink, true);
    text(s, 330, 529, 10, "SPENDING MIX", colors.ink, true);

    const assetGroups = [
      { label: "Bank accounts", value: entries.filter(item => item.type === "asset" && item.category === "Bank accounts").reduce((sum, item) => sum + Number(item.amount || 0), 0), color: colors.green },
      { label: "Mobile money", value: entries.filter(item => item.type === "asset" && item.category === "Mobile money").reduce((sum, item) => sum + Number(item.amount || 0), 0), color: colors.gold },
      { label: "Cash & savings", value: entries.filter(item => item.type === "asset" && item.category === "Cash & savings").reduce((sum, item) => sum + Number(item.amount || 0), 0), color: colors.blue },
      { label: "Investments", value: entries.filter(item => item.type === "asset" && item.category === "Investments").reduce((sum, item) => sum + Number(item.amount || 0), 0), color: colors.purple },
      { label: "Property & other", value: entries.filter(item => item.type === "asset" && ["Property & vehicles", "Other assets"].includes(item.category)).reduce((sum, item) => sum + Number(item.amount || 0), 0), color: colors.red }
    ];
    const assetTotal = assetGroups.reduce((sum, item) => sum + item.value, 0);
    if (assetTotal > 0) {
      let angle = Math.PI / 2;
      assetGroups.filter(item => item.value > 0).forEach(item => {
        const next = angle - (item.value / assetTotal) * Math.PI * 2;
        pieSlice(s, 112, 435, 56, angle, next, item.color);
        angle = next;
      });
    } else {
      circlePath(s, 112, 435, 56);
      s.push(`${toRgb(colors.light)} rg f\n`);
    }
    circlePath(s, 112, 435, 30);
    s.push(`${toRgb(colors.white)} rg f\n`);
    text(s, 91, 438, 8, "ASSETS", colors.muted, true);
    text(s, 83, 422, 8, reportMoney(totals.assets), colors.ink, true);
    assetGroups.forEach((item, index) => {
      const y = 495 - index * 27;
      rect(s, 184, y - 2, 7, 7, item.color);
      text(s, 198, y, 7, short(item.label, 18), colors.ink);
      text(s, 198, y - 10, 6.5, `${assetTotal ? Math.round(item.value / assetTotal * 100) : 0}%  ${reportMoney(item.value)}`, colors.muted);
    });
    if (assetTotal === 0) text(s, 58, 358, 7, "Add asset balances to build your asset mix.", colors.muted);

    const expenseGroupsAll = budgetCategories.map((label, index) => ({
      label,
      value: reportSpending.filter(item => item.category === label).reduce((sum, item) => sum + Number(item.amount || 0), 0),
      color: [colors.red, colors.gold, colors.blue, colors.purple, colors.green, "#829783", "#B77D57", "#6880A6"][index % 8]
    })).filter(item => item.value > 0).sort((a, b) => b.value - a.value);
    const spendGroups = expenseGroupsAll.length > 5
      ? [...expenseGroupsAll.slice(0, 4), { label: "Other", value: expenseGroupsAll.slice(4).reduce((sum, item) => sum + item.value, 0), color: "#829783" }]
      : expenseGroupsAll;
    const spendTotal = spendGroups.reduce((sum, item) => sum + item.value, 0);
    if (spendTotal > 0) {
      let angle = Math.PI / 2;
      spendGroups.forEach(item => {
        const next = angle - (item.value / spendTotal) * Math.PI * 2;
        pieSlice(s, 384, 435, 56, angle, next, item.color);
        angle = next;
      });
    } else {
      circlePath(s, 384, 435, 56);
      s.push(`${toRgb(colors.light)} rg f\n`);
    }
    circlePath(s, 384, 435, 30);
    s.push(`${toRgb(colors.white)} rg f\n`);
    text(s, 364, 438, 7, "SPENT", colors.muted, true);
    text(s, 351, 422, 7, reportMoney(plan.spending), colors.ink, true);
    if (spendGroups.length) {
      spendGroups.forEach((item, index) => {
        const y = 495 - index * 27;
        rect(s, 446, y - 2, 7, 7, item.color);
        text(s, 460, y, 6.5, short(item.label, 15), colors.ink);
        text(s, 460, y - 10, 6.5, `${Math.round(item.value / spendTotal * 100)}%  ${reportMoney(item.value)}`, colors.muted);
      });
    } else {
      text(s, 446, 426, 7, "No spending recorded for this period.", colors.muted);
    }

    rect(s, 42, 158, 528, 174, colors.white, colors.line);
    text(s, 58, 310, 10, "MONTHLY CASH FLOW", colors.ink, true);
    const chartX = 75, chartBase = 207, chartWidth = 462;
    [0, 1, 2, 3].forEach(index => {
      const y = chartBase + index * 20;
      line(s, chartX, y, chartX + chartWidth, y, "#E7EEE9", 0.6);
    });
    const flowBars = [
      { label: "Income", value: plan.income, color: colors.green },
      { label: "Budget", value: plan.budget, color: colors.blue },
      { label: "Spent", value: plan.spending, color: colors.red },
      { label: "Left", value: plan.budget - plan.spending, color: colors.gold }
    ];
    const maxFlow = Math.max(1, ...flowBars.map(item => Math.abs(item.value)));
    const slot = chartWidth / flowBars.length;
    flowBars.forEach((item, index) => {
      const x = chartX + slot * index + 28;
      const h = Math.max(1, Math.abs(item.value) / maxFlow * (item.value >= 0 ? 50 : 25));
      const y = item.value >= 0 ? chartBase : chartBase - h;
      rect(s, x, y, 48, h, item.color);
      text(s, x - 8, Math.max(chartBase + 55, y + h + 6), 7, reportMoney(item.value), colors.ink, true);
      text(s, x + 8, 177, 8, item.label, colors.muted);
    });
    text(s, 58, 165, 7, "Income, planned budget, spending and remaining budget. Values use your selected display currency.", colors.muted);

    rect(s, 42, 70, 528, 72, colors.pale, colors.line);
    text(s, 58, 123, 9, "PERIOD HIGHLIGHTS", colors.ink, true);
    const highlights = [
      { label: "MONTHLY INCOME", value: reportMoney(plan.income) },
      { label: "SPENDING", value: reportMoney(plan.spending) },
      { label: "BUDGET LEFT", value: reportMoney(plan.budget - plan.spending) },
      { label: "SAVINGS RATE", value: `${savingsRate}%` }
    ];
    highlights.forEach((item, index) => {
      const x = 58 + index * 128;
      text(s, x, 104, 6.5, item.label, colors.muted, true);
      text(s, x, 86, 9, item.value, colors.ink, true);
    });
    streams.push(s.join(""));
  }
  function drawDetailPage(pageNo, pageCount, detailRows) {
    const s = [];
    drawHeader(s, "Accounts & Plan Details", pageNo, pageCount);
    drawWatermark(s);
    text(s, 48, 620, 8, "SECTION", colors.muted, true);
    text(s, 142, 620, 8, "ACCOUNT / ITEM", colors.muted, true);
    text(s, 356, 620, 8, "DETAIL", colors.muted, true);
    text(s, 510, 620, 8, "VALUE", colors.muted, true);
    line(s, 42, 607, 570, 607, colors.line, 1);
    detailRows.forEach((row, index) => {
      const y = 585 - index * 19;
      if (index % 2 === 0) rect(s, 42, y - 7, 528, 18, "#F7FAF8");
      text(s, 48, y, 7, short(row.section, 13), colors.green, true);
      text(s, 142, y, 8, short(row.name, 31), colors.ink, true);
      text(s, 356, y, 7, short(row.detail, 25), colors.muted);
      text(s, 510, y, 7.5, short(row.value, 17), colors.ink, true);
    });
    streams.push(s.join(""));
  }

  const details = [];
  entries.forEach(entry => details.push({ section: entry.type === "asset" ? "ASSET" : "LIABILITY", name: entry.name, detail: `${entry.category}${entry.mobileType ? ` - ${entry.mobileType}` : ""}${entry.mobileReference ? ` - ${entry.mobileReference}` : ""}`, value: reportMoney(entry.amount) }));
  power.incomes.forEach(item => details.push({ section: "INCOME", name: item.name, detail: "Monthly source", value: reportMoney(item.amount) }));
  power.budgets.forEach(item => details.push({ section: "BUDGET", name: item.name, detail: `${item.category} - planned`, value: reportMoney(item.amount) }));
  reportSpending.forEach(item => details.push({ section: "SPENDING", name: item.name, detail: `${item.category} - ${item.month || getReportMonth()}`, value: reportMoney(item.amount) }));
  quests.forEach(item => details.push({ section: "QUEST", name: item.name, detail: `${questProgress(item)}% complete`, value: `${reportMoney(item.current)} / ${reportMoney(item.target)}` }));
  if (!details.length) details.push({ section: "READY", name: "No financial entries yet", detail: "Add accounts or a monthly plan to populate this report.", value: "-" });

  const detailChunks = [];
  for (let index = 0; index < details.length; index += 27) detailChunks.push(details.slice(index, index + 27));
  const pageCount = 1 + detailChunks.length;
  drawOverview(pageCount);
  const allStreams = [streams[0]];
  detailChunks.forEach((chunk, index) => {
    streams.push("");
    drawDetailPage(index + 2, pageCount, chunk);
    allStreams.push(streams[streams.length - 1]);
  });

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${allStreams.map((_, index) => `${6 + index * 2} 0 R`).join(" ")}] /Count ${allStreams.length} >>`,
    "<< /Font << /F1 4 0 R /F2 5 0 R >> >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
  ];
  allStreams.forEach((stream, index) => {
    const pageObject = 6 + index * 2;
    const contentObject = pageObject + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources 3 0 R /Contents ${contentObject} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  });
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  saveFile("netraos-financial-report.pdf", pdf, "application/pdf");
  showToast("Professional financial report downloaded.");
}

// Menu actions
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

// Page controls and dashboard actions
navItems.forEach(item => {
  item.addEventListener("click", () => showPage(item.dataset.page));
});

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
      error.hidden = false;
    };
    if (!email.includes("@") || password.length < 8) {
      fail("Enter a valid email and a password with at least 8 characters.");
      return;
    }

    if (form.dataset.authForm === "signup") {
      const name = String(formData.get("name") || "").trim();
      if (name.length < 2) {
        fail("Enter your name to create a profile.");
        return;
      }
      const currentProfile = getStoredProfile();
      if (currentProfile && String(currentProfile.email || "").toLowerCase() !== email) {
        fail("This browser already has a local profile. Log in with its email instead.");
        return;
      }
      const profile = { name, email };
      try {
        saveStoredProfile(profile);
      } catch {
        fail("Unable to save a local profile. Check browser storage settings.");
        return;
      }
      enterApp(profile);
      return;
    }

    const profile = getStoredProfile();
    if (!profile || String(profile.email || "").toLowerCase() !== email) {
      fail("No local profile matches that email. Create an account in this browser first.");
      return;
    }
    enterApp(profile);
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
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim().toLowerCase(),
      sex: String(formData.get("sex") || ""),
      dateOfBirth: String(formData.get("dateOfBirth") || ""),
      image
    };
    if (profile.name.length < 2 || !profile.email.includes("@") || (profile.dateOfBirth && profile.dateOfBirth > localDateValue())) {
      showToast(profile.dateOfBirth > localDateValue()
        ? "Date of birth cannot be in the future."
        : "Enter a name and valid email address.");
      return;
    }
    try {
      saveStoredProfile(profile);
      setProfileName(profile.name);
      applyProfileAvatar();
      if (profilePreviewUrl) URL.revokeObjectURL(profilePreviewUrl);
      profilePreviewUrl = "";
      showPage("Profile");
      showToast("Profile saved in this browser.");
    } catch {
      showToast("Unable to save the profile.");
    }
  }

  if (form.matches("[data-account-form='settings']")) {
    event.preventDefault();
    const formData = new FormData(form);
    const settings = {
      alwaysShowCents: formData.has("alwaysShowCents"),
      reduceMotion: formData.has("reduceMotion"),
      darkMode: formData.has("darkMode"),
      goalNotifications: formData.has("goalNotifications"),
      monthlyReminders: formData.has("monthlyReminders")
    };
    try {
      localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
      applyStoredSettings();
      showToast("Settings saved.");
    } catch {
      showToast("Unable to save settings in browser storage.");
    }
  }
});

document.addEventListener("click", event => {
  const target = event.target;
  const themeToggle = target.closest("[data-theme-toggle]");
  if (themeToggle) {
    const settings = getStoredSettings();
    settings.darkMode = !settings.darkMode;
    appShell.classList.toggle("theme-dark", settings.darkMode);
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
    if (action === "signup" || action === "login" || action === "landing") {
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
  if (button.matches(".date-select")) {
    openMenu(button, getRecentNavigationMonths());
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
  if (button.matches("[data-delete-power-item]")) {
    const data = getPowerUpData();
    const list = button.dataset.deletePowerItem === "income"
      ? "incomes"
      : button.dataset.deletePowerItem === "spending" ? "spending" : "budgets";
    const updated = data[list].filter(item => item.id !== button.dataset.itemId);
    data[list] = updated;
    try {
      savePowerUpData(data);
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
      { label: profile?.name || "Your profile", action: "profile" },
      { label: "Settings", action: "settings" },
      { label: "Sign out", action: "sign-out" }
    ]);
    return;
  }
  if (button.matches(".activity-link")) {
    showToast("Activity history will appear when an account is connected.");
    return;
  }
  if (button.matches(".empty-action")) {
    showToast("This section is ready for your financial data.");
    return;
  }
});

document.addEventListener("change", event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.name !== "photo") return;
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

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closePopover();
});

updateDateSwitcher();
initializePrivacyMode();
const initialPage = decodeURIComponent(window.location.hash.slice(1));
updateDashboardInventorySummary();
updateDashboardPowerUpSummary();
updateDashboardQuests();
updateCurrencySwitcher();
applyStoredSettings();
updateSavingsProjection();
let hasLocalSession = false;
try {
  hasLocalSession = localStorage.getItem(sessionStorageKey) === "active" && Boolean(getStoredProfile());
} catch {
  hasLocalSession = false;
}
if (hasLocalSession) {
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
} else {
  showPublicPage(initialPage === "login" || initialPage === "signup" ? initialPage : "landing");
}
