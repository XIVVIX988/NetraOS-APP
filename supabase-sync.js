/* Supabase Auth + local-first synchronization for the NetraOS browser app. */
(() => {
  const config = window.NETRAOS_SUPABASE_CONFIG;
  const sdk = window.supabase;
  if (!config?.url || !config?.publishableKey || !sdk?.createClient) {
    window.NetraSupabase = { enabled: false, error: "Supabase configuration or SDK did not load." };
    return;
  }

  // Discard refresh tokens persisted by earlier builds that silently restored sessions.
  try {
    const projectRef = new URL(config.url).hostname.split(".")[0];
    localStorage.removeItem(`sb-${projectRef}-auth-token`);
  } catch { /* Session persistence is disabled below even if storage is unavailable. */ }

  const client = sdk.createClient(config.url, config.publishableKey, {
    // Keep auth in memory for this app run so a new launch always asks for credentials.
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const confirmationRedirectUrl = () => {
    const url = new URL(config.authRedirectUrl || `${location.origin}${location.pathname}`, location.href);
    url.searchParams.set("auth", "confirm");
    return url.toString();
  };
  const passwordRecoveryRedirectUrl = () => {
    const url = new URL(config.authRedirectUrl || `${location.origin}${location.pathname}`, location.href);
    url.searchParams.set("auth", "recovery");
    url.hash = "";
    return url.toString();
  };
  const keys = {
    profile: "netraos-profile-v1", settings: "netraos-settings-v1", inventory: "netraos-inventory-v1",
    power: "netraos-powerup-v1", quests: "netraos-quests-v1", achievements: "netraos-achievements-v1",
    currency: "netraos-currency-v1", tax: "netraos-tax-v1", audit: "netraos-security-audit-v1",
    consent: "netraos-cookie-consent-v1"
  };
  const local = key => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const baselineKey = (userId, table) => `netraos-sync-baseline-v1-${userId}-${table}`;
  const readBaseline = (userId, table, column = "id") => {
    try { return new Set(JSON.parse(localStorage.getItem(baselineKey(userId, table)) || "[]").map(String)); } catch { return new Set(); }
  };
  const saveBaseline = (userId, table, rows, column = "id") => {
    localStorage.setItem(baselineKey(userId, table), JSON.stringify(rows.map(row => String(row[column]))));
  };
  const now = () => new Date().toISOString();
  const currentUser = async () => (await client.auth.getSession()).data.session?.user || null;
  let syncTimer = 0;
  let syncing = false;
  let pendingSync = false;
  let wipingCloudData = false;
  let syncCycle = Promise.resolve();
  let realtime = null;
  let applyingRemote = false;
  let dirtyLocal = false;
  let lastSyncErrorNotice = 0;
  const PAGE_SIZE = 1000;

  function reportSyncError(error) {
    console.warn("NetraOS sync will retry:", error?.message || error);
    if (Date.now() - lastSyncErrorNotice > 60000) {
      lastSyncErrorNotice = Date.now();
      window.dispatchEvent(new CustomEvent("netraos-sync-error"));
    }
  }

  const present = (rows, userId) => rows.map(row => ({ ...row, user_id: userId, updated_at: now(), deleted_at: null }));

  async function upsertRows(table, rows, userId, currentIds) {
    const { data: oldRows, error: readError } = await client.from(table).select("*").eq("user_id", userId).is("deleted_at", null);
    if (readError) throw readError;
    const baseline = readBaseline(userId, table);
    const keep = new Set(currentIds.map(String));
    // Preserve records created by another device since our last pull. For an
    // ID present on both devices, the latest successful upsert wins.
    const concurrentRows = (oldRows || []).filter(row => !baseline.has(String(row.id)) && !keep.has(String(row.id)));
    if (concurrentRows.length) {
      const recover = row => row.details || (table === "entries"
        ? { id: row.id, type: row.type, name: row.name, category: row.category, amount: Number(row.amount), notes: row.notes, mobileType: row.mobile_money_type || "", mobileReference: row.mobile_money_reference || "" }
        : table === "goals"
          ? { id: row.id, name: row.name, current: Number(row.current_amount), target: Number(row.target_amount), category: row.category, tier: row.tier, deadline: row.deadline, startAmount: Number(row.start_amount) }
          : table === "audit_log" ? { action: row.action, at: row.occurred_at }
            : { id: row.id, name: row.name, amount: Number(row.amount), category: row.category, notes: row.notes, month: row.month });
      if (table === "entries") write(keys.inventory, [...(local(keys.inventory) || []), ...concurrentRows.map(recover)]);
      else if (table === "goals") write(keys.quests, [...(local(keys.quests) || []), ...concurrentRows.map(recover)]);
      else if (table === "audit_log") write(keys.audit, [...(local(keys.audit) || []), ...concurrentRows.map(recover)].slice(-500));
      else if (["incomes", "budget_lines", "spending"].includes(table)) {
        const power = local(keys.power) || { incomes: [], budgets: [], spending: [] };
        const field = { incomes: "incomes", budget_lines: "budgets", spending: "spending" }[table];
        power[field] = [...(power[field] || []), ...concurrentRows.map(recover)];
        write(keys.power, power);
      }
    }
    const payload = present([...rows, ...concurrentRows], userId);
    if (payload.length) {
      const { error } = await client.from(table).upsert(payload, { onConflict: "user_id,id" });
      if (error) throw error;
    }
    const stale = (oldRows || []).map(row => String(row.id)).filter(id => baseline.has(id) && !keep.has(id));
    if (stale.length) {
      const { error } = await client.from(table).update({ deleted_at: now(), updated_at: now() }).eq("user_id", userId).in("id", stale);
      if (error) throw error;
    }
    saveBaseline(userId, table, [...payload, ...((oldRows || []).filter(row => !stale.includes(String(row.id))))]);
  }

  async function pushSnapshot(profileOverride) {
    if (wipingCloudData) return false;
    if (syncing) { pendingSync = true; return syncCycle; }
    const user = await currentUser();
    if (wipingCloudData) return false;
    if (!user) return;
    syncing = true;
    let finishCycle;
    syncCycle = new Promise(resolve => { finishCycle = resolve; });
    try {
      const profile = profileOverride || local(keys.profile) || {};
      const profileRow = {
        user_id: user.id, name: profile.name || user.user_metadata?.full_name || "", email: user.email || profile.email || "",
        username: profile.username || "", sex: profile.sex || null, date_of_birth: profile.dateOfBirth || null,
        avatar_data: profile.image || null, terms_version: profile.termsVersion || user.user_metadata?.terms_version || null,
        terms_accepted_at: profile.termsAcceptedAt || user.user_metadata?.terms_accepted_at || null, updated_at: now(), deleted_at: null
      };
      let result = await client.from("user_profiles").upsert(profileRow, { onConflict: "user_id" });
      if (result.error) throw result.error;

      const settings = { ...(local(keys.settings) || {}) };
      delete settings.localPinSalt; delete settings.localPinHash; delete settings.localPinLength;
      result = await client.from("user_settings").upsert({ user_id: user.id, settings, updated_at: now(), deleted_at: null }, { onConflict: "user_id" });
      if (result.error) throw result.error;

      const inventory = Array.isArray(local(keys.inventory)) ? local(keys.inventory) : [];
      const entryRows = inventory.map(item => ({
        id: String(item.id), type: item.type === "liability" ? "liability" : "asset", name: item.name || "", category: item.category || "",
        amount: Number(item.amount || 0), notes: item.notes || "", mobile_money_type: item.mobileType || null,
        mobile_money_reference: item.mobileReference || null, details: item, created_at: item.createdAt || now()
      }));
      await upsertRows("entries", entryRows, user.id, entryRows.map(row => row.id));

      const plan = local(keys.power) || { incomes: [], budgets: [], spending: [] };
      const toRows = (items = []) => (Array.isArray(items) ? items : []).map(item => ({ id: String(item.id), name: item.name || "", amount: Number(item.amount || 0), notes: item.notes || "", category: item.category || "", month: item.month || "", details: item, created_at: item.createdAt || now() }));
      const incomeRows = toRows(plan.incomes), budgetRows = toRows(plan.budgets), spendingRows = toRows(plan.spending);
      await upsertRows("incomes", incomeRows, user.id, incomeRows.map(row => row.id));
      await upsertRows("budget_lines", budgetRows, user.id, budgetRows.map(row => row.id));
      await upsertRows("spending", spendingRows, user.id, spendingRows.map(row => row.id));

      const goals = (Array.isArray(local(keys.quests)) ? local(keys.quests) : []).map(item => ({
        id: String(item.id), name: item.name || "", current_amount: Number(item.current || 0), target_amount: Number(item.target || 0),
        category: item.category || null, tier: item.tier || null, deadline: item.deadline || null, start_amount: Number(item.startAmount || 0), details: item, created_at: item.createdAt || now()
      }));
      await upsertRows("goals", goals, user.id, goals.map(row => row.id));

      const badgeRows = (Array.isArray(local(keys.achievements)) ? local(keys.achievements) : []).map(badgeId => ({ badge_id: String(badgeId), user_id: user.id, updated_at: now(), deleted_at: null }));
      const { data: oldBadges, error: badgeReadError } = await client.from("achievements").select("badge_id").eq("user_id", user.id).is("deleted_at", null);
      if (badgeReadError) throw badgeReadError;
      const badgeBaseline = readBaseline(user.id, "achievements", "badge_id");
      const badgeSet = new Set(badgeRows.map(row => String(row.badge_id)));
      const newRemoteBadges = (oldBadges || []).filter(row => !badgeBaseline.has(String(row.badge_id)) && !badgeSet.has(String(row.badge_id)));
      if (badgeRows.length || newRemoteBadges.length) { const { error } = await client.from("achievements").upsert([...badgeRows, ...newRemoteBadges.map(row => ({ ...row, user_id: user.id, updated_at: now(), deleted_at: null }))], { onConflict: "user_id,badge_id" }); if (error) throw error; }
      if (newRemoteBadges.length) write(keys.achievements, [...new Set([...(local(keys.achievements) || []), ...newRemoteBadges.map(row => row.badge_id)])]);
      const staleBadges = (oldBadges || []).map(row => String(row.badge_id)).filter(id => badgeBaseline.has(id) && !badgeSet.has(id));
      if (staleBadges.length) { const { error } = await client.from("achievements").update({ deleted_at: now(), updated_at: now() }).eq("user_id", user.id).in("badge_id", staleBadges); if (error) throw error; }
      saveBaseline(user.id, "achievements", [...badgeRows, ...newRemoteBadges.filter(row => !staleBadges.includes(String(row.badge_id)))], "badge_id");

      const currency = local(keys.currency) || { active: "KES", rates: { KES: 1 } };
      const rateRows = Object.entries(currency.rates || { KES: 1 }).filter(([, rate]) => Number(rate) > 0).map(([currency_code, rate_value]) => ({ currency_code, rate_value: Number(rate_value), is_active: currency_code === currency.active, user_id: user.id, updated_at: now(), deleted_at: null }));
      const { data: oldRates, error: ratesReadError } = await client.from("currency_rates").select("*").eq("user_id", user.id).is("deleted_at", null);
      if (ratesReadError) throw ratesReadError;
      const rateBaseline = readBaseline(user.id, "currency_rates", "currency_code");
      const rateSet = new Set(rateRows.map(row => String(row.currency_code)));
      const newRemoteRates = (oldRates || []).filter(row => !rateBaseline.has(String(row.currency_code)) && !rateSet.has(String(row.currency_code)));
      if (rateRows.length || newRemoteRates.length) { const { error } = await client.from("currency_rates").upsert([...rateRows, ...newRemoteRates.map(row => ({ ...row, updated_at: now(), deleted_at: null }))], { onConflict: "user_id,currency_code" }); if (error) throw error; }
      const staleRates = (oldRates || []).map(row => String(row.currency_code)).filter(code => rateBaseline.has(code) && !rateSet.has(code));
      if (staleRates.length) { const { error } = await client.from("currency_rates").update({ deleted_at: now(), updated_at: now() }).eq("user_id", user.id).in("currency_code", staleRates); if (error) throw error; }
      saveBaseline(user.id, "currency_rates", [...rateRows, ...newRemoteRates.filter(row => !staleRates.includes(String(row.currency_code)))], "currency_code");
      if (newRemoteRates.length) {
        const localCurrency = local(keys.currency) || { active: "KES", rates: { KES: 1 } };
        localCurrency.rates ||= { KES: 1 };
        for (const remoteRate of newRemoteRates) if (!localCurrency.rates?.[remoteRate.currency_code]) localCurrency.rates[remoteRate.currency_code] = Number(remoteRate.rate_value);
        write(keys.currency, localCurrency);
      }

      const tax = local(keys.tax) || { mode: "gross", value: 0 };
      result = await client.from("tax_profile").upsert({ user_id: user.id, mode: tax.mode === "net" ? "net" : "gross", value: Number(tax.value || 0), details: tax, updated_at: now(), deleted_at: null }, { onConflict: "user_id" });
      if (result.error) throw result.error;

      const audit = Array.isArray(local(keys.audit)) ? local(keys.audit) : [];
      const auditRows = audit.map(item => ({ id: `${item.at || ""}|${item.action || ""}`, user_id: user.id, action: String(item.action || "Activity"), occurred_at: item.at || now(), updated_at: now(), deleted_at: null }));
      await upsertRows("audit_log", auditRows, user.id, auditRows.map(row => row.id));

      const consent = local(keys.consent);
      if (consent) {
        result = await client.from("consents").upsert({ user_id: user.id, necessary: true, analytics: Boolean(consent.analytics), saved_at: consent.savedAt || null, updated_at: now(), deleted_at: null }, { onConflict: "user_id" });
        if (result.error) throw result.error;
      }
      dirtyLocal = false;
      return true;
    } finally {
      syncing = false;
      finishCycle();
      if (pendingSync && !wipingCloudData) { pendingSync = false; schedulePush(); }
    }
  }

  async function pullSnapshot() {
    const user = await currentUser();
    if (!user) throw new Error("Sign in is required to sync this account.");
    const tables = ["user_profiles", "user_settings", "entries", "incomes", "budget_lines", "spending", "goals", "achievements", "currency_rates", "tax_profile", "audit_log", "consents"];
    const readTable = async table => {
      const rows = [];
      const orderColumn = ({ achievements: "badge_id", currency_rates: "currency_code" })[table]
        || (["user_profiles", "user_settings", "tax_profile", "consents"].includes(table) ? "" : "id");
      for (let from = 0; ; from += PAGE_SIZE) {
        let query = client.from(table).select("*").eq("user_id", user.id).is("deleted_at", null);
        if (orderColumn) query = query.order(orderColumn, { ascending: true });
        const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < PAGE_SIZE) return rows;
      }
    };
    const data = Object.fromEntries(await Promise.all(tables.map(async table => [table, await readTable(table)])));
    const hasData = data.user_settings.length + data.entries.length + data.incomes.length + data.budget_lines.length + data.spending.length + data.goals.length + data.achievements.length + data.currency_rates.length + data.tax_profile.length > 0;
    const cloudProfile = data.user_profiles[0];
    for (const table of ["entries", "incomes", "budget_lines", "spending", "goals", "audit_log"]) saveBaseline(user.id, table, data[table]);
    saveBaseline(user.id, "achievements", data.achievements, "badge_id");
    saveBaseline(user.id, "currency_rates", data.currency_rates, "currency_code");
    applyingRemote = true;
    try {
      const oldProfile = { ...(local(keys.profile) || {}) };
      delete oldProfile.passwordHash;
      delete oldProfile.passwordSalt;
      delete oldProfile.passwordIterations;
      write(keys.profile, cloudProfile
        ? { ...oldProfile, name: cloudProfile.name, email: cloudProfile.email, username: cloudProfile.username, sex: cloudProfile.sex || "", dateOfBirth: cloudProfile.date_of_birth || "", image: cloudProfile.avatar_data || "", termsVersion: cloudProfile.terms_version || "", termsAcceptedAt: cloudProfile.terms_accepted_at || "" }
        : { name: user.user_metadata?.full_name || "", email: user.email || "", username: "", termsVersion: user.user_metadata?.terms_version || "", termsAcceptedAt: user.user_metadata?.terms_accepted_at || "" });
      const localSettings = local(keys.settings) || {};
      const cloudSettings = data.user_settings[0]?.settings || {};
      write(keys.settings, { ...cloudSettings, localPinSalt: localSettings.localPinSalt || "", localPinHash: localSettings.localPinHash || "", localPinLength: localSettings.localPinLength || 4 });
      write(keys.inventory, data.entries.map(row => row.details || { id: row.id, type: row.type, name: row.name, category: row.category, amount: Number(row.amount), notes: row.notes, mobileType: row.mobile_money_type || "", mobileReference: row.mobile_money_reference || "" }));
      const restoreRows = rows => rows.map(row => row.details || { id: row.id, name: row.name, amount: Number(row.amount), notes: row.notes, category: row.category, month: row.month });
      write(keys.power, { incomes: restoreRows(data.incomes), budgets: restoreRows(data.budget_lines), spending: restoreRows(data.spending) });
      write(keys.quests, data.goals.map(row => row.details || { id: row.id, name: row.name, current: Number(row.current_amount), target: Number(row.target_amount), category: row.category, tier: row.tier, deadline: row.deadline, startAmount: Number(row.start_amount) }));
      write(keys.achievements, data.achievements.map(row => row.badge_id));
      write(keys.currency, data.currency_rates.length ? { active: data.currency_rates.find(row => row.is_active)?.currency_code || "KES", rates: Object.fromEntries(data.currency_rates.map(row => [row.currency_code, Number(row.rate_value)])) } : { active: "KES", rates: { KES: 1 } });
      write(keys.tax, data.tax_profile[0]?.details || { mode: "gross", value: 0 });
      write(keys.audit, data.audit_log.map(row => ({ action: row.action, at: row.occurred_at })).slice(-500));
      if (data.consents[0]) write(keys.consent, { necessary: data.consents[0].necessary, analytics: data.consents[0].analytics, savedAt: data.consents[0].saved_at });
      else localStorage.removeItem(keys.consent);
    } finally { applyingRemote = false; }
    return { hasData, hasProfile: Boolean(cloudProfile), profile: cloudProfile ? { name: cloudProfile.name, email: cloudProfile.email, username: cloudProfile.username, sex: cloudProfile.sex || "", dateOfBirth: cloudProfile.date_of_birth || "", image: cloudProfile.avatar_data || "", termsVersion: cloudProfile.terms_version || "", termsAcceptedAt: cloudProfile.terms_accepted_at || "" } : { name: user.user_metadata?.full_name || "", email: user.email || "", username: "", termsVersion: user.user_metadata?.terms_version || "", termsAcceptedAt: user.user_metadata?.terms_accepted_at || "" } };
  }

  function schedulePush() {
    dirtyLocal = true;
    if (wipingCloudData) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => pushSnapshot().catch(reportSyncError), 700);
  }

  function hasLocalRecords() {
    return Boolean((local(keys.inventory) || []).length || (local(keys.power)?.incomes || []).length || (local(keys.power)?.budgets || []).length || (local(keys.power)?.spending || []).length || (local(keys.quests) || []).length);
  }

  window.NetraSupabase = {
    enabled: true, client,
    signUp: (email, password, metadata) => client.auth.signUp({ email, password, options: { data: metadata, emailRedirectTo: confirmationRedirectUrl() } }),
    signIn: (email, password) => client.auth.signInWithPassword({ email, password }),
    resetPassword: email => client.auth.resetPasswordForEmail(email, { redirectTo: passwordRecoveryRedirectUrl() }),
    updatePassword: password => client.auth.updateUser({ password }),
    signOut: options => client.auth.signOut(options),
    getSession: () => client.auth.getSession(), getUser: currentUser,
    bootstrap: async () => {
      const user = await currentUser();
      if (!user) return null;
      const localCandidate = local(keys.profile);
      const localProfile = localCandidate?.email?.toLowerCase() === (user.email || "").toLowerCase() ? localCandidate : null;
      const localHasData = hasLocalRecords();
      const backupKey = `netraos-migration-backup-${user.id}`;
      const priorBackup = local(backupKey);
      const cachedLocal = Object.fromEntries([keys.inventory, keys.power, keys.quests, keys.achievements, keys.settings, keys.currency, keys.tax, keys.audit, keys.consent].map(key => [key, local(key)]));
      let snapshot;
      try { snapshot = await pullSnapshot(); }
      catch (error) {
        const fallback = localProfile || { name: user.user_metadata?.full_name || "", email: user.email || "", username: "" };
        delete fallback.passwordHash; delete fallback.passwordSalt; delete fallback.passwordIterations;
        if (navigator.onLine) throw error;
        window.dispatchEvent(new CustomEvent("netraos-sync-error"));
        return { ...fallback, id: user.id, email: user.email || fallback.email };
      }
      const migration = priorBackup || (!snapshot.hasData && localHasData ? cachedLocal : null);
      if (migration) {
        write(backupKey, migration);
        if (window.confirm("Upload the records already saved in this browser to your NetraOS account? A local backup will be kept until the upload succeeds.")) {
          Object.entries(migration).forEach(([key, value]) => { if (value !== null) write(key, value); });
          await pushSnapshot(localProfile || { name: user.user_metadata?.full_name || "", email: user.email || "", username: "", termsVersion: user.user_metadata?.terms_version || "", termsAcceptedAt: user.user_metadata?.terms_accepted_at || "" });
          localStorage.removeItem(backupKey);
        } else if (!snapshot.hasData) {
          write(keys.inventory, []); write(keys.power, { incomes: [], budgets: [], spending: [] }); write(keys.quests, []); write(keys.achievements, []);
        }
      } else if (!snapshot.hasData && localProfile) {
        await pushSnapshot(localProfile);
      }
      if (!window.__netraSyncInterval) {
        window.__netraSyncInterval = window.setInterval(async () => {
          if (!navigator.onLine || syncing) return;
          try {
            if (dirtyLocal) await pushSnapshot();
            else if (await currentUser()) {
              await pullSnapshot();
              window.dispatchEvent(new CustomEvent("netraos-cloud-refresh"));
            }
          } catch (error) { reportSyncError(error); }
        }, 30000);
      }
      const activeProfile = snapshot.hasProfile
        ? { ...(local(keys.profile) || {}), ...snapshot.profile, id: user.id, email: user.email || snapshot.profile.email }
        : { ...snapshot.profile, ...(localProfile || {}), id: user.id, email: user.email || snapshot.profile.email };
      delete activeProfile.passwordHash;
      delete activeProfile.passwordSalt;
      delete activeProfile.passwordIterations;
      write(keys.profile, activeProfile);
      return activeProfile;
    },
    saveProfile: async profile => { write(keys.profile, profile); await pushSnapshot(profile); },
    deleteCloudData: async () => {
      const user = await currentUser();
      if (!user) throw new Error("Sign in to clear synced account data.");
      wipingCloudData = true;
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = 0;
      pendingSync = false;
      try {
        await syncCycle;
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = 0;
        pendingSync = false;
        const { error } = await client.rpc("wipe_my_data");
        if (error) throw error;
        dirtyLocal = false;
        await client.auth.signOut({ scope: "local" });
      } catch (error) {
        wipingCloudData = false;
        if (dirtyLocal) schedulePush();
        throw error;
      } finally {
        wipingCloudData = false;
      }
    },
    setPin: async pin => {
      const { error } = await client.rpc("set_pin", { p_pin: pin });
      if (error && (error.code === "PGRST202" || /function .*set_pin.*not found|could not find the function/i.test(error.message || ""))) return false;
      if (error) throw error;
      return true;
    },
    clearPin: async () => {
      const { error } = await client.rpc("clear_pin");
      if (error && (error.code === "PGRST202" || /function .*clear_pin.*not found|could not find the function/i.test(error.message || ""))) return false;
      if (error) throw error;
      return true;
    },
    verifyPin: async pin => {
      const { data, error } = await client.rpc("verify_pin", { p_pin: pin });
      if (error && (error.code === "PGRST202" || /function .*verify_pin.*not found|could not find the function/i.test(error.message || ""))) return null;
      if (error) throw error;
      return data;
    },
    syncNow: pushSnapshot
  };

  // Mirror changes locally first, then debounce a cloud write when a session is active.
  const nativeSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    nativeSetItem.call(this, key, value);
    if (this === localStorage && !applyingRemote && Object.values(keys).includes(String(key)) && window.NetraSupabase?.enabled) schedulePush();
  };
  window.addEventListener("online", () => { if (dirtyLocal) schedulePush(); });
  client.auth.onAuthStateChange((event, session) => {
    window.NETRAOS_LAST_AUTH_EVENT = event;
    window.dispatchEvent(new CustomEvent("netraos-auth-event", { detail: { event, session } }));
  });
})();
