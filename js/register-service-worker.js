// Preserve NetraOS's existing root worker registration and app scope.
if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
  navigator.serviceWorker.register("./service-worker.js").catch(error => console.warn("Offline app shell is unavailable:", error));
}

// Keep lifecycle helpers in this already-cached script so offline startup does
// not depend on an additional service-worker asset.
(() => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const makeIdentityManager = ({ storage, locks, cryptoObject }) => {
    if (!storage || !locks?.request) throw new Error("Safe cross-tab push coordination is unavailable.");
    const userLock = (userId, callback) => locks.request(`netraos-push-user:${userId}`, { mode: "exclusive" }, callback);
    const identityKey = userId => `netraos.push.instance.v1:${userId}`;
    const pendingKey = record => `netraos.push.pending-deactivation.v1:${record.userId}:${record.operationId}`;
    const randomId = () => {
      if (!cryptoObject?.randomUUID) throw new Error("Secure device identity generation is unavailable.");
      return cryptoObject.randomUUID();
    };
    return Object.freeze({
      withUserLock: userLock,
      withRegistrationLock: (userId, instanceId, callback) => locks.request(`netraos-push-register:${userId}:${instanceId}`, { mode: "exclusive" }, callback),
      getOrCreate: userId => userLock(userId, () => {
        const key = identityKey(userId); let value = storage.getItem(key);
        if (!UUID.test(value || "")) { value = randomId(); storage.setItem(key, value); }
        return value;
      }),
      getExisting: userId => userLock(userId, () => { const value = storage.getItem(identityKey(userId)); return UUID.test(value || "") ? value : null; }),
      clearActive: (userId, expectedId) => userLock(userId, () => { const key = identityKey(userId); if (storage.getItem(key) === expectedId) storage.removeItem(key); }),
      restoreActive: (userId, instanceId) => userLock(userId, () => {
        const key = identityKey(userId), existing = storage.getItem(key);
        if (!existing || existing === instanceId) storage.setItem(key, instanceId);
        return existing || instanceId;
      }),
      savePending: record => userLock(record.userId, () => {
        if (!record.userId || !UUID.test(record.clientInstanceId || "") || !UUID.test(record.operationId || "")) throw new Error("Invalid push deactivation record.");
        const safe = { userId: record.userId, clientInstanceId: record.clientInstanceId, operationId: record.operationId };
        storage.setItem(pendingKey(safe), JSON.stringify(safe));
        return safe;
      }),
      listPending: userId => userLock(userId, () => {
        const prefix = `netraos.push.pending-deactivation.v1:${userId}:`, records = [];
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (!key?.startsWith(prefix)) continue;
          try {
            const row = JSON.parse(storage.getItem(key) || "null");
            if (row?.userId === userId && UUID.test(row.clientInstanceId || "") && UUID.test(row.operationId || "")) records.push({ userId, clientInstanceId: row.clientInstanceId, operationId: row.operationId });
          } catch { /* Invalid retry metadata is ignored, never treated as confirmation. */ }
        }
        return records;
      }),
      clearPending: record => userLock(record.userId, () => {
        try {
          const key = pendingKey(record), row = JSON.parse(storage.getItem(key) || "null");
          if (row?.userId === record.userId && row?.clientInstanceId === record.clientInstanceId) storage.removeItem(key);
        } catch { /* Keep malformed records for safe manual recovery. */ }
      }),
      newOperationId: randomId,
    });
  };
  const maySubmitCallback = state => Boolean(state?.expectedUserId && state.expectedUserId === state.currentUserId &&
    state.expectedInstanceId && state.expectedInstanceId === state.currentInstanceId && state.permission === "granted" && state.consentActive === true &&
    Number.isSafeInteger(state.expectedGeneration) && state.expectedGeneration > 0 && state.expectedGeneration === state.currentGeneration);
  window.NetraPushCore = Object.freeze({ createIdentityManager: makeIdentityManager, maySubmitCallback });
})();

(() => {
  const firebaseWebConfig = Object.freeze({
    apiKey: "", authDomain: "", projectId: "", messagingSenderId: "", appId: "", vapidKey: ""
  });
  const consentVersion = "push-consent-v1";
  const registrationTimeoutMs = 30000;
  const requestTimeoutMs = 8000;
  const indeterminateStoragePrefix = "netraos.push.registration-indeterminate.v1:";
  let identity = null;
  try { if (window.NetraPushCore && navigator.locks) identity = window.NetraPushCore.createIdentityManager({ storage: localStorage, locks: navigator.locks, cryptoObject: window.crypto }); } catch { /* Push is disabled when secure identity coordination is unavailable. */ }
  let firebaseMessagingPromise;
  let firebaseListenerInstalled = false;
  let lastObservedFid;
  let firebaseRegistrationPromise;
  let registrationState = "idle";
  let indeterminate = false;
  let activeConsentContext = null;
  let signOutInProgress = false;
  let lastSubmittedFid;
  let lastKnownUserId = null;

  const isConfigured = () => ["apiKey", "authDomain", "projectId", "messagingSenderId", "appId", "vapidKey"]
    .every(key => typeof firebaseWebConfig[key] === "string" && firebaseWebConfig[key].trim());
  const emitState = detail => window.dispatchEvent(new CustomEvent("netraos:push-state", { detail }));
  const currentPermission = () => "Notification" in window ? Notification.permission : "unsupported";

  async function getSession() {
    if (!window.NetraSupabase?.enabled || !window.NetraSupabase.getSession) return null;
    const result = await window.NetraSupabase.getSession();
    return result?.data?.session || null;
  }

  async function edgeRequest(functionName, body, expectedUserId) {
    const config = window.NETRAOS_SUPABASE_CONFIG;
    const session = await getSession();
    if (!config?.url || !config?.publishableKey || !session?.access_token) throw new Error("Sign in to manage push notifications.");
    if (expectedUserId && session.user?.id !== expectedUserId) throw new Error("The signed-in account changed. Retry from the current account.");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(`${config.url.replace(/\/+$/, "")}/functions/v1/${functionName}`, {
        method: "POST",
        headers: { apikey: config.publishableKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const errors = {
          AUTH_REQUIRED: "Sign in again to manage push notifications.", DEVICE_LIMIT: "This account already has three registered devices.",
          FID_ALREADY_CLAIMED: "This Firebase installation is already linked to another device account.",
          STALE_GENERATION: "Device registration changed. Refresh its status and try again.",
          RETRY_STATE_CHANGED: "Device state changed while processing. Refresh and try again.",
          CONSENT_REQUIRED: "Enable push notifications again to register this device.",
          CONSENT_REVOKED: "Push consent was revoked. Choose Enable to opt in again.",
          IDEMPOTENCY_CONFLICT: "This device operation could not be reconciled. Refresh and try again.",
          PUSH_NOT_CONFIGURED: "Push registration is not configured on the server yet.",
          ORIGIN_NOT_ALLOWED: "This app origin is not allowed to manage push notifications.",
        };
        throw new Error(errors[data?.error] || "Push settings could not be updated. Try again when connected.");
      }
      return data;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  const lifecycle = (action, instanceId, extra = {}, expectedUserId) => edgeRequest("push-device-lifecycle", { action, client_instance_id: instanceId, ...extra }, expectedUserId);

  async function getFirebaseMessaging() {
    if (!firebaseMessagingPromise) {
      firebaseMessagingPromise = Promise.all([
        import("https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/13.3.0/firebase-messaging.js"),
      ]).then(async ([appSdk, messagingSdk]) => {
        const app = appSdk.getApps().find(existing => existing.name === "netraos-push") || appSdk.initializeApp({
          apiKey: firebaseWebConfig.apiKey, authDomain: firebaseWebConfig.authDomain, projectId: firebaseWebConfig.projectId,
          messagingSenderId: firebaseWebConfig.messagingSenderId, appId: firebaseWebConfig.appId,
        }, "netraos-push");
        if (!await messagingSdk.isSupported()) throw new Error("This browser does not support Firebase web push notifications.");
        return { messaging: messagingSdk.getMessaging(app), messagingSdk };
      }).catch(error => { firebaseMessagingPromise = undefined; throw error; });
    }
    return firebaseMessagingPromise;
  }

  async function getActiveWorker() {
    if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Secure web push is not supported in this browser.");
    const expectedScope = new URL("./", window.location.href).href;
    const worker = await navigator.serviceWorker.getRegistration(window.location.href);
    if (!worker?.active || worker.scope !== expectedScope) throw new Error("The active NetraOS service worker was not found at the app scope.");
    return worker;
  }

  async function readDeviceState(instanceId, userId) { return lifecycle("state", instanceId, {}, userId); }

  async function postFidOnlyAfterChecks(fid) {
    if (typeof fid !== "string" || !fid || signOutInProgress || indeterminate || !activeConsentContext || currentPermission() !== "granted") return;
    const expected = activeConsentContext;
    const session = await getSession().catch(() => null);
    if (!session?.user?.id || session.user.id !== expected.userId) return;
    const currentId = await identity.getExisting(session.user.id).catch(() => null);
    if (currentId !== expected.clientInstanceId) return;
    const state = await readDeviceState(currentId, expected.userId).catch(() => null);
    if (!state?.ok || state.app_consent !== true || !Number.isSafeInteger(Number(state.generation)) || Number(state.generation) !== expected.generation) return;
    if (!window.NetraPushCore.maySubmitCallback({
      expectedUserId: expected.userId, currentUserId: session.user.id, expectedInstanceId: expected.clientInstanceId,
      currentInstanceId: currentId, permission: currentPermission(), consentActive: state.app_consent,
      expectedGeneration: expected.generation, currentGeneration: Number(state.generation),
    })) return;
    if (state.state === "paused" && !expected.resumeIntent) return;
    if (!["pending", "active", "paused"].includes(state.state) || fid === lastSubmittedFid) return;

    const result = await edgeRequest("push-register-device", {
      client_instance_id: expected.clientInstanceId, generation: expected.generation, fid,
    }, expected.userId);
    lastSubmittedFid = fid;
    activeConsentContext = { ...expected, resumeIntent: false };
    registrationState = "registered";
    emitState({ state: "registered" });
    return result;
  }

  function captureFirebaseFid(fid) {
    if (typeof fid !== "string" || !fid) return;
    // FID is module-private; this global event is not correlated to a call.
    lastObservedFid = fid;
    void postFidOnlyAfterChecks(fid).catch(() => emitState({ state: "pending", message: "Firebase registration is awaiting a secure server confirmation." }));
  }

  async function installFidListener(messaging, messagingSdk) {
    if (firebaseListenerInstalled) return;
    messagingSdk.onRegistered(messaging, captureFirebaseFid);
    firebaseListenerInstalled = true;
  }

  async function beginOrResume(userId, instanceId) {
    const previous = await readDeviceState(instanceId, userId);
    let consent;
    if (previous?.app_consent && previous.state === "paused") {
      consent = await lifecycle("resume", instanceId, { operation_id: identity.newOperationId() }, userId);
      if (!consent?.ok) throw new Error(consent?.error || "This device could not be resumed.");
      activeConsentContext = { userId, clientInstanceId: instanceId, generation: Number(consent.generation), resumeIntent: true };
    } else {
      consent = await lifecycle("opt_in", instanceId, { consent_version: consentVersion }, userId);
      if (!consent?.ok) throw new Error(consent?.error || "Notification consent could not be saved.");
      activeConsentContext = { userId, clientInstanceId: instanceId, generation: Number(consent.generation), resumeIntent: previous?.state === "paused" };
    }
    lastSubmittedFid = undefined;
    return activeConsentContext;
  }

  async function registerCurrentDevice() {
    if (firebaseRegistrationPromise) return firebaseRegistrationPromise;
    if (!identity) throw new Error("This browser cannot safely coordinate push registration across tabs.");
    if (!isConfigured()) throw new Error("Firebase public web configuration and the public VAPID key have not been added yet.");
    if (!("Notification" in window)) throw new Error("This browser does not support notifications.");
    registrationState = "registering";
    firebaseRegistrationPromise = (async () => {
      const currentPermission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      if (currentPermission !== "granted") throw new Error(currentPermission === "denied" ? "Notifications are blocked for this site in browser settings." : "Notification permission was not granted.");
      const session = await getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error("Sign in before enabling push notifications.");
      await retryPendingDeactivations(userId);
      const instanceId = await identity.getOrCreate(userId);
      const lockName = `netraos-push-register:${userId}:${instanceId}`;
      const indeterminateStorageKey = `${indeterminateStoragePrefix}${userId}:${instanceId}`;
      const marker = (() => { try { return JSON.parse(localStorage.getItem(indeterminateStorageKey) || "null"); } catch { return null; } })();
      if (marker?.userId === userId && marker?.clientInstanceId === instanceId) {
        const held = await navigator.locks.query();
        const stillRunning = [...(held.held || []), ...(held.pending || [])].some(lock => lock.name === lockName);
        if (stillRunning) {
          indeterminate = true;
          registrationState = "indeterminate";
          throw new Error("Registration is still running in another tab. Wait for it to finish or close every NetraOS tab before reopening.");
        }
        try { localStorage.removeItem(indeterminateStorageKey); } catch { /* No active registration lock means the previous page operation ended. */ }
        indeterminate = false;
        registrationState = "idle";
      } else if (indeterminate) {
        const held = await navigator.locks.query();
        const stillRunning = [...(held.held || []), ...(held.pending || [])].some(lock => lock.name === lockName);
        if (stillRunning) throw new Error("Registration is still running in another tab. Wait for it to finish or close every NetraOS tab before reopening.");
        indeterminate = false;
        registrationState = "idle";
      }
      let timedOut = false;
      let requestCancelled = false;
      const operationPromise = identity.withRegistrationLock(userId, instanceId, async () => {
        if (requestCancelled) throw new Error("Registration request expired while waiting for another tab.");
        // Recheck after waiting for another tab's registration lock.
        const latestSession = await getSession();
        if (latestSession?.user?.id !== userId || Notification.permission !== "granted") throw new Error("Account or permission changed. Try enabling notifications again.");
        const registration = await getActiveWorker();
        const { messaging, messagingSdk } = await getFirebaseMessaging();
        await installFidListener(messaging, messagingSdk);
        await beginOrResume(userId, instanceId);
        await messagingSdk.register(messaging, { vapidKey: firebaseWebConfig.vapidKey, serviceWorkerRegistration: registration });
        registrationState = "pending";
        emitState({ state: "pending" });
        return true;
      });
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => {
          timedOut = true;
          requestCancelled = true;
          indeterminate = true;
          registrationState = "indeterminate";
          try { localStorage.setItem(indeterminateStorageKey, JSON.stringify({ userId, clientInstanceId: instanceId })); } catch { /* Lock still protects this live operation. */ }
          emitState({ state: "indeterminate" });
          reject(new Error("Registration status is indeterminate. Close all NetraOS tabs and open a fresh tab after the operation stops."));
        }, registrationTimeoutMs);
      });
      operationPromise.then(() => {
        if (timedOut && indeterminate) {
          indeterminate = false;
          try { localStorage.removeItem(indeterminateStorageKey); } catch { /* The in-memory lock state is sufficient for this page. */ }
          registrationState = "pending";
          emitState({ state: "pending" });
          if (lastObservedFid) void postFidOnlyAfterChecks(lastObservedFid).catch(() => {});
        }
      }, () => {
        if (timedOut && indeterminate) {
          indeterminate = false;
          try { localStorage.removeItem(indeterminateStorageKey); } catch { /* The in-memory lock state is sufficient for this page. */ }
          registrationState = "idle";
        }
      });
      try { return await Promise.race([operationPromise, timeoutPromise]); }
      catch (error) { throw error; }
      finally { window.clearTimeout(timeoutId); }
    })().catch(error => {
      if (!indeterminate) registrationState = "idle";
      throw error;
    }).finally(() => { firebaseRegistrationPromise = undefined; });
    return firebaseRegistrationPromise;
  }

  async function pauseDevice(userId, instanceId, state, operationId = identity.newOperationId(), preserveRetryRecord = false) {
    const pendingRecord = { userId, clientInstanceId: instanceId, operationId };
    let storedRecord = false;
    try { await identity.savePending(pendingRecord); storedRecord = true; } catch { /* Deactivation still proceeds; UI will report if it is unconfirmed. */ }
    try {
      const result = await lifecycle("pause", instanceId, { expected_generation: Number(state.generation), operation_id: operationId }, userId);
      if (result?.ok) {
        emitState({ state: "paused", confirmed: true });
        if (!preserveRetryRecord && storedRecord) await identity.clearPending(pendingRecord);
        return { confirmed: true, result, pendingRecord: storedRecord ? pendingRecord : null };
      }
      if (result?.error === "DEVICE_NOT_FOUND") {
        await identity.clearPending(pendingRecord);
        emitState({ state: "not_registered", confirmed: true });
        return { confirmed: true, result, pendingRecord: null };
      }
      emitState({ state: "deactivation_unconfirmed", confirmed: false });
      return { confirmed: false, result, pendingRecord };
    } catch {
      emitState({ state: "deactivation_unconfirmed", confirmed: false });
      return { confirmed: false, pendingRecord };
    }
  }

  async function deactivateBeforeSignOut(userId) {
    signOutInProgress = true;
    const instanceId = await identity.getExisting(userId).catch(() => null);
    if (!instanceId) return { confirmed: true };
    const operationId = identity.newOperationId();
    const pendingRecord = await identity.savePending({ userId, clientInstanceId: instanceId, operationId }).catch(() => null);
    const state = await readDeviceState(instanceId, userId).catch(() => null);
    if (!state?.ok || state.state === "not_registered") {
      await identity.clearActive(userId, instanceId).catch(() => {});
      if (state?.ok && pendingRecord) await identity.clearPending(pendingRecord);
      return { confirmed: Boolean(state?.ok) };
    }
    const result = await pauseDevice(userId, instanceId, state, operationId, true);
    // The local active identity is removed even on network failure. The pending
    // record remains isolated to this user until that same user authenticates.
    await identity.clearActive(userId, instanceId).catch(() => {});
    if (!result.confirmed) emitState({ state: "deactivation_unconfirmed", confirmed: false });
    return result;
  }

  async function retryPendingDeactivations(userId) {
    if (!identity || !userId) return;
    const records = await identity.listPending(userId).catch(() => []);
    for (const record of records) {
      const state = await readDeviceState(record.clientInstanceId, userId).catch(() => null);
      if (state?.ok && state.state === "not_registered") {
        await identity.clearPending(record);
        continue;
      }
      if (!state?.ok) continue;
      const result = await lifecycle("pause", record.clientInstanceId, {
        // pause operation fingerprints are based on user + device + operation,
        // so this replay returns the original result after a lost response.
        expected_generation: Number(state.generation), operation_id: record.operationId,
      }, userId).catch(() => null);
      if (result?.ok) {
        await identity.restoreActive(userId, record.clientInstanceId).catch(() => {});
        await identity.clearPending(record);
      }
    }
  }

  async function reconcilePermission() {
    if (!identity || currentPermission() === "granted") return;
    const session = await getSession().catch(() => null);
    const userId = session?.user?.id;
    if (!userId) return;
    const instanceId = await identity.getExisting(userId).catch(() => null);
    if (!instanceId) return;
    const state = await readDeviceState(instanceId, userId).catch(() => null);
    if (!state?.ok || !state.app_consent || !["active", "pending", "paused"].includes(state.state)) return;
    await pauseDevice(userId, instanceId, state);
    activeConsentContext = null;
    registrationState = "paused";
  }

  async function reconcileSignedInUser(userId) {
    if (!identity || !userId) return;
    await retryPendingDeactivations(userId);
    const instanceId = await identity.getExisting(userId).catch(() => null);
    if (!instanceId) return;
    const state = await readDeviceState(instanceId, userId).catch(() => null);
    if (!state?.ok) return;
    if (currentPermission() !== "granted") {
      if (state.app_consent && ["active", "pending", "paused"].includes(state.state)) await pauseDevice(userId, instanceId, state);
      return;
    }
    if (!state.app_consent || !["pending", "active"].includes(state.state) || !isConfigured()) return;
    activeConsentContext = { userId, clientInstanceId: instanceId, generation: Number(state.generation), resumeIntent: false };
    try {
      await identity.withRegistrationLock(userId, instanceId, async () => {
        const session = await getSession();
        if (session?.user?.id !== userId || currentPermission() !== "granted") return;
        const latest = await readDeviceState(instanceId, userId);
        if (!latest?.app_consent || Number(latest.generation) !== Number(state.generation) || !["pending", "active"].includes(latest.state)) return;
        activeConsentContext = { userId, clientInstanceId: instanceId, generation: Number(latest.generation), resumeIntent: false };
        const registration = await getActiveWorker();
        const { messaging, messagingSdk } = await getFirebaseMessaging();
        await installFidListener(messaging, messagingSdk);
        await messagingSdk.register(messaging, { vapidKey: firebaseWebConfig.vapidKey, serviceWorkerRegistration: registration });
      });
    } catch { /* Keep the consent state; retry the global Firebase registration on the next page/session event. */ }
  }

  async function retainDeactivationForAccount(userId) {
    if (!userId || !identity) return;
    const instanceId = await identity.getExisting(userId).catch(() => null);
    if (!instanceId) return;
    // The current session may already belong to another account, so do not
    // claim server deactivation. Save a user-scoped retry for that user's next
    // authenticated session, then prevent this identity from being reused.
    await identity.savePending({ userId, clientInstanceId: instanceId, operationId: identity.newOperationId() }).catch(() => {});
    await identity.clearActive(userId, instanceId).catch(() => {});
  }

  function patchSignOut() {
    const auth = window.NetraSupabase?.client?.auth;
    if (!auth || auth.__netraPushWrapped || typeof auth.signOut !== "function") return;
    const original = auth.signOut.bind(auth);
    auth.signOut = async options => {
      const session = await getSession().catch(() => null);
      const userId = session?.user?.id;
      try {
        if (userId && identity) await deactivateBeforeSignOut(userId);
      } catch {
        // Sign-out must still complete. The unconfirmed operation is retained.
        emitState({ state: "deactivation_unconfirmed", confirmed: false });
      }
      return original(options);
    };
    Object.defineProperty(auth, "__netraPushWrapped", { value: true, configurable: false });
  }

  async function revokeCurrentDevice() {
    const session = await getSession();
    const userId = session?.user?.id;
    const instanceId = userId && identity ? await identity.getExisting(userId) : null;
    if (!instanceId) return { ok: true, state: "not_registered" };
    const state = await readDeviceState(instanceId, userId);
    if (!state?.ok || state.state === "not_registered") return state;
    const result = await lifecycle("revoke", instanceId, { expected_generation: Number(state.generation), operation_id: identity.newOperationId() }, userId);
    if (result?.ok) {
      await identity.clearActive(userId, instanceId);
      activeConsentContext = null;
      registrationState = "revoked";
      emitState({ state: "revoked", confirmed: true });
    }
    return result;
  }

  window.NetraPush = Object.freeze({
    isConfigured,
    hasRegistered: () => registrationState === "registered",
    getRegistrationState: () => registrationState,
    registerCurrentDevice,
    revokeCurrentDevice,
    getPermission: currentPermission,
    reconcilePermission,
    retryPendingDeactivations,
  });

  patchSignOut();
  window.addEventListener("netraos-auth-event", event => {
    const session = event.detail?.session;
    const userId = session?.user?.id || null;
    if (userId) {
      if (lastKnownUserId && lastKnownUserId !== userId) {
        activeConsentContext = null;
        void retainDeactivationForAccount(lastKnownUserId);
      }
      signOutInProgress = false;
      lastKnownUserId = userId;
      void reconcileSignedInUser(userId);
    } else if (event.detail?.event === "SIGNED_OUT") {
      activeConsentContext = null;
      lastKnownUserId = null;
    }
  });
  for (const eventName of ["focus", "pageshow", "visibilitychange"]) {
    window.addEventListener(eventName, () => { void reconcilePermission(); });
  }
  if (navigator.permissions?.query) {
    navigator.permissions.query({ name: "notifications" }).then(status => {
      status.addEventListener?.("change", () => { void reconcilePermission(); });
    }).catch(() => {});
  }
  window.addEventListener("online", () => {
    if (lastKnownUserId) void retryPendingDeactivations(lastKnownUserId);
    void reconcilePermission();
  });
  if (window.NetraSupabase?.getSession) {
    window.NetraSupabase.getSession().then(result => {
      const userId = result?.data?.session?.user?.id;
      if (userId) { lastKnownUserId = userId; void reconcileSignedInUser(userId); }
    }).catch(() => {});
  }

  document.addEventListener("click", async event => {
    const enable = event.target.closest("[data-push-register]");
    const revoke = event.target.closest("[data-push-revoke]");
    const button = enable || revoke;
    if (!button) return;
    const wrapper = button.closest("[data-push-settings]");
    const status = wrapper?.querySelector("[data-push-status]");
    if (!status) return;
    button.disabled = true;
    try {
      if (enable) {
        status.textContent = "Checking permission and registering this device…";
        await registerCurrentDevice();
        status.textContent = "Firebase registration started. NetraOS is waiting for secure server confirmation.";
      } else {
        status.textContent = "Revoking push consent…";
        const result = await revokeCurrentDevice();
        status.textContent = result?.ok ? "Push consent was revoked for this device." : "Push consent could not be confirmed as revoked.";
      }
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Push settings could not be updated.";
    } finally {
      button.disabled = false;
      const peer = wrapper?.querySelector(enable ? "[data-push-revoke]" : "[data-push-register]");
      if (peer) peer.disabled = false;
    }
  });
  window.addEventListener("netraos:push-state", event => {
    const status = document.querySelector("[data-push-status]");
    if (!status || !event.detail) return;
    const messages = {
      registered: "This device is registered for push notifications.",
      pending: "Registration is pending secure server confirmation.",
      paused: "Push is paused on the server for this device.",
      deactivation_unconfirmed: "Device deactivation is unconfirmed. NetraOS will retry when this account is available online.",
      indeterminate: "Firebase registration status is indeterminate. Close all NetraOS tabs and open a fresh tab before retrying.",
      revoked: "Push consent was revoked for this device.",
    };
    if (messages[event.detail.state]) status.textContent = messages[event.detail.state];
  });
})();
