// Supabase Auth and private per-user synchronization for the NetraOS local-first app.
(() => {
  const client = window.netraosSupabaseClient;
  const table = "netraos_user_data";
  const consentKey = "netraos-cloud-sync-consent-v1";
  const skippedKeys = new Set(["netraos-local-session-v1", "netraos-autolock-nudge-shown"]);
  let userId = null;
  let syncEnabled = false;
  let bridgeInstalled = false;
  let suppressWrites = false;
  const pendingWrites = new Map();
  let errorNoticeShown = false;

  const syncable = key => typeof key === "string" && key.startsWith("netraos-") && !skippedKeys.has(key);
  const localSnapshot = () => {
    const entries = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!syncable(key)) continue;
      const raw = localStorage.getItem(key);
      try { entries.push({ storage_key: key, value: JSON.parse(raw) }); }
      catch { entries.push({ storage_key: key, value: raw }); }
    }
    return entries;
  };

  async function writeRemote(storageKey, value) {
    if (!client || !userId || !syncEnabled || !syncable(storageKey)) return;
    const { error } = await client.from(table).upsert(
      { user_id: userId, storage_key: storageKey, value },
      { onConflict: "user_id,storage_key" }
    );
    if (error) throw error;
  }

  function queueWrite(storageKey, rawValue) {
    if (!userId || !syncEnabled || !syncable(storageKey) || suppressWrites) return;
    let value;
    try { value = JSON.parse(rawValue); } catch { value = rawValue; }
    const previous = pendingWrites.get(storageKey);
    if (previous) clearTimeout(previous.timer);
    const timer = setTimeout(async () => {
      pendingWrites.delete(storageKey);
      try { await writeRemote(storageKey, value); }
      catch (error) {
        if (!errorNoticeShown) {
          errorNoticeShown = true;
          window.showToast?.("Cloud sync paused. Your changes remain saved on this device.");
          console.error("NetraOS Supabase sync failed", error);
        }
      }
    }, 350);
    pendingWrites.set(storageKey, { timer, value });
  }

  async function flushWrites() {
    const writes = [...pendingWrites.entries()];
    for (const [key, pending] of writes) {
      clearTimeout(pending.timer);
      pendingWrites.delete(key);
      await writeRemote(key, pending.value);
    }
  }

  function installStorageBridge() {
    if (bridgeInstalled) return;
    bridgeInstalled = true;
    const originalSet = Storage.prototype.setItem;
    const originalRemove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function(key, value) {
      originalSet.call(this, key, value);
      if (this === window.localStorage) queueWrite(String(key), String(value));
    };
    Storage.prototype.removeItem = function(key) {
      originalRemove.call(this, key);
      if (this === window.localStorage && userId && syncEnabled && syncable(String(key)) && !suppressWrites) {
        client.from(table).delete().eq("user_id", userId).eq("storage_key", String(key))
          .then(({ error }) => { if (error) throw error; })
          .catch(error => console.error("NetraOS Supabase delete failed", error));
      }
    };
  }

  async function uploadSnapshot(entries, id) {
    const rows = entries.filter(row => row.storage_key !== consentKey).map(row => ({
      user_id: id, storage_key: row.storage_key, value: row.value
    }));
    for (let offset = 0; offset < rows.length; offset += 100) {
      const { error } = await client.from(table).upsert(rows.slice(offset, offset + 100), { onConflict: "user_id,storage_key" });
      if (error) throw error;
    }
  }

  async function markConsent(id) {
    const { error } = await client.from(table).upsert({
      user_id: id, storage_key: consentKey, value: { accepted_at: new Date().toISOString(), version: 1 }
    }, { onConflict: "user_id,storage_key" });
    if (error) throw error;
  }

  async function beginSession(user) {
    if (!client || !user?.id) throw new Error("Supabase is not configured or the session is missing.");
    syncEnabled = false;
    userId = user.id;
    const { data: rows, error } = await client.from(table).select("storage_key,value").eq("user_id", userId);
    if (error) throw error;
    let local = localSnapshot();
    const localProfile = local.find(row => row.storage_key === "netraos-profile-v1")?.value;
    const emailMismatch = localProfile?.email && user.email && localProfile.email.toLowerCase() !== user.email.toLowerCase();
    if (emailMismatch && local.some(row => !["netraos-profile-v1", consentKey].includes(row.storage_key))) {
      if (!window.confirm(
        `This browser has NetraOS data for ${localProfile.email}, while you signed in as ${user.email}. Download a backup first if you need it. Continue to clear that browser data and open this Supabase account's workspace?`
      )) throw new Error("Sign-in cancelled so this browser's local data stays unchanged.");
      local.filter(row => row.storage_key !== consentKey).forEach(row => localStorage.removeItem(row.storage_key));
      local = localSnapshot();
    }
    const hasLocalRecords = local.some(row => !["netraos-profile-v1", consentKey].includes(row.storage_key));

    const consent = rows.find(row => row.storage_key === consentKey);
    let hydrateRemote = Boolean(consent);
    if (!consent) {
      if (hasLocalRecords) {
        const approved = window.confirm(
          `Upload the NetraOS information currently saved in this browser to your Supabase account (${user.email})? This includes financial records, profile details, and preferences. Supabase will store it under your account with row-level access controls. Choose Cancel to keep using this browser without cloud sync.`
        );
        if (!approved) return { syncEnabled: false, userId };
        await uploadSnapshot(local, userId);
      } else if (rows.length) {
        const approved = window.confirm(
          `Use the NetraOS records already stored in your Supabase account (${user.email}) and save future changes there?`
        );
        if (!approved) return { syncEnabled: false, userId };
        hydrateRemote = true;
      }
      await markConsent(userId);
    }

    suppressWrites = true;
    try {
      const remoteKeys = new Set(rows.map(row => row.storage_key));
      if (hydrateRemote) {
        local.forEach(row => {
          if (!remoteKeys.has(row.storage_key)) localStorage.removeItem(row.storage_key);
        });
        rows.forEach(row => {
          if (row.storage_key !== consentKey) localStorage.setItem(row.storage_key, JSON.stringify(row.value));
        });
      }
    } finally {
      suppressWrites = false;
    }
    syncEnabled = true;
    errorNoticeShown = false;
    installStorageBridge();
    return { syncEnabled, userId };
  }

  async function deleteUserData() {
    if (!client || !userId) return;
    await flushWrites();
    syncEnabled = false;
    const { error } = await client.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }

  async function signOut() {
    await flushWrites();
    const { error } = await client.auth.signOut();
    if (error) throw error;
    syncEnabled = false;
    userId = null;
  }

  window.NetraOSCloud = {
    client,
    beginSession,
    deleteUserData,
    signOut,
    flushWrites,
    isConfigured: Boolean(client),
    get syncEnabled() { return syncEnabled; },
    get userId() { return userId; }
  };
})();
