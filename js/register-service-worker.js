// Preserve NetraOS's existing root worker registration and app scope.
if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
  navigator.serviceWorker.register("./service-worker.js").catch(error => console.warn("Offline app shell is unavailable:", error));
}

// Keep lifecycle helpers in this already-cached script so offline startup does
// not depend on an additional service-worker asset.
(() => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const makeIdentityManager = ({ storage, locks, cryptoObject, indexedDB }) => {
    if (!storage || !locks?.request) throw new Error("Safe cross-tab push coordination is unavailable.");
    const userLock = (userId, callback) => locks.request(`netraos-push-user:${userId}`, { mode: "exclusive" }, callback);
    const identityKey = userId => `netraos.push.instance.v1:${userId}`;
    const pendingKey = record => `netraos.push.pending-deactivation.v1:${record.userId}:${record.operationId}`;
    let pendingDbPromise;
    const pendingDb = () => {
      if (!indexedDB?.open) return Promise.reject(new Error("IndexedDB is unavailable."));
      if (!pendingDbPromise) pendingDbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open("netraos-push-recovery-v1", 1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("pending")) request.result.createObjectStore("pending", { keyPath: "key" }); };
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      return pendingDbPromise;
    };
    const idbPut = async (record) => { const db = await pendingDb(); await new Promise((resolve, reject) => { const tx = db.transaction("pending", "readwrite"); tx.objectStore("pending").put({ ...record, key: pendingKey(record) }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); };
    const idbAll = async () => { const db = await pendingDb(); return new Promise((resolve, reject) => { const tx = db.transaction("pending", "readonly"), req = tx.objectStore("pending").getAll(); req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error); }); };
    const idbDelete = async record => { const db = await pendingDb(); await new Promise((resolve, reject) => { const tx = db.transaction("pending", "readwrite"); tx.objectStore("pending").delete(pendingKey(record)); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); };
    const randomId = () => {
      if (!cryptoObject?.randomUUID) throw new Error("Secure device identity generation is unavailable.");
      return cryptoObject.randomUUID();
    };
    return Object.freeze({
      withUserLock: userLock,
      withLifecycleLock: (userId, instanceId, callback) => locks.request(`netraos-push-register:${userId}:${instanceId}`, { mode: "exclusive" }, callback),
      withRegistrationLock: (userId, instanceId, callback) => locks.request(`netraos-push-register:${userId}:${instanceId}`, { mode: "exclusive" }, callback),
      getOrCreate: userId => userLock(userId, () => {
        const key = identityKey(userId); let value = storage.getItem(key);
        if (!UUID.test(value || "")) { value = randomId(); storage.setItem(key, value); }
        return value;
      }),
      getExisting: userId => userLock(userId, () => { const value = storage.getItem(identityKey(userId)); return UUID.test(value || "") ? value : null; }),
      saveGeneration: (userId, instanceId, generation) => userLock(userId, () => {
        if (!Number.isSafeInteger(generation) || generation < 0) return false;
        storage.setItem(`netraos.push.generation.v1:${userId}:${instanceId}`, String(generation)); return true;
      }),
      getGeneration: (userId, instanceId) => userLock(userId, () => {
        const value = Number(storage.getItem(`netraos.push.generation.v1:${userId}:${instanceId}`));
        return Number.isSafeInteger(value) && value >= 0 ? value : null;
      }),
      clearActive: (userId, expectedId) => userLock(userId, () => { const key = identityKey(userId); if (storage.getItem(key) === expectedId) storage.removeItem(key); }),
      restoreActive: (userId, instanceId) => userLock(userId, () => {
        const key = identityKey(userId), existing = storage.getItem(key);
        if (!existing || existing === instanceId) storage.setItem(key, instanceId);
        return existing || instanceId;
      }),
      savePending: record => userLock(record.userId, async () => {
        if (!record.userId || !UUID.test(record.clientInstanceId || "") || !UUID.test(record.operationId || "")) throw new Error("Invalid push deactivation record.");
        if (!Number.isSafeInteger(record.expectedGeneration) || record.expectedGeneration < 0) throw new Error("Missing generation for push deactivation retry.");
        const safe = { userId: record.userId, clientInstanceId: record.clientInstanceId, operationId: record.operationId, expectedGeneration: record.expectedGeneration };
        try { storage.setItem(pendingKey(safe), JSON.stringify(safe)); }
        catch { await idbPut(safe); }
        return safe;
      }),
      listPending: userId => userLock(userId, async () => {
        const prefix = `netraos.push.pending-deactivation.v1:${userId}:`, records = [];
        try {
          for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (!key?.startsWith(prefix)) continue;
            try {
              const row = JSON.parse(storage.getItem(key) || "null");
              if (row?.userId === userId && UUID.test(row.clientInstanceId || "") && UUID.test(row.operationId || "") && Number.isSafeInteger(row.expectedGeneration) && row.expectedGeneration >= 0) records.push({ userId, clientInstanceId: row.clientInstanceId, operationId: row.operationId, expectedGeneration: row.expectedGeneration });
            } catch { /* Invalid retry metadata is ignored, never treated as confirmation. */ }
          }
        } catch { /* Continue to durable IndexedDB recovery if localStorage is unavailable. */ }
        try {
          for (const row of await idbAll()) if (row?.userId === userId && UUID.test(row.clientInstanceId || "") && UUID.test(row.operationId || "") && Number.isSafeInteger(row.expectedGeneration) && row.expectedGeneration >= 0 && !records.some(item => item.operationId === row.operationId)) records.push({ userId, clientInstanceId: row.clientInstanceId, operationId: row.operationId, expectedGeneration: row.expectedGeneration });
        } catch { /* A failed durable read leaves sign-out blocked if no retry record is available. */ }
        return records;
      }),
      clearPending: record => userLock(record.userId, async () => {
        try {
          const key = pendingKey(record), row = JSON.parse(storage.getItem(key) || "null");
          if (row?.userId === record.userId && row?.clientInstanceId === record.clientInstanceId && row?.operationId === record.operationId) storage.removeItem(key);
        } catch { /* Keep malformed records for safe manual recovery. */ }
        await idbDelete(record).catch(() => {});
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
  const recoveryButtonIntent = Object.freeze({});
  const registrationTimeoutMs = 30000;
  const requestTimeoutMs = 8000;
  const indeterminateStoragePrefix = "netraos.push.registration-indeterminate.v1:";
  let identity = null;
  try { if (window.NetraPushCore && navigator.locks) identity = window.NetraPushCore.createIdentityManager({ storage: localStorage, locks: navigator.locks, cryptoObject: window.crypto, indexedDB: window.indexedDB }); } catch { /* Push is disabled when secure identity coordination is unavailable. */ }
  let firebaseMessagingPromise;
  let firebaseListenerInstalled = false;
  let lastObservedFid;
  let pendingRecoveryResolver = null;
  let firebaseRegistrationPromise;
  let registrationState = "idle";
  let indeterminate = false;
  let activeConsentContext = null;
  let signOutInProgress = false;
  let lastSubmittedFid;
  const registrationOperationIds = new Map();
  let lastKnownUserId = null;

  const isConfigured = () => ["apiKey", "authDomain", "projectId", "messagingSenderId", "appId", "vapidKey"]
    .every(key => typeof firebaseWebConfig[key] === "string" && firebaseWebConfig[key].trim());
  const emitState = detail => {
    if (typeof detail?.state === "string") registrationState = detail.state;
    window.dispatchEvent(new CustomEvent("netraos:push-state", { detail }));
  };
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
        const failure = new Error(errors[data?.error] || "Push settings could not be updated. Try again when connected.");
        failure.code = data?.error;
        failure.retryAfterSeconds = data?.retry_after_seconds;
        throw failure;
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

  async function readDeviceState(instanceId, userId) {
    const state = await lifecycle("state", instanceId, {}, userId);
    if (state?.ok && Number.isSafeInteger(Number(state.generation))) await identity?.saveGeneration(userId, instanceId, Number(state.generation)).catch(() => {});
    return state;
  }

  function isAcceptableFid(fid) {
    if (typeof fid !== "string") return false;
    const length = Array.from(fid).length;
    return length >= 1 && length <= 128 && !/[ \u0000-\u001f\u007f-\u009f]/.test(fid);
  }

  async function postFidOnlyAfterChecks(fid) {
    if (!isAcceptableFid(fid) || signOutInProgress || indeterminate || !activeConsentContext || currentPermission() !== "granted") return;
    const expected = { ...activeConsentContext };
    return identity.withLifecycleLock(expected.userId, expected.clientInstanceId, async () => {
      if (signOutInProgress || currentPermission() !== "granted" || !activeConsentContext ||
          activeConsentContext.userId !== expected.userId || activeConsentContext.clientInstanceId !== expected.clientInstanceId ||
          activeConsentContext.generation !== expected.generation) return;
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

      let operationId = registrationOperationIds.get(fid);
      if (!operationId) { operationId = identity.newOperationId(); registrationOperationIds.set(fid, operationId); }
      let result;
      try {
        result = await edgeRequest("push-register-device", {
          client_instance_id: expected.clientInstanceId, generation: expected.generation, fid, operation_id: operationId,
        }, expected.userId);
      } catch (error) {
        if (error?.code === "RATE_LIMITED") registrationOperationIds.delete(fid);
        throw error;
      }
      registrationOperationIds.delete(fid);
      lastSubmittedFid = fid;
      activeConsentContext = { ...expected, generation: Number(result.generation), resumeIntent: false };
      registrationState = "registered";
      emitState({ state: "registered" });
      return result;
    });
  }

  function captureFirebaseFid(fid) {
    if (!isAcceptableFid(fid)) return;
    // FID is module-private; this global event is not correlated to a call.
    lastObservedFid = fid;
    if (pendingRecoveryResolver) { const resolve = pendingRecoveryResolver; pendingRecoveryResolver = null; resolve(fid); }
    void postFidOnlyAfterChecks(fid).catch(() => emitState({ state: "pending", message: "Firebase registration is awaiting a secure server confirmation." }));
  }

  async function recoverPreviousDevice(intent) {
    if (intent !== recoveryButtonIntent) throw new Error("Use the Recover a previous device button to continue.");
    if (currentPermission() !== "granted") throw new Error("Allow notifications in browser settings before recovering this device.");
    if (!identity || !isConfigured()) throw new Error("Push recovery is not available in this browser yet.");
    const initialSession = await getSession();
    const userId = initialSession?.user?.id;
    if (!userId) throw new Error("Sign in to the original NetraOS account before recovering this device.");
    const instanceId = await identity.getOrCreate(userId);
    return identity.withLifecycleLock(userId, instanceId, async () => {
      const assertRecoveryContext = async () => {
        if (intent !== recoveryButtonIntent || signOutInProgress || currentPermission() !== "granted") throw new Error("Recovery was cancelled because account activity or notification permission changed.");
        const session = await getSession().catch(() => null);
        if (session?.user?.id !== userId) throw new Error("Recovery was cancelled because the signed-in account changed.");
        const currentId = await identity.getExisting(userId).catch(() => null);
        if (currentId !== instanceId) throw new Error("Recovery was cancelled because this browser identity changed.");
        const current = await readDeviceState(instanceId, userId).catch(() => null);
        if (!current?.ok || current.state !== "not_registered") throw new Error("This browser's device state changed. Refresh the device list and try again.");
        return current;
      };

      await assertRecoveryContext();
      // Capture server-visible account device generations before waiting on a
      // global Firebase callback. The FID is unavailable here, so after the
      // callback we bind the matched candidate to this authenticated snapshot.
      const baselineDevices = await listDevices();
      if (!Array.isArray(baselineDevices)) throw new Error("Registered devices could not be verified. Refresh and try again.");
      let fid = lastObservedFid;
      if (!fid) {
        const registration = await getActiveWorker();
        const { messaging, messagingSdk } = await getFirebaseMessaging();
        await installFidListener(messaging, messagingSdk);
        let timeoutId;
        const fidPromise = new Promise((resolve, reject) => {
          timeoutId = window.setTimeout(() => { pendingRecoveryResolver = null; reject(new Error("Firebase did not provide an installation identifier. Try recovery again when online.")); }, registrationTimeoutMs);
          pendingRecoveryResolver = value => { window.clearTimeout(timeoutId); resolve(value); };
        });
        const registrationPromise = messagingSdk.register(messaging, { vapidKey: firebaseWebConfig.vapidKey, serviceWorkerRegistration: registration });
        try {
          const [, registeredFid] = await Promise.all([registrationPromise, fidPromise]);
          fid = registeredFid;
        } catch (error) {
          // Keep the shared lifecycle lock until Firebase's call settles. That
          // prevents another tab from starting a competing recovery while the
          // global callback is still indeterminate.
          await registrationPromise.catch(() => {});
          throw error;
        } finally { window.clearTimeout(timeoutId); pendingRecoveryResolver = null; }
      }

      await assertRecoveryContext();
      const candidate = await lifecycle("recovery_candidate", instanceId, { fid }, userId);
      if (!candidate?.ok || candidate.app_consent !== true || !["active", "pending", "paused"].includes(candidate.state) || !Number.isSafeInteger(Number(candidate.generation))) {
        throw new Error("No recoverable device was found for this account.");
      }
      const baselineCandidate = baselineDevices.find(device => device.client_instance_id === candidate.client_instance_id);
      if (!baselineCandidate || Number(baselineCandidate.generation) !== Number(candidate.generation) ||
          baselineCandidate.app_consent !== true || baselineCandidate.state !== candidate.state) {
        throw new Error("The previous device changed while Firebase registration was pending. Refresh and try again.");
      }
      await assertRecoveryContext();
      const currentCandidate = await lifecycle("recovery_candidate", instanceId, { fid }, userId);
      if (!currentCandidate?.ok || currentCandidate.client_instance_id !== candidate.client_instance_id ||
          Number(currentCandidate.generation) !== Number(candidate.generation) || currentCandidate.app_consent !== true ||
          !["active", "pending", "paused"].includes(currentCandidate.state)) {
        throw new Error("The previous device changed while recovery was in progress. Refresh and try again.");
      }
      await assertRecoveryContext();
      const result = await lifecycle("recover", instanceId, {
        fid, previous_client_instance_id: currentCandidate.client_instance_id,
        expected_generation: Number(currentCandidate.generation), operation_id: identity.newOperationId(),
      }, userId);
      if (!result?.ok) throw new Error(result?.error || "The previous device changed before recovery could complete.");
      await identity.saveGeneration(userId, instanceId, Number(result.generation));
      registrationState = result.state === "active" ? "registered" : "paused";
      emitState({ state: registrationState, confirmed: true });
      return result;
    });
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
      consent = await lifecycle("resume", instanceId, { expected_generation: Number(previous.generation), operation_id: identity.newOperationId() }, userId);
      if (!consent?.ok) throw new Error(consent?.error || "This device could not be resumed.");
      activeConsentContext = { userId, clientInstanceId: instanceId, generation: Number(consent.generation), resumeIntent: true };
    } else {
      consent = await lifecycle("opt_in", instanceId, { consent_version: consentVersion, operation_id: identity.newOperationId() }, userId);
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

  async function pauseDeviceLocked(userId, instanceId, state, operationId, preserveRetryRecord = false) {
    if (!operationId) {
      const existing = await identity.listPending(userId).catch(() => []);
      operationId = existing.find(row => row.clientInstanceId === instanceId && row.expectedGeneration === Number(state.generation))?.operationId || identity.newOperationId();
    }
    const pendingRecord = { userId, clientInstanceId: instanceId, operationId, expectedGeneration: Number(state.generation) };
    let storedRecord = false;
    try { await identity.savePending(pendingRecord); storedRecord = true; } catch { /* Deactivation still proceeds; UI will report if it is unconfirmed. */ }
    try {
      const result = await lifecycle("pause", instanceId, { expected_generation: Number(state.generation), operation_id: operationId }, userId);
      if (result?.ok) {
        emitState({ state: "paused", confirmed: true });
        if (!preserveRetryRecord && storedRecord) await identity.clearPending(pendingRecord);
        return { confirmed: true, result, retryPersisted: storedRecord, pendingRecord: storedRecord ? pendingRecord : null };
      }
      if (result?.error === "DEVICE_NOT_FOUND") {
        await identity.clearPending(pendingRecord);
        emitState({ state: "not_registered", confirmed: true });
        return { confirmed: true, result, pendingRecord: null };
      }
      emitState({ state: "deactivation_unconfirmed", confirmed: false });
      return { confirmed: false, result, retryPersisted: storedRecord, pendingRecord: storedRecord ? pendingRecord : null };
    } catch {
      emitState({ state: "deactivation_unconfirmed", confirmed: false });
      return { confirmed: false, retryPersisted: storedRecord, pendingRecord: storedRecord ? pendingRecord : null };
    }
  }

  async function pauseDevice(userId, instanceId, state, operationId, preserveRetryRecord = false) {
    return identity.withLifecycleLock(userId, instanceId, () => pauseDeviceLocked(userId, instanceId, state, operationId, preserveRetryRecord));
  }

  async function deactivateBeforeSignOut(userId) {
    let instanceId;
    try { instanceId = await identity.getExisting(userId); }
    catch { return { confirmed: false, retryPersisted: false }; }
    activeConsentContext = null;
    if (!instanceId) return { confirmed: true };
    return identity.withLifecycleLock(userId, instanceId, async () => {
      const state = await readDeviceState(instanceId, userId).catch(() => null);
      if (state?.ok && state.state === "not_registered") {
        await identity.clearActive(userId, instanceId).catch(() => {});
        return { confirmed: true };
      }
      const expectedGeneration = state?.ok ? Number(state.generation) : await identity.getGeneration(userId, instanceId).catch(() => null);
      if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0) return { confirmed: false, retryPersisted: false };
      const existingPending = await identity.listPending(userId).catch(() => []);
      const operationId = existingPending.find(row => row.clientInstanceId === instanceId && row.expectedGeneration === expectedGeneration)?.operationId || identity.newOperationId();
      const pendingRecord = await identity.savePending({ userId, clientInstanceId: instanceId, operationId, expectedGeneration }).catch(() => null);
      if (!state?.ok) {
        if (pendingRecord) await identity.clearActive(userId, instanceId).catch(() => {});
        return { confirmed: false, retryPersisted: Boolean(pendingRecord) };
      }
      const result = await pauseDeviceLocked(userId, instanceId, state, operationId, true);
      result.retryPersisted = Boolean(pendingRecord);
      if (result.confirmed || pendingRecord) await identity.clearActive(userId, instanceId).catch(() => {});
      if (!result.confirmed) emitState({ state: "deactivation_unconfirmed", confirmed: false });
      return result;
    });
  }

  async function retryPendingDeactivations(userId) {
    if (!identity || !userId) return;
    const records = await identity.listPending(userId).catch(() => []);
    for (const record of records) {
      await identity.withLifecycleLock(userId, record.clientInstanceId, async () => {
        const state = await readDeviceState(record.clientInstanceId, userId).catch(() => null);
        if (state?.ok && state.state === "not_registered") { await identity.clearPending(record); return; }
        if (!state?.ok) return;
        let activeRecord = record;
        let result = await lifecycle("pause", activeRecord.clientInstanceId, {
          expected_generation: activeRecord.expectedGeneration, operation_id: activeRecord.operationId,
        }, userId).catch(() => null);
        if (result?.error === "STALE_GENERATION" || result?.error === "RETRY_STATE_CHANGED") {
          const replacement = { userId, clientInstanceId: record.clientInstanceId, operationId: identity.newOperationId(), expectedGeneration: Number(state.generation) };
          try {
            await identity.savePending(replacement);
            await identity.clearPending(record);
            activeRecord = replacement;
            result = await lifecycle("pause", activeRecord.clientInstanceId, { expected_generation: activeRecord.expectedGeneration, operation_id: activeRecord.operationId }, userId).catch(() => null);
          } catch { return; }
        }
        if (result?.ok) {
          await identity.clearPending(activeRecord);
          await identity.restoreActive(userId, activeRecord.clientInstanceId).catch(() => {});
        }
      });
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
    if (state.state === "paused") { registrationState = "paused"; return; }
    const result = await pauseDevice(userId, instanceId, state);
    activeConsentContext = null;
    registrationState = result.confirmed ? "paused" : "deactivation_unconfirmed";
  }

  async function reconcileSignedInUser(userId) {
    if (!identity || !userId) return;
    await retryPendingDeactivations(userId);
    const instanceId = await identity.getExisting(userId).catch(() => null);
    if (!instanceId) return;
    const state = await readDeviceState(instanceId, userId).catch(() => null);
    if (!state?.ok) return;
    if (currentPermission() !== "granted") {
      if (state.app_consent && ["active", "pending"].includes(state.state)) await pauseDevice(userId, instanceId, state);
      return;
    }
    if (!state.app_consent || !["pending", "active"].includes(state.state) || !isConfigured()) return;
    activeConsentContext = { userId, clientInstanceId: instanceId, generation: Number(state.generation), resumeIntent: false };
    try {
      await identity.withLifecycleLock(userId, instanceId, async () => {
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
    await identity.withLifecycleLock(userId, instanceId, async () => {
      const generation = await identity.getGeneration(userId, instanceId).catch(() => null);
      if (generation === null) return;
      await identity.savePending({ userId, clientInstanceId: instanceId, operationId: identity.newOperationId(), expectedGeneration: generation }).catch(() => {});
      await identity.clearActive(userId, instanceId).catch(() => {});
    });
  }

  function patchSignOut() {
    const auth = window.NetraSupabase?.client?.auth;
    if (!auth || auth.__netraPushWrapped || typeof auth.signOut !== "function") return;
    const original = auth.signOut.bind(auth);
    auth.signOut = async options => {
      if (signOutInProgress) throw new Error("Sign-out is already in progress.");
      signOutInProgress = true;
      try {
        const session = await getSession().catch(() => null);
        const userId = session?.user?.id;
        const emergency = options?.emergencyUnconfirmedPushSignOut === true;
        if (userId && identity) {
          let result;
          try { result = await deactivateBeforeSignOut(userId); }
          catch { result = { confirmed: false, retryPersisted: false }; }
          if (!result.confirmed && !result.retryPersisted && !emergency) {
            const proceed = typeof window.confirm === "function" && window.confirm("NetraOS could not confirm device deactivation or save retry information. If you continue, this device may remain active for notifications. Continue with emergency sign-out?");
            if (!proceed) throw new Error("Sign-out was paused because push deactivation is unconfirmed and no retry could be saved.");
            emitState({ state: "deactivation_unconfirmed", confirmed: false, emergency: true });
            return await original({ ...options, emergencyUnconfirmedPushSignOut: true });
          }
          if (!result.confirmed && emergency) emitState({ state: "deactivation_unconfirmed", confirmed: false, emergency: true });
        }
        return await original(options);
      } finally {
        // The flag covers the full wrapped sign-out promise, including any
        // auth-state event delay. Cancellation, thrown errors and returned
        // Supabase errors all release the local gate when that promise ends.
        signOutInProgress = false;
      }
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
    return revokeDevice(userId, instanceId, Number(state.generation));
  }

  async function revokeDevice(userId, instanceId, expectedGeneration) {
    return identity.withLifecycleLock(userId, instanceId, async () => {
      const session = await getSession().catch(() => null);
      if (session?.user?.id !== userId) throw new Error("The signed-in account changed. Refresh the device list.");
      const state = await readDeviceState(instanceId, userId);
      if (!state?.ok || state.state === "not_registered") return state;
      if (Number(state.generation) !== Number(expectedGeneration)) throw new Error("This device changed. Refresh the list and try again.");
      const result = await lifecycle("revoke", instanceId, { expected_generation: Number(expectedGeneration), operation_id: identity.newOperationId() }, userId);
      if (result?.ok) {
        const currentId = await identity.getExisting(userId).catch(() => null);
        if (currentId === instanceId) await identity.clearActive(userId, instanceId);
        if (currentId === instanceId) { activeConsentContext = null; registrationState = "revoked"; }
        emitState({ state: "revoked", confirmed: true, clientInstanceId: instanceId });
      }
      return result;
    });
  }

  async function listDevices() {
    const session = await getSession();
    const userId = session?.user?.id;
    if (!userId) throw new Error("Sign in to view registered devices.");
    return edgeRequest("push-device-lifecycle", { action: "list" }, userId);
  }

  async function isCurrentDevice(instanceId) {
    const session = await getSession().catch(() => null);
    if (!session?.user?.id || !identity) return false;
    return (await identity.getExisting(session.user.id).catch(() => null)) === instanceId;
  }

  async function refreshDeviceList() {
    const container = document.querySelector("[data-push-devices]");
    if (!container) return;
    container.replaceChildren();
    const loading = document.createElement("p");
    loading.className = "settings-push-device-empty";
    loading.textContent = "Loading registered devices…";
    container.append(loading);
    try {
      const [devices, currentId] = await Promise.all([listDevices(), getCurrentDeviceId()]);
      if (!container.isConnected) return;
      container.replaceChildren();
      if (!Array.isArray(devices) || devices.length === 0) {
        const empty = document.createElement("p");
        empty.className = "settings-push-device-empty";
        empty.textContent = "No push devices are registered to this account.";
        container.append(empty);
        return;
      }
      for (const device of devices) {
        const row = document.createElement("article");
        row.className = "settings-push-device";
        const details = document.createElement("div");
        details.className = "settings-push-device-details";
        const name = document.createElement("strong");
        name.textContent = device.client_instance_id === currentId ? "This browser" : "Registered browser";
        const id = document.createElement("code");
        id.textContent = String(device.client_instance_id || "");
        const metadata = document.createElement("span");
        const seen = device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "Not seen yet";
        metadata.textContent = `Status: ${String(device.state || "unknown")} · Generation ${Number(device.generation) || 0} · Last seen ${seen}`;
        details.append(name, id, metadata);
        row.append(details);
        if (device.state !== "revoked" && typeof device.client_instance_id === "string" && Number.isSafeInteger(Number(device.generation))) {
          const revoke = document.createElement("button");
          revoke.type = "button";
          revoke.className = "secondary-button danger-button";
          revoke.textContent = "Revoke";
          revoke.dataset.pushDeviceRevoke = device.client_instance_id;
          revoke.dataset.expectedGeneration = String(device.generation);
          revoke.setAttribute("aria-label", `Revoke ${device.client_instance_id === currentId ? "this browser" : "registered browser"}`);
          row.append(revoke);
        }
        container.append(row);
      }
    } catch {
      if (!container.isConnected) return;
      container.replaceChildren();
      const failure = document.createElement("p");
      failure.className = "settings-push-device-empty";
      failure.textContent = "Registered devices could not be loaded. Check your connection and refresh.";
      container.append(failure);
    }
  }

  async function getCurrentDeviceId() {
    const session = await getSession().catch(() => null);
    if (!session?.user?.id || !identity) return null;
    return identity.getExisting(session.user.id).catch(() => null);
  }

  window.NetraPush = Object.freeze({
    isConfigured,
    hasRegistered: () => registrationState === "registered",
    getRegistrationState: () => registrationState,
    registerCurrentDevice,
    revokeCurrentDevice,
    listDevices,
    isCurrentDevice,
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
        lastObservedFid = undefined;
        lastSubmittedFid = undefined;
        registrationOperationIds.clear();
        void retainDeactivationForAccount(lastKnownUserId);
      }
      lastKnownUserId = userId;
      void reconcileSignedInUser(userId);
    } else if (event.detail?.event === "SIGNED_OUT") {
      activeConsentContext = null;
      lastObservedFid = undefined;
      lastSubmittedFid = undefined;
      registrationOperationIds.clear();
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
    const deviceRevoke = event.target.closest("[data-push-device-revoke]");
    if (deviceRevoke) {
      const wrapper = deviceRevoke.closest("[data-push-settings]");
      const status = wrapper?.querySelector("[data-push-status]");
      if (!status || deviceRevoke.disabled) return;
      const targetId = deviceRevoke.dataset.pushDeviceRevoke;
      const generation = Number(deviceRevoke.dataset.expectedGeneration);
      if (!Number.isSafeInteger(generation) || !window.confirm("Revoke push notification consent for this device?")) return;
      deviceRevoke.disabled = true;
      try {
        const session = await getSession();
        if (!session?.user?.id) throw new Error("Sign in to manage registered devices.");
        const result = await revokeDevice(session.user.id, targetId, generation);
        if (!result?.ok) throw new Error("The server did not confirm device revocation.");
        status.textContent = "Device revocation was confirmed by the server.";
        await refreshDeviceList();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : "Device revocation could not be confirmed.";
      } finally { deviceRevoke.disabled = false; }
      return;
    }
    const enable = event.target.closest("[data-push-register]");
    const revoke = event.target.closest("[data-push-revoke]");
    const recover = event.target.closest("[data-push-recover]");
    const button = enable || revoke || recover;
    if (!button) return;
    const wrapper = button.closest("[data-push-settings]");
    const status = wrapper?.querySelector("[data-push-status]");
    if (!status) return;
    button.disabled = true;
    try {
      if (recover) {
        status.textContent = "Checking for a device already registered to this account…";
        await recoverPreviousDevice(recoveryButtonIntent);
        status.textContent = "The previous device record was recovered for this browser.";
      } else if (enable) {
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
    if (["registered", "paused", "revoked", "deactivation_unconfirmed"].includes(event.detail.state)) void refreshDeviceList();
  });
  window.addEventListener("netraos:settings-rendered", () => { void refreshDeviceList(); });
  window.addEventListener("netraos-auth-event", () => { void refreshDeviceList(); });
})();
