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

const welcomeName = document.querySelector("#welcome-name");
const initialProfile = getStoredProfile();
if (initialProfile?.name) document.body.dataset.userName = initialProfile.name;
const displayName = (document.body.dataset.userName || "Jordan Davis").trim().split(/\s+/)[0];
if (welcomeName) welcomeName.textContent = displayName + ".";
let dashboardMarkup = content.innerHTML;

const assetCategories = [
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
  "Utilities",
  "Savings & investing",
  "Other"
];
const inventoryStorageKey = "netraos-inventory-v1";
const powerUpStorageKey = "netraos-powerup-v1";
const questStorageKey = "netraos-quests-v1";
const achievementStorageKey = "netraos-achievements-v1";
const reportPeriodStorageKey = "netraos-report-period-v1";

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
      goalNotifications: saved.goalNotifications !== false,
      monthlyReminders: saved.monthlyReminders !== false
    };
  } catch {
    return { alwaysShowCents: false, reduceMotion: false, goalNotifications: true, monthlyReminders: true };
  }
}

function applyStoredSettings() {
  document.body.classList.toggle("reduce-motion", getStoredSettings().reduceMotion);
}

function setProfileName(name) {
  const cleanName = String(name || "").trim() || "Jordan Davis";
  document.body.dataset.userName = cleanName;
  const firstName = cleanName.split(/\s+/)[0];
  const greeting = document.querySelector("#welcome-name");
  if (greeting) greeting.textContent = firstName + ".";
  dashboardMarkup = dashboardMarkup.replace(
    /(<em id="welcome-name">)[\s\S]*?(<\/em>)/,
    (match, opening, closing) => opening + escapeHTML(firstName) + "." + closing
  );
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
  return `<span class="public-brand-mark" aria-hidden="true"><svg viewBox="0 0 500 500"><rect width="500" height="500" rx="40" fill="#0A0A0A"/><path d="M100 250h300M250 100v300" stroke="#1F2937" stroke-width="2" stroke-dasharray="4 4"/><circle cx="250" cy="250" r="140" stroke="#1F2937" stroke-width="2" fill="none" stroke-dasharray="6 6"/><path d="M110 250Q250 120 390 250 250 380 110 250Z" fill="none" stroke="#F2F1E1" stroke-width="12"/><circle cx="250" cy="250" r="65" fill="none" stroke="#E3B74B" stroke-width="10"/><path d="m220 270 30-40 30 40" stroke="#E3B74B" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="250" cy="250" r="16" fill="#F2F1E1"/></svg></span>`;
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
          <nav class="public-nav" aria-label="Public navigation"><div class="landing-nav-links"><a class="landing-nav-current" href="#home">Home</a><a href="#features">Features</a><a href="#about">About</a></div><button type="button" data-public-action="login">Log in</button><button class="public-nav-cta" type="button" data-public-action="signup">Open NetraOS <span>↗</span></button></nav>
        </header>
        <main>
          <section class="landing-hero landing-hero-v2">
            <div class="landing-copy landing-copy-v2">
              <div class="landing-eyebrow"><i></i> YOUR FINANCES, WORKING AS ONE</div>
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
          <section class="landing-feature-strip" id="features" aria-label="NetraOS features"><article><span>◉</span><div><strong>Inventory</strong><small>Assets, liabilities, net worth</small></div></article><article><span>↗</span><div><strong>Power-Up</strong><small>Income, budgets, spending</small></div></article><article><span>◎</span><div><strong>Quests</strong><small>Goals with visible progress</small></div></article><article><span>▥</span><div><strong>Stats</strong><small>Patterns that guide your plan</small></div></article></section>
          <section class="landing-deep-dive" id="about"><div class="landing-deep-copy"><div class="landing-eyebrow"><i></i> A BETTER VIEW, STEP BY STEP</div><h2>From the big picture<br>to your next move.</h2><p>Bring your financial basics together, then build from there. NetraOS keeps the essentials close without making money management feel like another job.</p><ul><li><i>✓</i> Understand what you own and owe</li><li><i>✓</i> Give monthly income a clear plan</li><li><i>✓</i> Track goals without losing sight of today</li></ul><button class="public-primary" type="button" data-public-action="signup">Build your financial picture <span>↗</span></button></div><div class="insight-collage"><article class="insight-card insight-progress"><div class="insight-card-head"><span><small>QUEST PROGRESS</small><strong>Emergency fund</strong></span><i>◈</i></div><div class="insight-progress-line"><span></span></div><div class="insight-card-foot"><small>One goal at a time</small><strong>0%</strong></div></article><article class="insight-card insight-rate"><small>SAVINGS RATE</small><strong>0<span>%</span></strong><div class="insight-sparkline"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><small>Calculated from your monthly plan</small></article><article class="insight-card insight-budget"><i>▤</i><small>MONTHLY BUDGET</small><strong>KSh 0</strong><span>Set your first budget line</span></article><article class="insight-card insight-note"><span>✳</span><p>Your plan should work for your life—not the other way around.</p></article></div></section>
          <section class="landing-bottom-cta"><div><small>START WHERE YOU ARE</small><h2>Make your next money move with clarity.</h2></div><button class="public-primary" type="button" data-public-action="signup">Open NetraOS <span>↗</span></button></section>
        </main>
        <button class="landing-back-top" type="button" aria-label="Back to top" title="Back to top">↑</button>
        <footer class="public-footer"><span>NETRAOS · YOUR FINANCIAL OPERATING SYSTEM</span><span>Kenyan shillings · KSh</span></footer>
      </div>`;
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
      <div class="quest-row" data-quest-id="${escapeHTML(quest.id)}">
        <span class="quest-icon shield">◈</span>
        <div class="quest-info">
          <div class="quest-title">
            ${escapeHTML(quest.name)}
            ${dashboard ? "" : `<span class="quest-xp">${progress === 100 ? "COMPLETE" : "ACTIVE"}</span>`}
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
}

function formatKsh(amount) {
  const alwaysShowCents = getStoredSettings().alwaysShowCents;
  return "KSh " + Number(amount || 0).toLocaleString("en-KE", {
    minimumFractionDigits: alwaysShowCents ? 2 : 0,
    maximumFractionDigits: 2
  });
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
            <small>${escapeHTML(entry.category)} · ${entry.type === "asset" ? "Asset" : "Liability"}</small>
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
    { label: "Cash", categories: ["Cash & savings"] },
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
  if (periodButton) periodButton.innerHTML = `${getReportPeriod()} <span>⌄</span>`;
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
  }

  refreshCategories();
  typeSelect?.addEventListener("change", refreshCategories);
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
    showToast(quest ? "Quest progress updated." : `${name} added to your quests.`);
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  dialog.querySelector('input[name="name"]').focus();
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

// Generate a small single-page PDF without an external library.
function downloadPDF() {
  const rows = collectDashboardRows();
  const ascii = value =>
    String(value)
      .normalize("NFKD")
      .replace(/[^\x20-\x7E]/g, " ")
      .replace(/\s+/g, " ");
  const escapePDF = value =>
    ascii(value)
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  let y = 748;
  let stream = "BT /F1 20 Tf 48 748 Td (NetraOS Dashboard) Tj ET\n";
  y -= 28;
  stream += `BT /F1 10 Tf 48 ${y} Td (Your Financial Operating System  |  KSh) Tj ET\n`;
  y -= 24;
  rows.slice(1).forEach(([label, value]) => {
    const line = escapePDF(label + ": " + value).slice(0, 100);
    if (y > 36) {
      stream += `BT /F1 10 Tf 48 ${y} Td (${line}) Tj ET\n`;
      y -= 18;
    }
  });
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources 4 0 R /Contents 5 0 R >>",
    "<< /Font << /F1 6 0 R >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  saveFile("netraos-dashboard.pdf", pdf, "application/pdf");
  showToast("Dashboard PDF downloaded.");
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
    if (button) button.innerHTML = `${period} <span>⌄</span>`;
    refreshFinancialPage();
    showToast(`Showing ${period.toLowerCase()} spending.`);
    return;
  }
  if (action.startsWith("date:")) {
    const date = action.slice("date:".length);
    const button = document.querySelector(".date-select");
    if (button) button.innerHTML = `${date} · KSh <span>⌄</span>`;
    showToast("Selected " + date + ".");
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
  if (target.closest(".landing-back-top")) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const menuItem = target.closest("[data-menu-choice]");
  if (menuItem) {
    handleMenuChoice(menuItem.dataset.menuChoice);
    return;
  }
  const activeMenu = document.querySelector(".action-popover");
  if (activeMenu && !activeMenu.contains(target)) closePopover();
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
    openMenu(button, [
      { label: "October 2026", action: "date:October 2026" },
      { label: "September 2026", action: "date:September 2026" },
      { label: "August 2026", action: "date:August 2026" }
    ]);
    return;
  }
  if (button.matches(".more-button")) {
    openMenu(button, [
      { label: "View details", action: "details" },
      { label: "Download PDF", action: "download-pdf" },
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
  const jump = button.closest("[data-jump]");
  if (jump) showPage(jump.dataset.jump);
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

const initialPage = decodeURIComponent(window.location.hash.slice(1));
updateDashboardInventorySummary();
updateDashboardPowerUpSummary();
updateDashboardQuests();
applyStoredSettings();
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
