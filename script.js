const runAuditButton = document.getElementById("runAuditButton");
const createAccountForm = document.getElementById("createAccountForm");
const createAccountStatus = document.getElementById("createAccountStatus");
const signInForm = document.getElementById("signInForm");
const signInStatus = document.getElementById("signInStatus");
const signOutButton = document.getElementById("signOutButton");
const dashboardAuditButton = document.getElementById("dashboardAuditButton");
const dashboardStatus = document.getElementById("dashboardStatus");

const STORAGE_KEYS = {
  accounts: "lindenAccounts",
  session: "lindenCurrentSession",
  authToken: "lindenAuthToken",
};

const API_TIMEOUT_MS = 4000;

function loadAccounts() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.accounts);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function saveAccounts(accounts) {
  window.localStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(accounts));
}

function setSession(email) {
  window.localStorage.setItem(STORAGE_KEYS.session, email);
}

function clearSession() {
  window.localStorage.removeItem(STORAGE_KEYS.session);
}

function getSessionEmail() {
  return window.localStorage.getItem(STORAGE_KEYS.session);
}

function setAuthToken(token) {
  window.localStorage.setItem(STORAGE_KEYS.authToken, token);
}

function getAuthToken() {
  return window.localStorage.getItem(STORAGE_KEYS.authToken);
}

function clearAuthToken() {
  window.localStorage.removeItem(STORAGE_KEYS.authToken);
}

function findAccountByEmail(email) {
  const normalizedEmail = String(email).trim().toLowerCase();
  return loadAccounts().find((account) => account.email === normalizedEmail);
}

function populateDashboard(account) {
  const dashboardHeading = document.getElementById("dashboardHeading");
  const dashboardLead = document.getElementById("dashboardLead");
  const profileName = document.getElementById("profileName");
  const profileEmail = document.getElementById("profileEmail");
  const profileCompany = document.getElementById("profileCompany");
  const profileUseCase = document.getElementById("profileUseCase");

  if (!dashboardHeading || !dashboardLead || !profileName || !profileEmail || !profileCompany || !profileUseCase) {
    return;
  }

  dashboardHeading.textContent = `Welcome, ${account.name}`;
  dashboardLead.textContent = `Your Linden Assurance client space is ready for ${account.company}.`;
  profileName.textContent = account.name;
  profileEmail.textContent = account.email;
  profileCompany.textContent = account.company;
  profileUseCase.textContent = account.useCase;
}

async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const token = getAuthToken();
  const headers = {
    ...(options.headers || {}),
  };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(path, {
      ...options,
      headers,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || "API request failed.");
    }
    return data;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function tryBackendSignUp(payload) {
  return apiRequest("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function tryBackendSignIn(payload) {
  return apiRequest("/api/auth/signin", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function tryBackendMe() {
  return apiRequest("/api/auth/me");
}

async function tryBackendSignOut() {
  return apiRequest("/api/auth/signout", { method: "POST" });
}

async function tryBackendAudit(summary) {
  return apiRequest("/api/audits/request", {
    method: "POST",
    body: JSON.stringify({ summary }),
  });
}

if (runAuditButton) {
  runAuditButton.addEventListener("click", () => {
    window.location.href = "signup.html";
  });
}

if (createAccountForm && createAccountStatus) {
  createAccountForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(createAccountForm);
    const name = String(formData.get("name")).trim();
    const email = String(formData.get("email")).trim().toLowerCase();
    const company = String(formData.get("company")).trim();
    const password = String(formData.get("password"));
    const useCase = String(formData.get("use_case")).trim();
    const payload = {
      name,
      email,
      company,
      password,
      use_case: useCase,
    };

    try {
      const result = await tryBackendSignUp(payload);
      setAuthToken(result.token);
      setSession(result.user.email);
      createAccountStatus.textContent = "Backend account created. Redirecting to your dashboard...";
    } catch (error) {
      const accounts = loadAccounts();

      if (accounts.some((account) => account.email === email)) {
        createAccountStatus.textContent = "An account with that email already exists on this device. Try signing in instead.";
        return;
      }

      accounts.push({
        name,
        email,
        company,
        password,
        useCase,
        createdAt: new Date().toISOString(),
      });

      saveAccounts(accounts);
      setSession(email);
      createAccountStatus.textContent = "Local MVP account created. Redirecting to your dashboard...";
    }

    window.setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 700);
  });
}

if (signInForm && signInStatus) {
  signInForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(signInForm);
    const email = String(formData.get("email")).trim().toLowerCase();
    const password = String(formData.get("password"));
    try {
      const result = await tryBackendSignIn({ email, password });
      setAuthToken(result.token);
      setSession(result.user.email);
      signInStatus.textContent = "Backend sign in successful. Redirecting to your dashboard...";
    } catch (error) {
      const account = findAccountByEmail(email);

      if (!account || account.password !== password) {
        signInStatus.textContent = "That email or password does not match an account on this device.";
        return;
      }

      setSession(account.email);
      signInStatus.textContent = "Local MVP sign in successful. Redirecting to your dashboard...";
    }

    window.setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 700);
  });
}

if (window.location.pathname.endsWith("dashboard.html")) {
  (async () => {
    try {
      const result = await tryBackendMe();
      populateDashboard({
        ...result.user,
        useCase: result.user.use_case || result.user.useCase,
      });
      setSession(result.user.email);
      return;
    } catch (error) {
      clearAuthToken();
    }

    const sessionEmail = getSessionEmail();
    const activeAccount = sessionEmail ? findAccountByEmail(sessionEmail) : null;

    if (!activeAccount) {
      window.location.href = "signin.html";
    } else {
      populateDashboard(activeAccount);
    }
  })();
}

if (signOutButton) {
  signOutButton.addEventListener("click", async () => {
    try {
      await tryBackendSignOut();
    } catch (error) {
      // Fall back to local-only sign-out if the backend is unavailable.
    }
    clearAuthToken();
    clearSession();
    window.location.href = "signin.html";
  });
}

if (dashboardAuditButton && dashboardStatus) {
  dashboardAuditButton.addEventListener("click", async () => {
    const profileUseCase = document.getElementById("profileUseCase");
    const summary = profileUseCase ? profileUseCase.textContent.trim() : "";

    try {
      const result = await tryBackendAudit(summary);
      dashboardStatus.textContent = `${result.message} OpenAI key configured: ${result.openai_configured ? "yes" : "no"}.`;
      return;
    } catch (error) {
      dashboardStatus.textContent =
        "Audit review request noted for this MVP flow. Next step: connect this action to backend intake and case management.";
    }
  });
}
