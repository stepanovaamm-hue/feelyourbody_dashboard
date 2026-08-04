(function () {
  "use strict";

  const STORAGE_KEY = "fitbase-studio-dashboard-state-v1";
  const CLOUD_CONFIG = window.FITBASE_SUPABASE || {};
  const CLOUD_TABLE = CLOUD_CONFIG.table || "dashboard_state";
  const CLOUD_STATE_ID = CLOUD_CONFIG.stateId || "studio-main";
  const DATASETS = [
    "sales",
    "renewals",
    "schedules",
    "visits",
    "trials",
    "personals",
    "clients",
    "expenses",
    "plans",
    "marketing"
  ];
  const EXPENSE_CATEGORIES = [
    "Помещение",
    "Налоги",
    "Обслуживание",
    "Коммуникация",
    "Маркетинг",
    "Улучшения",
    "ЗП",
    "Возвраты",
    "Командообразование"
  ];
  const PRODUCT_TYPES = ["абонемент", "разовое", "пробное", "персональное"];
  const SEGMENTS = ["взрослые", "дети / подростки", "персональные"];
  const REPORT_REQUIREMENTS = [
    {
      key: "sales",
      label: "Продажи абонементов",
      source: "FitBase",
      missing: "загрузить продажи"
    },
    {
      key: "renewals",
      label: "Продления",
      source: "FitBase",
      missing: "загрузить продления"
    },
    {
      key: "schedules",
      label: "Расписание / загрузка",
      source: "FitBase",
      missing: "загрузить расписание"
    },
    {
      key: "visits",
      label: "Посещения",
      source: "FitBase",
      missing: "загрузить посещения"
    },
    {
      key: "trials",
      label: "Пробные занятия",
      source: "FitBase",
      missing: "загрузить пробные"
    },
    {
      key: "personals",
      label: "Персональные занятия",
      source: "FitBase",
      missing: "загрузить персональные"
    },
    {
      key: "clients",
      label: "Уникальные клиенты",
      source: "FitBase",
      missing: "загрузить клиентов"
    },
    {
      key: "expenses",
      label: "Расходы",
      source: "вручную",
      manual: true,
      missing: "внести расходы"
    },
    {
      key: "plans",
      label: "План продаж",
      source: "вручную",
      manual: true,
      missing: "внести план"
    },
    {
      key: "marketing",
      label: "Маркетинг месяца",
      source: "вручную",
      manual: true,
      missing: "внести активности"
    }
  ];

  let state = loadState();
  let filters = {
    month: "all",
    from: "",
    to: "",
    direction: "all",
    productType: "all",
    manager: "all",
    segment: "all",
    source: "all"
  };
  let cloud = {
    client: null,
    ready: false,
    user: null,
    status: "local",
    message: "Данные пока сохраняются только в этом браузере.",
    updatedAt: ""
  };
  let cloudSaveTimer = 0;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindTabs();
    bindFilters();
    bindDataActions();
    renderManualForms();
    render();
    initCloudStorage();
  }

  function emptyState() {
    return {
      meta: {
        period: "",
        note: "Данные можно загрузить из FitBase или ввести вручную."
      },
      sales: [],
      renewals: [],
      schedules: [],
      visits: [],
      trials: [],
      personals: [],
      clients: [],
      expenses: [],
      plans: [],
      marketing: []
    };
  }

  function loadState() {
    const initial = normalizeState(window.FITBASE_INITIAL_DATA || emptyState());
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return normalizeState(JSON.parse(saved));
    } catch (error) {
      console.warn("Не удалось прочитать localStorage", error);
    }
    return initial;
  }

  function normalizeState(source) {
    const normalized = Object.assign(emptyState(), clone(source || {}));
    DATASETS.forEach((key) => {
      if (!Array.isArray(normalized[key])) normalized[key] = [];
    });
    normalized.sales = normalized.sales.map((row) => normalizeLoadedRecord("sales", row));
    normalized.renewals = normalized.renewals.map((row) => normalizeLoadedRecord("renewals", row));
    normalized.schedules = normalized.schedules.map((row) => normalizeLoadedRecord("schedules", row));
    normalized.visits = normalized.visits.map((row) => normalizeLoadedRecord("visits", row));
    normalized.trials = normalized.trials.map((row) => normalizeLoadedRecord("trials", row));
    normalized.personals = normalized.personals.map((row) => normalizeLoadedRecord("personals", row));
    normalized.expenses = normalized.expenses.map((row) => normalizeLoadedRecord("expenses", row));
    normalized.plans = normalized.plans.map((row) => normalizeLoadedRecord("plans", row));
    normalized.marketing = normalized.marketing.map((row) => normalizeLoadedRecord("marketing", row));
    DATASETS.forEach((key) => {
      normalized[key] = dedupeRecords(normalized[key], key);
    });
    return normalized;
  }

  function normalizeLoadedRecord(type, row) {
    const record = Object.assign({}, row);
    record.id = record.id || `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (type === "sales") {
      record.quantity = toNumber(record.quantity || record.qty || record.count || 1);
      record.amount = toNumber(record.amount || record.sum || 0);
      record.productType = record.productType || classifyProduct(record.name || record.type || "");
      record.segment = record.segment || classifySegment(record.name || record.productType || "");
    }
    if (type === "renewals") {
      record.amount = toNumber(record.amount || record.renewalAmount || 0);
      record.finalPrice = toNumber(record.finalPrice || 0);
      record.fullPrice = toNumber(record.fullPrice || 0);
      record.productType = record.productType || classifyProduct(record.renewalName || record.membership || "");
    }
    if (type === "schedules") {
      record.capacity = toNumber(record.capacity || 0);
      record.booked = toNumber(record.booked || 0);
      record.attended = toNumber(record.attended || record.visits || 0);
      const rawOccupancy = firstFilled(record.occupancyPct, record.occupancy, record.fillRate, record.load);
      record.hasOccupancyPct = Boolean(record.hasOccupancyPct) || rawOccupancy !== "";
      record.occupancyPct = record.hasOccupancyPct ? normalizeOccupancy(rawOccupancy) : 0;
      if (!record.capacity && record.attended && record.occupancyPct) {
        record.capacity = record.attended / (record.occupancyPct / 100);
      }
      record.resolvedDirection = resolveDirection(record);
      record.segment = record.segment || "взрослые";
    }
    if (type === "visits") {
      record.visits = toNumber(record.visits || 1);
      record.segment = record.segment || classifySegment(record.membership || record.type || "");
    }
    if (type === "trials") {
      record.quantity = toNumber(record.quantity || 1);
      record.amount = toNumber(record.amount || 0);
      record.productType = "пробное";
      record.segment = record.segment || classifySegment(record.direction || "");
      record.converted = Boolean(record.converted) || yes(record.status);
    }
    if (type === "personals") {
      record.sessions = toNumber(record.sessions || record.quantity || 1);
      record.amount = toNumber(record.amount || 0);
      record.productType = "персональное";
      record.segment = "персональные";
    }
    if (type === "expenses") {
      record.amount = toNumber(record.amount || 0);
      record.category = record.category || "Прочее";
    }
    if (type === "plans") {
      record.salesPlan = toNumber(record.salesPlan || record.amount || 0);
    }
    if (type === "marketing") {
      record.budget = toNumber(record.budget || 0);
    }
    return record;
  }

  function dedupeRecords(rows, type) {
    const seen = new Set();
    return (rows || []).filter((row) => {
      const signature = [
        type,
        clean(row.client || row.clientName),
        clean(row.className || row.direction),
        clean(row.trainer),
        clean(row.name || row.membership || row.renewalName),
        clean(row.date || row.entryAt || row.purchaseDate || row.endDate || row.month),
        toNumber(row.amount),
        toNumber(row.quantity || row.visits || row.sessions || row.attended),
        clean(row.status)
      ].join("|").toLowerCase();
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }

  function saveState(options = {}) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!options.localOnly) queueCloudSave();
  }

  async function initCloudStorage() {
    if (!CLOUD_CONFIG.url || !CLOUD_CONFIG.anonKey) {
      setCloudStatus("local", "Supabase не настроен. Данные сохраняются только в этом браузере.");
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      setCloudStatus("error", "Supabase SDK не загрузился. Проверьте интернет и обновите страницу.");
      return;
    }

    cloud.client = window.supabase.createClient(CLOUD_CONFIG.url, CLOUD_CONFIG.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    });
    cloud.ready = true;
    setCloudStatus("auth", "Подключение к Supabase готово. Войдите, чтобы синхронизировать данные.");

    cloud.client.auth.onAuthStateChange((_event, session) => {
      cloud.user = session && session.user ? session.user : null;
      if (cloud.user) loadCloudState();
      else {
        setCloudStatus("auth", "Вы вышли из облака. Локальная копия осталась в браузере.");
        render();
      }
    });

    const { data, error } = await cloud.client.auth.getSession();
    if (error) {
      setCloudStatus("error", `Не удалось проверить вход: ${error.message}`);
      return;
    }
    cloud.user = data && data.session ? data.session.user : null;
    if (cloud.user) await loadCloudState();
    else render();
  }

  async function loadCloudState(options = {}) {
    if (!cloud.client || !cloud.user) return;
    setCloudStatus("sync", "Загружаю общие данные из Supabase...");
    const { data, error } = await cloud.client
      .from(CLOUD_TABLE)
      .select("data, updated_at")
      .eq("id", CLOUD_STATE_ID)
      .limit(1);

    if (error) {
      setCloudStatus("error", cloudErrorMessage(error));
      render();
      return;
    }

    const row = data && data[0] ? data[0] : null;
    const remoteState = row ? normalizeState(row.data || emptyState()) : emptyState();
    cloud.updatedAt = row && row.updated_at ? row.updated_at : "";

    if (!row || isStateEmpty(remoteState)) {
      setCloudStatus(
        "ready",
        "База подключена, но в облаке пока пусто. Можно отправить текущие локальные данные кнопкой ниже."
      );
      render();
      return;
    }

    state = remoteState;
    saveState({ localOnly: true });
    setCloudStatus("ready", `Данные загружены из облака${cloud.updatedAt ? `, обновлено ${formatDateTime(cloud.updatedAt)}` : ""}.`);
    render();

    if (options.force) {
      const status = document.getElementById("importStatus");
      if (status) status.textContent = "Общие данные загружены из Supabase.";
    }
  }

  function queueCloudSave() {
    if (!cloud.client || !cloud.user) return;
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(() => {
      saveCloudState({ silent: true });
    }, 900);
  }

  async function saveCloudState(options = {}) {
    if (!cloud.client) {
      setCloudStatus("error", "Supabase еще не подключен.");
      render();
      return;
    }
    if (!cloud.user) {
      setCloudStatus("auth", "Войдите в Supabase, чтобы сохранить данные в общем хранилище.");
      render();
      return;
    }

    if (!options.silent) setCloudStatus("sync", "Сохраняю данные в Supabase...");
    const now = new Date().toISOString();
    const payload = {
      id: CLOUD_STATE_ID,
      data: clone(state),
      updated_at: now,
      updated_by: cloud.user.id
    };
    const { error } = await cloud.client
      .from(CLOUD_TABLE)
      .upsert(payload, { onConflict: "id" });

    if (error) {
      setCloudStatus("error", cloudErrorMessage(error));
      render();
      return;
    }
    cloud.updatedAt = now;
    setCloudStatus("ready", `Сохранено в облаке ${formatDateTime(now)}.`);
    render();
  }

  function renderCloudPanel() {
    const container = document.getElementById("cloudPanel");
    if (!container) return;

    const configured = Boolean(CLOUD_CONFIG.url && CLOUD_CONFIG.anonKey);
    const userEmail = cloud.user && cloud.user.email ? cloud.user.email : "";
    const statusClass = `cloud-status ${escapeAttr(cloud.status)}`;
    const statusText = cloud.message || "Статус облака пока неизвестен.";

    if (!configured) {
      container.innerHTML = `
        <div class="${statusClass}">
          <strong>Локальный режим</strong>
          <span>Добавьте Supabase URL и anon key в supabase-config.js.</span>
        </div>
      `;
      return;
    }

    const actions = userEmail
      ? `
        <div class="cloud-user">
          <span>Вход: <strong>${escapeHtml(userEmail)}</strong></span>
          <button id="cloudPull" class="ghost" type="button">Загрузить из облака</button>
          <button id="cloudPush" class="primary" type="button">Отправить локальные данные</button>
          <button id="cloudSignOut" class="ghost" type="button">Выйти</button>
        </div>
      `
      : `
        <form id="cloudLoginForm" class="cloud-login">
          <label>Email
            <input id="cloudEmail" type="email" autocomplete="email" required>
          </label>
          <label>Пароль
            <input id="cloudPassword" type="password" autocomplete="current-password" required>
          </label>
          <button id="cloudSignIn" class="primary" type="submit">Войти</button>
        </form>
      `;

    container.innerHTML = `
      <div class="${statusClass}">
        <strong>${cloudStatusTitle()}</strong>
        <span>${escapeHtml(statusText)}</span>
      </div>
      ${actions}
    `;
    bindCloudPanelActions();
  }

  function bindCloudPanelActions() {
    const form = document.getElementById("cloudLoginForm");
    if (form) form.addEventListener("submit", handleCloudSignIn);
    const signOut = document.getElementById("cloudSignOut");
    if (signOut) signOut.addEventListener("click", handleCloudSignOut);
    const pull = document.getElementById("cloudPull");
    if (pull) pull.addEventListener("click", () => loadCloudState({ force: true }));
    const push = document.getElementById("cloudPush");
    if (push) push.addEventListener("click", () => saveCloudState({ silent: false }));
  }

  async function handleCloudSignIn(event) {
    event.preventDefault();
    if (!cloud.client) {
      await initCloudStorage();
      if (!cloud.client) return;
    }
    const email = clean(document.getElementById("cloudEmail").value);
    const password = document.getElementById("cloudPassword").value;
    if (!email || !password) return;

    setCloudStatus("sync", "Выполняю вход...");
    render();
    const { data, error } = await cloud.client.auth.signInWithPassword({ email, password });
    if (error) {
      setCloudStatus("error", `Не удалось войти: ${error.message}`);
      render();
      return;
    }
    cloud.user = data && data.user ? data.user : null;
    await loadCloudState();
  }

  async function handleCloudSignOut() {
    if (!cloud.client) return;
    await cloud.client.auth.signOut();
    cloud.user = null;
    setCloudStatus("auth", "Вы вышли из облака. Данные остаются в локальной копии.");
    render();
  }

  function setCloudStatus(status, message) {
    cloud.status = status;
    cloud.message = message;
    renderCloudPanel();
  }

  function cloudStatusTitle() {
    if (cloud.status === "ready") return "Облако подключено";
    if (cloud.status === "sync") return "Синхронизация";
    if (cloud.status === "error") return "Нужна настройка";
    if (cloud.status === "auth") return "Вход в общее хранилище";
    return "Локальный режим";
  }

  function cloudErrorMessage(error) {
    const message = error && error.message ? error.message : "неизвестная ошибка";
    const code = error && error.code ? error.code : "";
    if (code === "42P01" || /relation .* does not exist|Could not find the table/i.test(message)) {
      return "В Supabase еще нет таблицы dashboard_state. Выполните SQL из файла supabase-setup.sql.";
    }
    if (/row-level security|permission denied|violates row-level security/i.test(message)) {
      return "Нет доступа к общей базе. Проверьте, что ваш email добавлен в dashboard_allowed_users.";
    }
    return `Ошибка Supabase: ${message}`;
  }

  function isStateEmpty(value) {
    if (!value) return true;
    return DATASETS.every((key) => !Array.isArray(value[key]) || value[key].length === 0);
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function bindTabs() {
    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-tab]").forEach((item) => item.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
        button.classList.add("active");
        const panel = document.getElementById(`tab-${button.dataset.tab}`);
        if (panel) panel.classList.add("active");
      });
    });
  }

  function bindFilters() {
    document.getElementById("applyFilters").addEventListener("click", () => {
      filters = readFilters();
      render();
    });
    document.getElementById("resetFilters").addEventListener("click", () => {
      filters = {
        month: "all",
        from: "",
        to: "",
        direction: "all",
        productType: "all",
        manager: "all",
        segment: "all",
        source: "all"
      };
      render();
    });
  }

  function bindDataActions() {
    document.getElementById("importFiles").addEventListener("click", importFiles);
    document.getElementById("exportState").addEventListener("click", exportState);
    document.getElementById("restoreInitial").addEventListener("click", () => {
      state = normalizeState(window.FITBASE_INITIAL_DATA || emptyState());
      saveState();
      render();
    });
    document.getElementById("clearData").addEventListener("click", () => {
      if (!confirm("Очистить все данные дашборда?")) return;
      state = emptyState();
      saveState();
      render();
    });
    document.getElementById("copyReport").addEventListener("click", async () => {
      const text = document.getElementById("monthReportText").textContent;
      await navigator.clipboard.writeText(text);
    });
  }

  function readFilters() {
    return {
      month: valueOf("filterMonth") || "all",
      from: valueOf("filterFrom"),
      to: valueOf("filterTo"),
      direction: valueOf("filterDirection") || "all",
      productType: valueOf("filterProductType") || "all",
      manager: valueOf("filterManager") || "all",
      segment: valueOf("filterSegment") || "all",
      source: valueOf("filterSource") || "all"
    };
  }

  function render() {
    refreshFilterOptions();
    const data = getFilteredData();
    const metrics = computeMetrics(data);
    const directionStats = buildDirectionStats(data);
    const salesStats = buildSalesStats(data);
    const recommendations = buildRecommendations(data, metrics, directionStats, salesStats);
    const managementAnswers = buildManagementAnswers(data, metrics, directionStats);
    const efficiencyAnalytics = buildEfficiencyAnalytics(data, metrics);

    renderHeaderNote();
    renderDashboard(data, metrics, directionStats, recommendations);
    renderSales(data, metrics, salesStats);
    renderAttendance(data, metrics, directionStats);
    renderEfficiency(efficiencyAnalytics);
    renderFunnel(data, metrics);
    renderClients(data, metrics);
    renderExpenses(data, metrics);
    renderRecommendations(recommendations, managementAnswers);
    renderMonthReport(data, metrics, directionStats, salesStats, recommendations);
    renderDataStats(data);
  }

  function renderHeaderNote() {
    const note = state.meta && state.meta.note ? state.meta.note : "";
    const counts = DATASETS.map((key) => `${labelForDataset(key)}: ${state[key].length}`).join("; ");
    document.getElementById("dataNote").textContent = `${note} Сейчас в базе: ${counts}.`;
    const badge = document.getElementById("periodBadge");
    if (badge) badge.textContent = selectedPeriodLabel();
  }

  function refreshFilterOptions() {
    const months = Array.from(collectMonths()).sort();
    if (filters.month === "all" && state.meta && state.meta.period && months.includes(state.meta.period)) {
      filters.month = state.meta.period;
    } else if (months.length === 1 && filters.month === "all") {
      filters.month = months[0];
    }

    setOptions("filterMonth", [["all", "Все месяцы"]].concat(months.map((m) => [m, monthLabel(m)])), filters.month);
    setOptions("filterDirection", [["all", "Все направления"]].concat(directionValuesFromState().map((v) => [v, v])), filters.direction);
    setOptions("filterProductType", [["all", "Все типы"]].concat(PRODUCT_TYPES.map((v) => [v, v])), filters.productType);
    setOptions("filterManager", [["all", "Все менеджеры"]].concat(valuesFromState(["manager"]).map((v) => [v, v])), filters.manager);
    setOptions("filterSegment", [["all", "Все сегменты"]].concat(SEGMENTS.map((v) => [v, v])), filters.segment);
    setOptions("filterSource", [["all", "Все источники"]].concat(valuesFromState(["source", "sourceFile"]).map((v) => [v, v])), filters.source);
    document.getElementById("filterFrom").value = filters.from;
    document.getElementById("filterTo").value = filters.to;
  }

  function setOptions(id, options, selected) {
    const select = document.getElementById(id);
    select.innerHTML = options
      .map(([value, label]) => `<option value="${escapeAttr(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`)
      .join("");
  }

  function collectMonths() {
    const months = new Set();
    DATASETS.forEach((key) => {
      state[key].forEach((row) => {
        const month = recordMonth(row, key);
        if (month) months.add(month);
      });
    });
    if (state.meta && state.meta.period) months.add(state.meta.period);
    return months;
  }

  function valuesFromState(fields) {
    const values = new Set();
    DATASETS.forEach((key) => {
      state[key].forEach((row) => {
        fields.forEach((field) => {
          const value = clean(row[field]);
          if (value) values.add(value);
        });
      });
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "ru"));
  }

  function directionValuesFromState() {
    const values = new Set();
    DATASETS.forEach((key) => {
      state[key].forEach((row) => {
        const value = resolveDirection(row);
        if (value && value !== "Без направления") values.add(value);
      });
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, "ru"));
  }

  function getFilteredData() {
    const result = {};
    DATASETS.forEach((key) => {
      result[key] = state[key].filter((row) => matchesFilters(row, key));
    });
    return result;
  }

  function matchesFilters(row, type) {
    const date = recordDate(row, type);
    const month = recordMonth(row, type);
    if (filters.month !== "all" && month && month !== filters.month) return false;
    if (filters.month !== "all" && !month && type !== "clients") return false;
    if (filters.from && (!date || date < filters.from)) return false;
    if (filters.to && (!date || date > filters.to)) return false;
    if (!matchesDirectionFilter(filters.direction, row)) return false;
    if (!matchesValue(filters.manager, row.manager)) return false;
    if (!matchesValue(filters.segment, row.segment)) return false;
    if (!matchesValue(filters.source, row.source || row.sourceFile)) return false;
    if (filters.productType !== "all") {
      const productType = row.productType || classifyProduct(row.name || row.renewalName || row.membership || row.type || "");
      if (productType !== filters.productType) return false;
    }
    return true;
  }

  function matchesValue(filterValue, actualValue) {
    if (!filterValue || filterValue === "all") return true;
    return clean(actualValue).toLowerCase() === clean(filterValue).toLowerCase();
  }

  function matchesDirectionFilter(filterValue, row) {
    if (!filterValue || filterValue === "all") return true;
    return [resolveDirection(row), row.direction, row.className].some((value) => matchesValue(filterValue, value));
  }

  function recordDate(row, type) {
    if (type === "renewals") return dateOnly(row.purchaseDate || row.endDate);
    if (type === "visits") return dateOnly(row.date || row.entryAt);
    if (type === "plans" || type === "marketing") return row.month ? `${row.month}-01` : "";
    if (type === "clients") return dateOnly(row.firstSeen || row.createdAt || row.lastVisit);
    return dateOnly(row.date || row.endDate || row.purchaseDate);
  }

  function recordMonth(row, type) {
    if ((type === "plans" || type === "marketing") && row.month) return row.month;
    return monthKey(recordDate(row, type));
  }

  function timeSlotLabel(value) {
    const parsed = parseDate(value);
    if (parsed && parsed.includes("T")) return parsed.slice(11, 16);
    return "Без времени";
  }

  function computeMetrics(data) {
    const salesRevenue = sum(data.sales, "amount");
    const renewalRevenue = sum(data.renewals, "amount");
    const personalRevenue = sum(data.personals, "amount");
    const revenue = salesRevenue > 0 ? salesRevenue + personalRevenue : renewalRevenue + personalRevenue;
    const expensesTotal = sum(data.expenses, "amount");
    const profit = revenue - expensesTotal;
    const membershipsSold = sum(data.sales.filter((row) => row.productType === "абонемент"), "quantity");
    const trialsFromSales = sum(data.sales.filter((row) => row.productType === "пробное"), "quantity");
    const trialsFromRows = data.trials.length ? sum(data.trials, "quantity") : 0;
    const convertedTrialRows = data.trials.filter((row) => row.converted || yes(row.status)).length;
    const convertedTrialRenewals = data.renewals.filter((row) => includes(row.membership, "проб") && isRenewed(row)).length;
    const convertedTrials = convertedTrialRows + convertedTrialRenewals;
    const trialsTotal = Math.max(trialsFromSales, trialsFromRows, convertedTrials);
    const scheduleAttended = sum(data.schedules, "attended");
    const scheduleCapacity = sum(data.schedules, "capacity");
    const visitRows = data.visits.length ? sum(data.visits, "visits") : 0;
    const attendanceTotal = scheduleAttended || visitRows;
    const avgOccupancy = weightedOccupancy(data.schedules);
    const uniqueClients = countUniqueClients(data);
    const renewed = data.renewals.filter(isRenewed).length;
    const notRenewed = data.renewals.filter(isNotRenewed).length;
    const endingSoon = data.renewals.filter(isEndingSoon).length;
    const plan = currentPlan(data);
    const conversion = trialsTotal ? (convertedTrials / trialsTotal) * 100 : 0;

    return {
      salesRevenue,
      renewalRevenue,
      personalRevenue,
      revenue,
      expensesTotal,
      profit,
      margin: revenue ? (profit / revenue) * 100 : 0,
      membershipsSold,
      trialsTotal,
      convertedTrials,
      conversion,
      attendanceTotal,
      avgOccupancy,
      uniqueClients,
      renewed,
      notRenewed,
      endingSoon,
      plan,
      planGap: plan ? plan - revenue : 0
    };
  }

  function currentPlan(data) {
    if (!data.plans.length) return 0;
    return data.plans.reduce((total, row) => total + toNumber(row.salesPlan), 0);
  }

  function countUniqueClients(data) {
    const names = new Set();
    ["clients", "visits", "renewals", "trials", "personals", "sales"].forEach((key) => {
      data[key].forEach((row) => {
        const name = clean(row.client || row.clientName);
        if (name) names.add(name.toLowerCase());
      });
    });
    return names.size;
  }

  function weightedOccupancy(rows) {
    const total = rows.reduce((accumulator, row) => {
      const measure = scheduleOccupancyMeasure(row);
      accumulator.value += measure.percent * measure.weight;
      accumulator.weight += measure.weight;
      return accumulator;
    }, { value: 0, weight: 0 });
    return total.weight ? total.value / total.weight : 0;
  }

  function scheduleOccupancyMeasure(row) {
    const capacity = toNumber(row.capacity);
    const attended = toNumber(row.attended);
    if (capacity > 0) {
      return {
        percent: (attended / capacity) * 100,
        weight: capacity,
        hasOccupancy: true
      };
    }
    if (row.hasOccupancyPct) {
      return {
        percent: toNumber(row.occupancyPct),
        weight: 1,
        hasOccupancy: true
      };
    }
    return { percent: 0, weight: 0, hasOccupancy: false };
  }

  function buildDirectionStats(data) {
    const groups = new Map();
    data.schedules.forEach((row) => {
      const key = resolveDirection(row);
      const item = groups.get(key) || {
        direction: key,
        classes: 0,
        capacity: 0,
        booked: 0,
        attended: 0,
        visits: 0,
        occupancyValue: 0,
        occupancyWeight: 0,
        hasOccupancy: false
      };
      const measure = scheduleOccupancyMeasure(row);
      item.classes += 1;
      item.capacity += toNumber(row.capacity);
      item.booked += toNumber(row.booked);
      item.attended += toNumber(row.attended);
      item.occupancyValue += measure.percent * measure.weight;
      item.occupancyWeight += measure.weight;
      item.hasOccupancy = item.hasOccupancy || measure.hasOccupancy;
      groups.set(key, item);
    });
    data.visits.forEach((row) => {
      const key = resolveDirection(row);
      const item = groups.get(key) || {
        direction: key,
        classes: 0,
        capacity: 0,
        booked: 0,
        attended: 0,
        visits: 0,
        occupancyValue: 0,
        occupancyWeight: 0,
        hasOccupancy: false
      };
      item.visits += toNumber(row.visits || 1);
      groups.set(key, item);
    });
    return Array.from(groups.values())
      .map((item) => {
        item.occupancy = item.occupancyWeight ? item.occupancyValue / item.occupancyWeight : 0;
        item.zone = occupancyZone(item.occupancy);
        return item;
      })
      .sort((a, b) => b.attended - a.attended || b.visits - a.visits);
  }

  function buildClassStats(data) {
    const groups = new Map();
    data.schedules.forEach((row) => {
      const key = clean(row.className || row.direction || "Без занятия");
      const item = groups.get(key) || {
        className: key,
        direction: resolveDirection(row),
        classes: 0,
        capacity: 0,
        booked: 0,
        attended: 0,
        occupancyValue: 0,
        occupancyWeight: 0,
        hasOccupancy: false
      };
      const measure = scheduleOccupancyMeasure(row);
      item.classes += 1;
      item.capacity += toNumber(row.capacity);
      item.booked += toNumber(row.booked);
      item.attended += toNumber(row.attended);
      item.occupancyValue += measure.percent * measure.weight;
      item.occupancyWeight += measure.weight;
      item.hasOccupancy = item.hasOccupancy || measure.hasOccupancy;
      groups.set(key, item);
    });
    return Array.from(groups.values())
      .map((item) => {
        item.occupancy = item.occupancyWeight ? item.occupancyValue / item.occupancyWeight : 0;
        item.zone = occupancyZone(item.occupancy);
        return item;
      })
      .sort((a, b) => b.attended - a.attended);
  }

  function buildSalesStats(data) {
    const byName = new Map();
    const byType = new Map();
    const byMonth = new Map();
    data.sales.forEach((row) => {
      addSalesGroup(byName, clean(row.name || "Без названия"), row);
      addSalesGroup(byType, row.productType || classifyProduct(row.name || row.type || ""), row);
      addSalesGroup(byMonth, recordMonth(row, "sales") || "Без месяца", row);
    });
    const names = Array.from(byName.values()).sort((a, b) => b.amount - a.amount);
    const types = Array.from(byType.values()).sort((a, b) => b.amount - a.amount);
    const months = Array.from(byMonth.values()).sort((a, b) => a.name.localeCompare(b.name));
    return { names, types, months };
  }

  function addSalesGroup(map, key, row) {
    const item = map.get(key) || { name: key, quantity: 0, amount: 0 };
    item.quantity += toNumber(row.quantity);
    item.amount += toNumber(row.amount);
    map.set(key, item);
  }

  function buildEfficiencyAnalytics(data, metrics) {
    return {
      directions: buildEfficiencyRows(data, metrics, "direction"),
      trainers: buildEfficiencyRows(data, metrics, "trainer")
    };
  }

  function buildEfficiencyRows(data, metrics, entityType) {
    const groups = new Map();

    data.schedules.forEach((row) => {
      const name = efficiencyEntityName(row, entityType);
      if (!name) return;
      const item = ensureEfficiencyItem(groups, name);
      const measure = scheduleOccupancyMeasure(row);
      addScheduleLoad(item, row);
      item.occupancySamples.push(measure.hasOccupancy ? measure.percent : 0);
      addMapValue(item.scheduleMonths, recordMonth(row, "schedules") || "Без месяца", toNumber(row.attended));
    });

    data.visits.forEach((row) => {
      const name = efficiencyEntityName(row, entityType);
      if (!name) return;
      const item = ensureEfficiencyItem(groups, name);
      const visits = toNumber(row.visits || 1) || 1;
      item.visits += visits;
      addMapValue(item.visitMonths, recordMonth(row, "visits") || "Без месяца", visits);
      addClientTouch(item, row.client, visits);
      item.visitSessions.add(visitSessionKey(row, entityType));
    });

    const revenueRows = metrics.salesRevenue > 0 ? data.sales.concat(data.personals) : data.renewals.concat(data.personals);
    const activityByEntity = new Map();
    groups.forEach((item, name) => {
      const activity = item.attended || item.visits;
      if (activity > 0) activityByEntity.set(name, activity);
    });
    const revenueByEntity = splitMoneyByEntity(revenueRows, metrics.revenue, activityByEntity, entityType);
    const trialConversion = buildTrialConversionByEntity(data, entityType);
    const purchaseRenewal = buildPurchaseRenewalByEntity(data, entityType);

    const allNames = new Set([...groups.keys(), ...revenueByEntity.keys(), ...trialConversion.keys(), ...purchaseRenewal.keys()]);
    return Array.from(allNames).map((name) => {
      const item = groups.get(name) || ensureEfficiencyItem(groups, name);
      finalizeLoadItem(item);
      const inferredClasses = item.classes || item.visitSessions.size;
      const attendanceTotal = item.attended || item.visits;
      const trial = trialConversion.get(name) || { base: 0, converted: 0 };
      const purchase = purchaseRenewal.get(name) || { base: 0, converted: 0 };
      const revenue = revenueByEntity.get(name) || 0;
      const uniqueClients = item.clients.size;
      const regularClients = Array.from(item.clients.values()).filter((count) => count >= 2).length;
      const hasOccupancy = item.hasOccupancy;
      const stability = item.occupancySamples.length ? stabilityIndex(item.occupancySamples) : 0;
      const row = {
        name,
        classes: inferredClasses,
        hasOccupancy,
        avgOccupancy: hasOccupancy ? item.occupancy : 0,
        avgParticipants: inferredClasses ? attendanceTotal / inferredClasses : 0,
        trialBase: trial.base,
        trialConverted: trial.converted,
        trialConversion: trial.base ? (trial.converted / trial.base) * 100 : 0,
        purchaseBase: purchase.base,
        purchaseConverted: purchase.converted,
        purchaseRenewalConversion: purchase.base ? (purchase.converted / purchase.base) * 100 : 0,
        avgMonthlyAttendance: averageMapValue(item.scheduleMonths.size ? item.scheduleMonths : item.visitMonths),
        uniqueClients,
        regularClients,
        regularShare: uniqueClients ? (regularClients / uniqueClients) * 100 : 0,
        revenue,
        revenuePerClass: inferredClasses ? revenue / inferredClasses : 0,
        stabilityBase: item.occupancySamples.length,
        stabilityIndex: stability,
        _class: hasOccupancy ? efficiencyStatusClass(item.occupancy, stability) : ""
      };
      row.sortRisk = (hasOccupancy ? 100 - row.avgOccupancy : 25) + (row.stabilityBase ? 100 - row.stabilityIndex : 25) + (100 - row.purchaseRenewalConversion) * 0.25;
      return row;
    }).sort((a, b) => b.sortRisk - a.sortRisk || b.revenuePerClass - a.revenuePerClass);
  }

  function ensureEfficiencyItem(groups, name) {
    const item = groups.get(name) || createLoadItem({
      name,
      visits: 0,
      visitSessions: new Set(),
      clients: new Map(),
      scheduleMonths: new Map(),
      visitMonths: new Map(),
      occupancySamples: []
    });
    groups.set(name, item);
    return item;
  }

  function efficiencyEntityName(row, entityType) {
    if (entityType === "trainer") {
      const trainer = clean(row.trainer);
      return isRealTrainer(trainer) ? trainer : "";
    }
    return businessDirection(row) || resolveDirection(row);
  }

  function efficiencyEntityFromClient(row, data, entityType) {
    const direct = efficiencyEntityName(row, entityType);
    if (direct && direct !== "Без направления") return direct;
    const visit = findClientVisit(row.client, row.date || row.purchaseDate || row.endDate, data);
    return visit ? efficiencyEntityName(visit, entityType) : (entityType === "direction" ? "Без направления" : "");
  }

  function buildTrialConversionByEntity(data, entityType) {
    const groups = new Map();
    const addTrial = (row, count, converted) => {
      const name = efficiencyEntityFromClient(row, data, entityType);
      if (!name) return;
      const item = groups.get(name) || { base: 0, converted: 0 };
      item.base += count;
      item.converted += converted;
      groups.set(name, item);
    };

    data.trials.forEach((row) => {
      const count = toNumber(row.quantity || 1) || 1;
      addTrial(row, count, row.converted || yes(row.status) || row.purchaseDate || toNumber(row.amount) > 0 ? count : 0);
    });
    data.sales.filter(isTrialSale).forEach((row) => {
      const count = toNumber(row.quantity || 1) || 1;
      addTrial(row, count, hasPaidAfterTrial(row.client, row.date, data) ? count : 0);
    });
    data.renewals.filter((row) => includes(row.membership, "проб")).forEach((row) => {
      addTrial(row, 1, isRenewed(row) ? 1 : 0);
    });
    return groups;
  }

  function buildPurchaseRenewalByEntity(data, entityType) {
    const groups = new Map();
    data.sales.filter((row) => !isTrialSale(row) && toNumber(row.amount) > 0 && row.client).forEach((row) => {
      const name = efficiencyEntityFromClient(row, data, entityType);
      if (!name) return;
      const count = toNumber(row.quantity || 1) || 1;
      const item = groups.get(name) || { base: 0, converted: 0 };
      item.base += count;
      item.converted += hasRenewalAfterPurchase(row.client, row.date, data) ? count : 0;
      groups.set(name, item);
    });
    return groups;
  }

  function splitMoneyByEntity(rows, totalAmount, activityByEntity, entityType) {
    const result = new Map();
    let unassigned = 0;
    rows.forEach((row) => {
      const amount = toNumber(row.amount || row.budget || 0);
      if (!amount) return;
      const name = efficiencyEntityName(row, entityType);
      if (name && name !== "Без направления") result.set(name, (result.get(name) || 0) + amount);
      else unassigned += amount;
    });
    if (!rows.length && totalAmount) unassigned = totalAmount;
    const activityTotal = Array.from(activityByEntity.values()).reduce((total, value) => total + value, 0);
    if (unassigned && activityTotal) {
      activityByEntity.forEach((activity, name) => {
        result.set(name, (result.get(name) || 0) + unassigned * (activity / activityTotal));
      });
    }
    return result;
  }

  function addClientTouch(item, client, count) {
    const key = clientKey(client);
    if (!key) return;
    item.clients.set(key, (item.clients.get(key) || 0) + count);
  }

  function addMapValue(map, key, value) {
    if (!key || !value) return;
    map.set(key, (map.get(key) || 0) + value);
  }

  function averageMapValue(map) {
    const values = Array.from(map.values());
    return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
  }

  function stabilityIndex(values) {
    const samples = values.filter((value) => Number.isFinite(value));
    if (!samples.length) return 0;
    if (samples.length === 1) return 100;
    const average = samples.reduce((total, value) => total + value, 0) / samples.length;
    if (!average) return 0;
    const variance = samples.reduce((total, value) => total + Math.pow(value - average, 2), 0) / samples.length;
    const cv = Math.sqrt(variance) / average;
    return Math.max(0, Math.min(100, 100 - cv * 100));
  }

  function efficiencyStatusClass(occupancy, stability) {
    if (occupancy < 30 || stability < 35) return "status-red";
    if (occupancy < 50 || stability < 60) return "status-yellow";
    return "status-green";
  }

  function visitSessionKey(row, entityType) {
    const date = dateOnly(row.date || row.entryAt);
    const time = timeSlotLabel(row.entryAt || row.date);
    const trainer = clean(row.trainer || "");
    const direction = resolveDirection(row);
    return entityType === "trainer" ? `${date}-${time}-${trainer}-${direction}` : `${date}-${time}-${direction}`;
  }

  function findClientVisit(client, date, data) {
    const key = clientKey(client);
    if (!key) return null;
    const baseDate = dateOnly(date);
    const visits = data.visits.filter((row) => clientKey(row.client) === key);
    if (!visits.length) return null;
    return visits
      .map((row) => ({ row, distance: Math.abs(daysBetween(baseDate, dateOnly(row.date || row.entryAt))) }))
      .filter((item) => !baseDate || item.distance <= 45)
      .sort((a, b) => a.distance - b.distance)[0]?.row || visits[0];
  }

  function hasRenewalAfterPurchase(client, date, data) {
    const key = clientKey(client);
    const purchaseDate = dateOnly(date);
    if (!key || !purchaseDate) return false;
    return data.renewals.some((row) => clientKey(row.client) === key && isRenewed(row) && isAfter(row.purchaseDate || row.endDate, purchaseDate))
      || data.sales.some((row) => clientKey(row.client) === key && !isTrialSale(row) && toNumber(row.amount) > 0 && isAfter(row.date, purchaseDate));
  }

  function isRealTrainer(value) {
    const text = clean(value).toLowerCase();
    return Boolean(text) && text !== "нет" && text !== "без тренера";
  }

  function buildManagementAnswers(data, metrics, directionStats) {
    return {
      timeUnderload: buildTimeUnderload(data),
      trainerUnderload: buildTrainerUnderload(data),
      directionUnderload: buildDirectionUnderload(directionStats),
      trialConversion: buildTrialConversionStats(data),
      directionProfitability: buildDirectionProfitability(data, metrics, directionStats),
      trainerRetention: buildTrainerRetention(data),
      groupActions: buildGroupActions(data)
    };
  }

  function buildTimeUnderload(data) {
    const groups = new Map();
    data.schedules.forEach((row) => {
      const key = timeSlotLabel(row.date);
      const item = groups.get(key) || createLoadItem({ time: key });
      addScheduleLoad(item, row);
      groups.set(key, item);
    });
    return Array.from(groups.values())
      .map(finalizeLoadItem)
      .filter((row) => row.hasOccupancy && row.occupancy < 50)
      .sort((a, b) => a.occupancy - b.occupancy || b.classes - a.classes)
      .map((row) => Object.assign(row, {
        action: row.occupancy < 30 ? "убрать, объединить или перенести слот" : "проверить время и прогрев группы",
        _class: row.zone.className
      }));
  }

  function buildTrainerUnderload(data) {
    const groups = new Map();
    data.schedules.forEach((row) => {
      const trainer = clean(row.trainer || "Без тренера");
      const item = groups.get(trainer) || createLoadItem({ trainer });
      addScheduleLoad(item, row);
      groups.set(trainer, item);
    });
    return Array.from(groups.values())
      .map(finalizeLoadItem)
      .filter((row) => row.trainer !== "Без тренера" && row.hasOccupancy && row.occupancy < 50)
      .sort((a, b) => a.occupancy - b.occupancy || b.classes - a.classes)
      .map((row) => Object.assign(row, {
        action: row.occupancy < 30 ? "разобрать расписание, формат и коммуникацию" : "помочь добором и проверить удобство слотов",
        _class: row.zone.className
      }));
  }

  function buildDirectionUnderload(directionStats) {
    return directionStats
      .filter((row) => row.hasOccupancy && row.occupancy < 50)
      .map((row) => Object.assign({}, row, {
        action: row.occupancy < 30 ? "пересобрать оффер или объединить группы" : "усилить набор и проверить расписание",
        _class: row.zone.className
      }))
      .sort((a, b) => a.occupancy - b.occupancy || b.classes - a.classes);
  }

  function buildTrialConversionStats(data) {
    const groups = new Map();
    const addTrial = (row, count, converted) => {
      const direction = trialDirection(row, data);
      const item = groups.get(direction) || { direction, trials: 0, converted: 0 };
      item.trials += count;
      item.converted += converted;
      groups.set(direction, item);
    };

    data.trials.forEach((row) => {
      const count = toNumber(row.quantity || 1) || 1;
      const converted = row.converted || yes(row.status) || row.purchaseDate || toNumber(row.amount) > 0 ? count : 0;
      addTrial(row, count, converted);
    });

    data.sales.filter(isTrialSale).forEach((row) => {
      const count = toNumber(row.quantity || 1) || 1;
      const converted = hasPaidAfterTrial(row.client, row.date, data) ? count : 0;
      addTrial(row, count, converted);
    });

    data.renewals.filter((row) => includes(row.membership, "проб")).forEach((row) => {
      addTrial(row, 1, isRenewed(row) ? 1 : 0);
    });

    return Array.from(groups.values())
      .map((row) => {
        row.conversion = row.trials ? (row.converted / row.trials) * 100 : 0;
        row.action = row.conversion < 40 ? "проверить скрипт, оффер и сообщение после пробного" : "масштабировать источник пробных";
        row._class = row.conversion < 40 ? "status-red" : row.conversion < 60 ? "status-yellow" : "status-green";
        return row;
      })
      .sort((a, b) => a.conversion - b.conversion || b.trials - a.trials);
  }

  function buildDirectionProfitability(data, metrics, directionStats) {
    const activityByDirection = new Map();
    directionStats.forEach((row) => {
      const activity = toNumber(row.attended || row.visits || 0);
      if (activity > 0) activityByDirection.set(row.direction, activity);
    });

    const revenueRows = metrics.salesRevenue > 0 ? data.sales.concat(data.personals) : data.renewals.concat(data.personals);
    const revenue = splitMoneyByDirection(revenueRows, metrics.revenue, activityByDirection);
    const expenses = splitMoneyByDirection(data.expenses, metrics.expensesTotal, activityByDirection);
    const directions = new Set([...activityByDirection.keys(), ...revenue.keys(), ...expenses.keys()]);

    return Array.from(directions).map((direction) => {
      const rowRevenue = revenue.get(direction) || 0;
      const rowExpenses = expenses.get(direction) || 0;
      const profit = rowRevenue - rowExpenses;
      const margin = rowRevenue ? (profit / rowRevenue) * 100 : 0;
      return {
        direction,
        revenue: rowRevenue,
        expenses: rowExpenses,
        profit,
        margin,
        action: metrics.expensesTotal ? (profit < 0 ? "искать причину убытка или менять расписание" : "держать и масштабировать") : "внести расходы для чистой прибыльности",
        _class: profit < 0 ? "status-red" : margin < 20 ? "status-yellow" : "status-green"
      };
    }).sort((a, b) => a.profit - b.profit);
  }

  function buildTrainerRetention(data) {
    const groups = new Map();
    data.visits.forEach((row) => {
      const trainer = clean(row.trainer || "");
      const client = clientKey(row.client);
      if (!trainer || !client) return;
      const item = groups.get(trainer) || { trainer, clients: new Map() };
      const clientRow = item.clients.get(client) || { visits: 0, firstDate: dateOnly(row.date || row.entryAt), name: clean(row.client) };
      clientRow.visits += toNumber(row.visits || 1) || 1;
      const visitDate = dateOnly(row.date || row.entryAt);
      if (visitDate && (!clientRow.firstDate || visitDate < clientRow.firstDate)) clientRow.firstDate = visitDate;
      item.clients.set(client, clientRow);
      groups.set(trainer, item);
    });

    return Array.from(groups.values()).map((item) => {
      const clients = Array.from(item.clients.values());
      const retained = clients.filter((client) => client.visits >= 2 || hasPaidAfterTrial(client.name, client.firstDate, data)).length;
      const retention = clients.length ? (retained / clients.length) * 100 : 0;
      return {
        trainer: item.trainer,
        clients: clients.length,
        retained,
        retention,
        action: retention >= 60 ? "разобрать практики и тиражировать" : "проверить контакт после занятия и повторную запись",
        _class: retention < 40 ? "status-red" : retention < 60 ? "status-yellow" : "status-green"
      };
    }).sort((a, b) => b.retention - a.retention || b.clients - a.clients);
  }

  function buildGroupActions(data) {
    const groups = new Map();
    data.schedules.forEach((row) => {
      const className = clean(row.className || row.direction || "Без занятия");
      const item = groups.get(className) || createLoadItem({
        className,
        direction: resolveDirection(row),
        trainers: new Map(),
        times: new Map()
      });
      addScheduleLoad(item, row);
      addCount(item.trainers, clean(row.trainer || "Без тренера"));
      addCount(item.times, timeSlotLabel(row.date));
      groups.set(className, item);
    });

    return Array.from(groups.values())
      .map((item) => {
        const row = finalizeLoadItem(item);
        row.trainer = mostCommon(row.trainers);
        row.time = mostCommon(row.times);
        row.avgAttendance = row.classes ? row.attended / row.classes : 0;
        row.action = groupAction(row);
        row._class = row.zone.className;
        return row;
      })
      .filter((row) => row.hasOccupancy && (row.occupancy < 50 || row.avgAttendance < 4))
      .sort((a, b) => a.occupancy - b.occupancy || a.avgAttendance - b.avgAttendance);
  }

  function createLoadItem(extra) {
    return Object.assign({
      classes: 0,
      capacity: 0,
      booked: 0,
      attended: 0,
      occupancyValue: 0,
      occupancyWeight: 0,
      hasOccupancy: false
    }, extra);
  }

  function addScheduleLoad(item, row) {
    const measure = scheduleOccupancyMeasure(row);
    item.classes += 1;
    item.capacity += toNumber(row.capacity);
    item.booked += toNumber(row.booked);
    item.attended += toNumber(row.attended);
    item.occupancyValue += measure.percent * measure.weight;
    item.occupancyWeight += measure.weight;
    item.hasOccupancy = item.hasOccupancy || measure.hasOccupancy;
  }

  function finalizeLoadItem(item) {
    item.occupancy = item.occupancyWeight ? item.occupancyValue / item.occupancyWeight : 0;
    item.zone = occupancyZone(item.occupancy);
    return item;
  }

  function splitMoneyByDirection(rows, totalAmount, activityByDirection) {
    const result = new Map();
    let unassigned = 0;
    rows.forEach((row) => {
      const amount = toNumber(row.amount || row.budget || 0);
      if (!amount) return;
      const direction = businessDirection(row);
      if (direction) result.set(direction, (result.get(direction) || 0) + amount);
      else unassigned += amount;
    });
    if (!rows.length && totalAmount) unassigned = totalAmount;
    const activityTotal = Array.from(activityByDirection.values()).reduce((total, value) => total + value, 0);
    if (unassigned && activityTotal) {
      activityByDirection.forEach((activity, direction) => {
        result.set(direction, (result.get(direction) || 0) + unassigned * (activity / activityTotal));
      });
    }
    return result;
  }

  function trialDirection(row, data) {
    const direct = businessDirection(row);
    if (direct) return direct;
    const client = clientKey(row.client);
    if (!client) return "Без направления";
    const trialDate = dateOnly(row.date || row.purchaseDate || row.endDate);
    const visit = data.visits.find((visitRow) => clientKey(visitRow.client) === client && (!trialDate || Math.abs(daysBetween(trialDate, dateOnly(visitRow.date || visitRow.entryAt))) <= 14));
    return visit ? businessDirection(visit) || resolveDirection(visit) : "Без направления";
  }

  function hasPaidAfterTrial(client, date, data) {
    const key = clientKey(client);
    if (!key) return false;
    const trialDate = dateOnly(date);
    return data.sales.some((row) => clientKey(row.client) === key && !isTrialSale(row) && toNumber(row.amount) > 0 && isSameOrAfter(row.date, trialDate))
      || data.renewals.some((row) => clientKey(row.client) === key && isRenewed(row) && isSameOrAfter(row.purchaseDate || row.endDate, trialDate));
  }

  function businessDirection(row) {
    const direction = clean(row.direction);
    if (direction && !isGenericDirection(direction)) return direction;
    return clean(row.className);
  }

  function isGenericDirection(value) {
    const text = clean(value).toLowerCase();
    return !text || text.includes("по количеству") || text.includes("без направления") || text.includes("категор") || text.includes("абонемент");
  }

  function isTrialSale(row) {
    return row.productType === "пробное" || includes(row.name, "проб");
  }

  function groupAction(row) {
    if (row.occupancy < 30) return "объединить с близкой группой или временно снять слот";
    if (row.avgAttendance < 4) return "перенести время или объединить малую группу";
    return "усилить набор и проверить коммуникацию";
  }

  function addCount(map, value) {
    const key = clean(value || "Без значения");
    map.set(key, (map.get(key) || 0) + 1);
  }

  function mostCommon(map) {
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  }

  function renderDashboard(data, metrics, directionStats, recommendations) {
    const cards = [
      ["Выручка", money(metrics.revenue), "Основная выручка берется из продаж. Продления показаны отдельно, чтобы не задвоить сумму."],
      ["Расходы", money(metrics.expensesTotal), "Вводятся вручную на вкладке Данные."],
      ["Прибыль / остаток", money(metrics.profit), `Маржинальность: ${percent(metrics.margin)}`],
      ["Продано абонементов", number(metrics.membershipsSold), "Сумма количества по продуктам типа абонемент."],
      ["Пробные", number(metrics.trialsTotal), `Конверсия: ${percent(metrics.conversion)}`],
      ["Посещаемость", number(metrics.attendanceTotal), "По расписанию: сумма пришедших. Если расписания нет, по строкам посещений."],
      ["Средняя заполняемость", percent(metrics.avgOccupancy), occupancyZone(metrics.avgOccupancy).label],
      ["Уникальные клиенты", number(metrics.uniqueClients), "По клиентам, посещениям, продлениям и ручному вводу."],
      ["Продления", number(metrics.renewed), `Сумма продлений: ${money(metrics.renewalRevenue)}`],
      ["Непродленные клиенты", number(metrics.notRenewed), `Окончание в ближайшие 7 дней: ${number(metrics.endingSoon)}`]
    ];
    document.getElementById("kpiCards").innerHTML = cards
      .map(([title, value, note]) => `<div class="kpi-card"><span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div>`)
      .join("");

    const directionRows = directionStats.slice(0, 8).map((row) => Object.assign({}, row, { _class: row.zone.className }));
    const recommendationRows = recommendations.slice(0, 5);
    document.getElementById("dashboardSummary").innerHTML = [
      "<h3>Направления</h3>",
      table(
        [
          ["Направление", "direction"],
          ["Занятий", "classes"],
          ["Посещений", (row) => number(row.attended || row.visits)],
          ["Слотов", (row) => number(row.capacity)],
          ["Заполняемость", (row) => percent(row.occupancy)],
          ["Зона", (row) => row.zone.label]
        ],
        directionRows,
        "Нет данных по направлениям"
      ),
      "<h3>Ближайшие подсказки</h3>",
      table(
        [
          ["Приоритет", "priority"],
          ["Сигнал", "signal"],
          ["Что сделать", "action"]
        ],
        recommendationRows,
        "Критичных сигналов нет"
      )
    ].join("");
  }

  function renderSales(data, metrics, salesStats) {
    const totalRevenue = metrics.salesRevenue || 1;
    const names = salesStats.names.map((row) => Object.assign({}, row, {
      avg: row.quantity ? row.amount / row.quantity : 0,
      share: (row.amount / totalRevenue) * 100
    }));
    const types = salesStats.types.map((row) => Object.assign({}, row, {
      avg: row.quantity ? row.amount / row.quantity : 0,
      share: (row.amount / totalRevenue) * 100
    }));
    const best = names[0];
    const worst = names[names.length - 1];
    document.getElementById("salesContent").innerHTML = [
      `<p>Выручка продаж: <strong>${money(metrics.salesRevenue)}</strong>. Средний чек: <strong>${money(avgCheck(data.sales))}</strong>.</p>`,
      best ? `<p>Лучше продается: <strong>${escapeHtml(best.name)}</strong> (${number(best.quantity)} шт., ${money(best.amount)}). Хуже по сумме: <strong>${escapeHtml(worst.name)}</strong> (${number(worst.quantity)} шт., ${money(worst.amount)}).</p>` : "",
      salesBars(names, totalRevenue),
      "<h3>По типу продукта</h3>",
      table(
        [
          ["Тип", "name"],
          ["Кол-во", (row) => number(row.quantity)],
          ["Сумма", (row) => money(row.amount)],
          ["Средний чек", (row) => money(row.avg)],
          ["Доля в выручке", (row) => percent(row.share)]
        ],
        types,
        "Нет продаж"
      ),
      "<h3>По наименованию</h3>",
      table(
        [
          ["Наименование", "name"],
          ["Кол-во", (row) => number(row.quantity)],
          ["Сумма", (row) => money(row.amount)],
          ["Средний чек", (row) => money(row.avg)],
          ["Доля", (row) => percent(row.share)]
        ],
        names,
        "Нет продаж"
      ),
      "<h3>Динамика по месяцам</h3>",
      table(
        [
          ["Месяц", (row) => monthLabel(row.name)],
          ["Кол-во", (row) => number(row.quantity)],
          ["Сумма", (row) => money(row.amount)]
        ],
        salesStats.months,
        "Нет данных для динамики"
      )
    ].join("");
  }

  function salesBars(rows, totalRevenue) {
    const topRows = rows.slice(0, 6);
    if (!topRows.length) return "";
    return `
      <div class="card">
        <div class="card-h">
          <h3>Продажи по продуктам</h3>
          <span class="sub">сумма и доля выручки</span>
        </div>
        ${topRows.map((row, index) => {
          const width = totalRevenue ? Math.max(4, Math.min(100, (row.amount / totalRevenue) * 100)) : 0;
          return `
            <div class="row-bar">
              <span class="rb-name">${escapeHtml(row.name)}</span>
              <div class="rb-track"><div class="rb-fill${index > 1 ? " l" : ""}" style="width:${width}%"></div></div>
              <span class="rb-val">${money(row.amount)}</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function occupancyBars(rows) {
    const topRows = rows.slice(0, 8);
    if (!topRows.length) return "";
    return `
      <div class="card">
        <div class="card-h">
          <h3>Заполняемость направлений</h3>
          <span class="sub">по пришедшим и слотам</span>
        </div>
        ${topRows.map((row) => {
          const width = Math.max(2, Math.min(100, row.occupancy || 0));
          const zone = occupancyBarZone(row.occupancy || 0);
          return `
            <div class="row-bar">
              <span class="rb-name">${escapeHtml(row.direction)}</span>
              <div class="rb-track"><div class="occ-fill ${zone.fill}" style="width:${width}%"></div></div>
              <span class="occ-pct ${zone.text}">${percent(row.occupancy)}</span>
            </div>
          `;
        }).join("")}
        <div class="legend">
          <span class="leg"><span class="dot z-red"></span>&lt;30% — красная зона</span>
          <span class="leg"><span class="dot z-amber"></span>30-50% — внимание</span>
          <span class="leg"><span class="dot z-norm"></span>50-70% — норма</span>
          <span class="leg"><span class="dot z-strong"></span>70%+ — масштабировать</span>
        </div>
      </div>
    `;
  }

  function occupancyBarZone(value) {
    if (value < 30) return { fill: "z-red", text: "z-red-t" };
    if (value < 50) return { fill: "z-amber", text: "z-amber-t" };
    if (value < 70) return { fill: "z-norm", text: "z-norm-t" };
    return { fill: "z-strong", text: "z-strong-t" };
  }

  function renderAttendance(data, metrics, directionStats) {
    const classes = buildClassStats(data).map((row) => Object.assign({}, row, { _class: row.zone.className }));
    const directionRows = directionStats.map((row) => Object.assign({}, row, { _class: row.zone.className }));
    const low = directionStats.filter((row) => row.occupancy < 50);
    const strong = directionStats.filter((row) => row.occupancy >= 70);
    document.getElementById("attendanceContent").innerHTML = [
      `<p>Общая посещаемость: <strong>${number(metrics.attendanceTotal)}</strong>. Средняя заполняемость: <strong>${percent(metrics.avgOccupancy)}</strong>.</p>`,
      `<p>Зоны: ниже 30% - красная; 30-50% - внимание; 50-70% - нормальная; 70%+ - сильное направление.</p>`,
      `<p>Низкая загрузка: ${low.length ? low.map((row) => row.direction).join(", ") : "нет"}. Сильные направления: ${strong.length ? strong.map((row) => row.direction).join(", ") : "нет"}.</p>`,
      occupancyBars(directionStats),
      "<h3>По направлениям</h3>",
      table(
        [
          ["Направление", "direction"],
          ["Занятий", (row) => number(row.classes)],
          ["Записались", (row) => number(row.booked)],
          ["Пришли", (row) => number(row.attended || row.visits)],
          ["Слотов", (row) => number(row.capacity)],
          ["Заполняемость", (row) => percent(row.occupancy)],
          ["Зона", (row) => row.zone.label]
        ],
        directionRows,
        "Нет данных по расписанию"
      ),
      "<h3>По занятиям</h3>",
      table(
        [
          ["Занятие", "className"],
          ["Направление", "direction"],
          ["Занятий", (row) => number(row.classes)],
          ["Пришли", (row) => number(row.attended)],
          ["Слотов", (row) => number(row.capacity)],
          ["Заполняемость", (row) => percent(row.occupancy)],
          ["Зона", (row) => row.zone.label]
        ],
        classes,
        "Нет данных по занятиям"
      )
    ].join("");
  }

  function renderEfficiency(analytics) {
    const columns = (nameLabel) => [
      [nameLabel, "name"],
      ["Ср. заполняемость", (row) => metricPercentCell(row.avgOccupancy, row.hasOccupancy)],
      ["Занятий", (row) => number(row.classes)],
      ["Ср. участников", (row) => number(row.avgParticipants)],
      ["Пробное -> покупка", (row) => ratioCell(row.trialConversion, row.trialBase, row.trialConverted)],
      ["Покупка -> продление", (row) => ratioCell(row.purchaseRenewalConversion, row.purchaseBase, row.purchaseConverted)],
      ["Посещ./мес.", (row) => number(row.avgMonthlyAttendance)],
      ["Уник. клиентов", (row) => number(row.uniqueClients)],
      ["Постоянные", (row) => percent(row.regularShare)],
      ["Выручка/занятие", (row) => money(row.revenuePerClass)],
      ["Стабильность", (row) => metricPercentCell(row.stabilityIndex, row.stabilityBase)]
    ];

    document.getElementById("efficiencyContent").innerHTML = [
      `<p>Метрики считаются по текущим фильтрам. Если продажа не содержит направления или тренера, выручка распределяется по доле фактической посещаемости; конверсии связываются через клиента и ближайшее посещение.</p>`,
      `<div class="card">
        <div class="card-h">
          <h3>Направления</h3>
          <span class="sub">загрузка, конверсии, клиенты, выручка</span>
        </div>
        ${wideTable(columns("Направление"), analytics.directions, "Нет данных по направлениям")}
      </div>`,
      `<div class="card">
        <div class="card-h">
          <h3>Тренеры</h3>
          <span class="sub">загрузка, удержание, стабильность групп</span>
        </div>
        ${wideTable(columns("Тренер"), analytics.trainers, "Нет данных по тренерам")}
      </div>`
    ].join("");
  }

  function renderFunnel(data, metrics) {
    const trialRenewals = data.renewals.filter((row) => includes(row.membership, "проб"));
    const converted = trialRenewals.filter(isRenewed);
    const notConverted = trialRenewals.filter(isNotRenewed);
    const repeatClients = repeatPurchaseClients(data);
    document.getElementById("funnelContent").innerHTML = [
      "<h3>Пробное занятие -> покупка -> продление -> повторная покупка</h3>",
      table(
        [
          ["Этап", "stage"],
          ["Кол-во", (row) => number(row.count)],
          ["Комментарий", "comment"]
        ],
        [
          { stage: "Пробные занятия", count: metrics.trialsTotal, comment: "Из продаж пробного или из ручного ввода пробных" },
          { stage: "Покупка после пробного", count: metrics.convertedTrials, comment: `Конверсия ${percent(metrics.conversion)}` },
          { stage: "Продления", count: metrics.renewed, comment: `Непродленных: ${number(metrics.notRenewed)}` },
          { stage: "Повторная покупка", count: repeatClients.length, comment: "Клиенты с 2+ покупками/продлениями в данных" }
        ]
      ),
      "<h3>Кто был после пробного</h3>",
      table(
        [
          ["Клиент", "client"],
          ["Статус", "status"],
          ["Что купил", "renewalName"],
          ["Сумма", (row) => money(row.amount)],
          ["Менеджер", "manager"]
        ],
        trialRenewals,
        "В продлениях нет строк с исходным пробным абонементом"
      ),
      "<h3>Пробные без покупки</h3>",
      table(
        [
          ["Клиент", "client"],
          ["Дата окончания", "endDate"],
          ["Менеджер", "manager"],
          ["Действие", () => "Написать, уточнить барьер, дать персональное предложение"]
        ],
        notConverted,
        "Нет непродленных после пробного"
      ),
      "<h3>Купили после пробного</h3>",
      table(
        [
          ["Клиент", "client"],
          ["Купил", "renewalName"],
          ["Дата покупки", "purchaseDate"],
          ["Сумма", (row) => money(row.amount)]
        ],
        converted,
        "Нет данных о покупках после пробного"
      )
    ].join("");
  }

  function renderClients(data, metrics) {
    const endingSoon = data.renewals.filter(isEndingSoon);
    const notRenewed = data.renewals.filter(isNotRenewed);
    const returned = repeatPurchaseClients(data);
    const trialNoBuy = data.renewals.filter((row) => includes(row.membership, "проб") && isNotRenewed(row));
    const actions = clientActions(endingSoon, notRenewed, trialNoBuy);
    document.getElementById("clientsContent").innerHTML = [
      `<p>Уникальные клиенты: <strong>${number(metrics.uniqueClients)}</strong>. Активные по фактическим посещениям: <strong>${number(countUniqueBy(data.visits, "client"))}</strong>.</p>`,
      table(
        [
          ["Показатель", "label"],
          ["Значение", (row) => number(row.value)]
        ],
        [
          { label: "Новые клиенты", value: newClientsCount(data) },
          { label: "Активные клиенты", value: countUniqueBy(data.visits, "client") },
          { label: "Уникальные клиенты", value: metrics.uniqueClients },
          { label: "Окончание в ближайшие 7 дней", value: endingSoon.length },
          { label: "Непродленные", value: notRenewed.length },
          { label: "Вернувшиеся / повторные", value: returned.length },
          { label: "После пробного без покупки", value: trialNoBuy.length }
        ]
      ),
      "<h3>Конкретные действия</h3>",
      table(
        [
          ["Клиент", "client"],
          ["Ситуация", "reason"],
          ["Действие", "action"],
          ["Менеджер", "manager"]
        ],
        actions,
        "Нет срочных клиентских действий"
      ),
      "<h3>Непродленные</h3>",
      table(
        [
          ["Клиент", "client"],
          ["Абонемент", "membership"],
          ["Дата окончания", "endDate"],
          ["Менеджер", "manager"]
        ],
        notRenewed,
        "Нет непродленных"
      )
    ].join("");
  }

  function renderExpenses(data, metrics) {
    const expenseGroups = groupExpenses(data.expenses);
    const previous = previousMonthSnapshot();
    const growthRows = expenseGroups.map((row) => {
      const before = previous.expensesByCategory.get(row.category) || 0;
      const delta = row.amount - before;
      const deltaPct = before ? (delta / before) * 100 : 0;
      return Object.assign({}, row, { before, delta, deltaPct });
    });
    document.getElementById("expensesContent").innerHTML = [
      `<p>Общие расходы: <strong>${money(metrics.expensesTotal)}</strong>. Доля расходов от выручки: <strong>${metrics.revenue ? percent((metrics.expensesTotal / metrics.revenue) * 100) : "0%"}</strong>. Чистая прибыль: <strong>${money(metrics.profit)}</strong>. Маржинальность: <strong>${percent(metrics.margin)}</strong>.</p>`,
      "<h3>Расходы по категориям</h3>",
      table(
        [
          ["Категория", "category"],
          ["Сумма", (row) => money(row.amount)],
          ["Доля от выручки", (row) => metrics.revenue ? percent((row.amount / metrics.revenue) * 100) : "0%"]
        ],
        expenseGroups,
        "Расходы пока не введены"
      ),
      "<h3>Что выросло относительно прошлого месяца</h3>",
      table(
        [
          ["Категория", "category"],
          ["Текущий месяц", (row) => money(row.amount)],
          ["Прошлый месяц", (row) => money(row.before)],
          ["Изменение", (row) => money(row.delta)],
          ["Изменение, %", (row) => percent(row.deltaPct)]
        ],
        growthRows.filter((row) => row.delta > 0),
        "Нет данных прошлого месяца или роста расходов"
      ),
      "<h3>План продаж</h3>",
      table(
        [
          ["Месяц", (row) => monthLabel(row.month)],
          ["План", (row) => money(row.salesPlan)],
          ["Комментарий", "comment"]
        ],
        data.plans,
        "План продаж пока не введен"
      ),
      "<h3>Маркетинговые активности месяца</h3>",
      table(
        [
          ["Месяц", (row) => monthLabel(row.month)],
          ["Активность", "activity"],
          ["Канал", "channel"],
          ["Бюджет", (row) => money(row.budget)],
          ["Результат", "result"]
        ],
        data.marketing,
        "Маркетинговые активности пока не введены"
      )
    ].join("");
  }

  function renderRecommendations(recommendations, managementAnswers) {
    const rows = recommendations.length ? recommendations : [{
      priority: "Наблюдение",
      signal: "Данных пока недостаточно",
      action: "Загрузить выгрузки и заполнить расходы, план продаж и маркетинг.",
      reason: "После этого дашборд сможет собрать подсказки автоматически."
    }];
    document.getElementById("recommendationsContent").innerHTML = `
      <div class="card">
        <div class="card-h">
          <h3>Рекомендации месяца</h3>
          <span class="sub">автоматически из данных</span>
        </div>
        <div class="recommendation-list">
          ${rows.map((row) => {
            const tone = recommendationTone(row.priority);
            return `
              <div class="rec">
                <div class="rec-ico ${tone.className}">${tone.icon}</div>
                <div class="rec-txt">
                  <b>${escapeHtml(row.signal)}</b>
                  <br>${escapeHtml(row.action)}
                  <br><span class="muted">${escapeHtml(row.reason || row.priority)}</span>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
      ${renderManagementAnswers(managementAnswers)}
    `;
  }

  function renderManagementAnswers(answers) {
    return `
      <div class="card">
        <div class="card-h">
          <h3>Ответы на управленческие вопросы</h3>
          <span class="sub">по выбранному периоду</span>
        </div>
        <p class="muted">Прибыльность направлений расчетная: если расходы или продажи не привязаны к направлению, сумма распределяется по доле посещений.</p>
        <h3>Где недозагрузка по времени?</h3>
        ${table(
          [
            ["Время", "time"],
            ["Занятий", (row) => number(row.classes)],
            ["Пришли", (row) => number(row.attended)],
            ["Слотов", (row) => number(row.capacity)],
            ["Заполняемость", (row) => percent(row.occupancy)],
            ["Действие", "action"]
          ],
          answers.timeUnderload.slice(0, 8),
          "Нет временных слотов ниже 50% или нет данных расписания со слотами"
        )}
        <h3>Где недозагрузка по тренерам?</h3>
        ${table(
          [
            ["Тренер", "trainer"],
            ["Занятий", (row) => number(row.classes)],
            ["Пришли", (row) => number(row.attended)],
            ["Слотов", (row) => number(row.capacity)],
            ["Заполняемость", (row) => percent(row.occupancy)],
            ["Действие", "action"]
          ],
          answers.trainerUnderload.slice(0, 8),
          "Нет тренеров ниже 50% или в расписании нет тренеров/слотов"
        )}
        <h3>Какие направления не набирают группы?</h3>
        ${table(
          [
            ["Направление", "direction"],
            ["Занятий", (row) => number(row.classes)],
            ["Пришли", (row) => number(row.attended || row.visits)],
            ["Слотов", (row) => number(row.capacity)],
            ["Заполняемость", (row) => percent(row.occupancy)],
            ["Действие", "action"]
          ],
          answers.directionUnderload.slice(0, 8),
          "Нет направлений ниже 50% или нет данных по расписанию"
        )}
        <h3>Где низкая конверсия после пробного?</h3>
        ${table(
          [
            ["Направление", "direction"],
            ["Пробных", (row) => number(row.trials)],
            ["Купили", (row) => number(row.converted)],
            ["Конверсия", (row) => percent(row.conversion)],
            ["Действие", "action"]
          ],
          answers.trialConversion.filter((row) => row.conversion < 60).slice(0, 8),
          "Нет данных по пробным или нет направлений с низкой конверсией"
        )}
        <h3>Какие направления прибыльны, а какие нет?</h3>
        ${table(
          [
            ["Направление", "direction"],
            ["Выручка", (row) => money(row.revenue)],
            ["Расходы", (row) => money(row.expenses)],
            ["Прибыль", (row) => money(row.profit)],
            ["Маржа", (row) => percent(row.margin)],
            ["Действие", "action"]
          ],
          answers.directionProfitability.slice(0, 10),
          "Нужны продажи и посещаемость/расписание, чтобы оценить прибыльность направлений"
        )}
        <h3>Какие тренеры удерживают клиентов лучше?</h3>
        ${table(
          [
            ["Тренер", "trainer"],
            ["Клиентов", (row) => number(row.clients)],
            ["Удержаны", (row) => number(row.retained)],
            ["Удержание", (row) => percent(row.retention)],
            ["Действие", "action"]
          ],
          answers.trainerRetention.slice(0, 8),
          "Нужны посещения с тренером и клиентом, чтобы оценить удержание"
        )}
        <h3>Какие группы стоит объединить или перенести?</h3>
        ${table(
          [
            ["Группа", "className"],
            ["Направление", "direction"],
            ["Время", "time"],
            ["Тренер", "trainer"],
            ["Заполняемость", (row) => percent(row.occupancy)],
            ["Средний приход", (row) => number(row.avgAttendance)],
            ["Действие", "action"]
          ],
          answers.groupActions.slice(0, 10),
          "Нет групп с низкой загрузкой или не хватает расписания со слотами"
        )}
      </div>
    `;
  }

  function recommendationTone(priority) {
    const value = clean(priority).toLowerCase();
    if (value.includes("выс")) return { className: "rec-r", icon: "!" };
    if (value.includes("рост")) return { className: "rec-g", icon: "↑" };
    if (value.includes("сред")) return { className: "rec-a", icon: "⧗" };
    return { className: "rec-g", icon: "✦" };
  }

  function renderMonthReport(data, metrics, directionStats, salesStats, recommendations) {
    const strong = directionStats.filter((row) => row.occupancy >= 70).map((row) => row.direction);
    const attention = directionStats.filter((row) => row.occupancy < 50).map((row) => `${row.direction} (${percent(row.occupancy)})`);
    const topSales = salesStats.names.slice(0, 3).map((row) => `${row.name}: ${number(row.quantity)} шт., ${money(row.amount)}`);
    const largestExpense = groupExpenses(data.expenses).sort((a, b) => b.amount - a.amount)[0];
    const marketingIdeas = recommendations.slice(0, 3).map((row) => `- ${row.action}`).join("\n") || "- Данных для точной рекомендации пока недостаточно";
    const period = selectedPeriodLabel();
    const text = [
      `ИТОГ ЗА ${period}`,
      "",
      `1. Короткий финансовый итог: выручка ${money(metrics.revenue)}, расходы ${money(metrics.expensesTotal)}, прибыль/остаток ${money(metrics.profit)}, маржинальность ${percent(metrics.margin)}.`,
      `2. Что выросло / что просело: выручка к плану ${metrics.plan ? `${money(metrics.revenue)} из ${money(metrics.plan)} (${metrics.planGap > 0 ? "не хватает " + money(metrics.planGap) : "план выполнен"})` : "план продаж не введен"}.`,
      `3. Сильные направления: ${strong.length ? strong.join(", ") : "пока нет направлений с загрузкой 70%+"}.`,
      `4. Требуют внимания: ${attention.length ? attention.join(", ") : "нет направлений ниже 50% или нет данных по расписанию"}.`,
      `5. Пробные и конверсия: пробных ${number(metrics.trialsTotal)}, покупок после пробного ${number(metrics.convertedTrials)}, конверсия ${percent(metrics.conversion)}.`,
      `6. Продления: продлились ${number(metrics.renewed)}, не продлились ${number(metrics.notRenewed)}, окончание в ближайшие 7 дней ${number(metrics.endingSoon)}.`,
      `7. Расходы для оптимизации: ${largestExpense ? `${largestExpense.category} (${money(largestExpense.amount)})` : "расходы пока не введены"}.`,
      `8. Маркетинг на следующий месяц:\n${marketingIdeas}`,
      "",
      `Лучшие продажи: ${topSales.length ? topSales.join("; ") : "нет данных продаж"}.`
    ].join("\n");
    document.getElementById("monthReportText").textContent = text;
  }

  function renderDataStats(data) {
    document.getElementById("dataStats").textContent = DATASETS.map((key) => `${labelForDataset(key)}: ${state[key].length}`).join("; ");
    renderReportChecklist(data || state);
    renderCloudPanel();
  }

  function renderReportChecklist(data) {
    const container = document.getElementById("reportChecklist");
    if (!container) return;

    const rows = REPORT_REQUIREMENTS.map((item) => Object.assign({}, item, reportStatus(item, data)));
    const ready = rows.filter((row) => row.status === "ready" || row.status === "partial").length;
    const missing = rows.filter((row) => row.status === "missing" || row.status === "manual-missing");
    const missingText = missing.length
      ? `Не хватает: ${missing.map((row) => row.label).join(", ")}.`
      : "Все ключевые источники для периода закрыты.";

    container.innerHTML = `
      <div class="readiness-head">
        <div>
          <h4>Готовность данных</h4>
          <p>Период: ${escapeHtml(selectedPeriodLabel())}. ${escapeHtml(missingText)}</p>
        </div>
        <strong>${ready}/${rows.length}</strong>
      </div>
      <div class="report-grid">
        ${rows.map((row) => `
          <div class="report-check ${escapeAttr(row.status)}">
            <span class="report-mark">${escapeHtml(row.mark)}</span>
            <div>
              <b>${escapeHtml(row.label)}</b>
              <small>${escapeHtml(row.detail)} · ${escapeHtml(row.source)}</small>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function reportStatus(item, data) {
    const rows = data[item.key] || [];
    if (rows.length) {
      return {
        status: "ready",
        mark: "✓",
        detail: `${rows.length} строк`
      };
    }

    const partial = partialReportStatus(item.key, data);
    if (partial) return partial;

    return {
      status: item.manual ? "manual-missing" : "missing",
      mark: item.manual ? "•" : "!",
      detail: item.missing
    };
  }

  function partialReportStatus(key, data) {
    if (key === "trials") {
      const salesTrials = sum((data.sales || []).filter((row) => row.productType === "пробное" || includes(row.name, "проб")), "quantity");
      const renewalTrials = (data.renewals || []).filter((row) => includes(row.membership, "проб") || includes(row.renewalName, "проб")).length;
      if (salesTrials || renewalTrials) {
        return {
          status: "partial",
          mark: "~",
          detail: `найдено в других отчетах: ${number(salesTrials + renewalTrials)}`
        };
      }
    }

    if (key === "personals") {
      const salesPersonals = sum((data.sales || []).filter((row) => row.productType === "персональное" || includes(row.name, "персон")), "quantity");
      if (salesPersonals) {
        return {
          status: "partial",
          mark: "~",
          detail: `найдено в продажах: ${number(salesPersonals)}`
        };
      }
    }

    if (key === "clients") {
      const uniqueClients = countUniqueClients(data);
      if (uniqueClients) {
        return {
          status: "partial",
          mark: "~",
          detail: `клиенты есть в отчетах: ${number(uniqueClients)}`
        };
      }
    }

    return null;
  }

  function renderManualForms() {
    const forms = [
      {
        key: "sales",
        title: "Продажа",
        fields: [
          field("date", "Дата", "date"),
          field("client", "Клиент"),
          field("type", "Тип", "select", PRODUCT_TYPES),
          field("name", "Наименование"),
          field("quantity", "Кол-во", "number"),
          field("amount", "Сумма", "number"),
          field("manager", "Менеджер"),
          field("direction", "Направление"),
          field("segment", "Сегмент", "select", SEGMENTS),
          field("source", "Источник")
        ]
      },
      {
        key: "renewals",
        title: "Продление",
        fields: [
          field("client", "Клиент"),
          field("membership", "Абонемент"),
          field("endDate", "Дата окончания", "date"),
          field("status", "Статус", "select", ["Продление", "Не продленный", "В работе"]),
          field("purchaseDate", "Дата покупки", "date"),
          field("renewalName", "Что купил"),
          field("amount", "Сумма продления", "number"),
          field("manager", "Менеджер")
        ]
      },
      {
        key: "schedules",
        title: "Расписание / загрузка группы",
        fields: [
          field("date", "Дата", "datetime-local"),
          field("className", "Занятие"),
          field("direction", "Направление"),
          field("trainer", "Тренер"),
          field("capacity", "Всего слотов", "number"),
          field("booked", "Записались", "number"),
          field("attended", "Пришли", "number"),
          field("segment", "Сегмент", "select", SEGMENTS)
        ]
      },
      {
        key: "trials",
        title: "Пробное занятие",
        fields: [
          field("date", "Дата", "date"),
          field("client", "Клиент"),
          field("direction", "Направление"),
          field("converted", "Купил после пробного", "checkbox"),
          field("purchaseDate", "Дата покупки", "date"),
          field("renewalName", "Что купил"),
          field("amount", "Сумма", "number"),
          field("manager", "Менеджер"),
          field("source", "Источник")
        ]
      },
      {
        key: "personals",
        title: "Персональное занятие",
        fields: [
          field("date", "Дата", "date"),
          field("client", "Клиент"),
          field("direction", "Направление"),
          field("trainer", "Тренер"),
          field("sessions", "Сессий", "number"),
          field("amount", "Сумма", "number"),
          field("manager", "Менеджер")
        ]
      },
      {
        key: "expenses",
        title: "Расход",
        fields: [
          field("date", "Дата", "date"),
          field("category", "Категория", "select", EXPENSE_CATEGORIES),
          field("amount", "Сумма", "number"),
          field("comment", "Комментарий")
        ]
      },
      {
        key: "plans",
        title: "План продаж",
        fields: [
          field("month", "Месяц", "month"),
          field("salesPlan", "План продаж", "number"),
          field("comment", "Комментарий")
        ]
      },
      {
        key: "marketing",
        title: "Маркетинговая активность",
        fields: [
          field("month", "Месяц", "month"),
          field("activity", "Активность"),
          field("channel", "Канал"),
          field("budget", "Бюджет", "number"),
          field("result", "Результат")
        ]
      }
    ];

    document.getElementById("manualForms").innerHTML = forms.map(renderForm).join("");
    forms.forEach((config) => {
      const form = document.getElementById(`form-${config.key}`);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const record = { id: `manual-${config.key}-${Date.now()}` };
        config.fields.forEach((item) => {
          const input = form.elements[item.key];
          if (!input) return;
          if (item.type === "checkbox") record[item.key] = input.checked;
          else if (item.type === "number") record[item.key] = toNumber(input.value);
          else record[item.key] = input.value;
        });
        state[config.key].push(normalizeLoadedRecord(config.key, record));
        saveState();
        form.reset();
        render();
      });
    });
  }

  function field(key, label, type = "text", options = []) {
    return { key, label, type, options };
  }

  function renderForm(config) {
    const controls = config.fields.map((item) => {
      if (item.type === "select") {
        return `<label>${escapeHtml(item.label)}<select name="${escapeAttr(item.key)}">${item.options.map((option) => `<option value="${escapeAttr(option)}">${escapeHtml(option)}</option>`).join("")}</select></label>`;
      }
      if (item.type === "checkbox") {
        return `<label>${escapeHtml(item.label)}<input name="${escapeAttr(item.key)}" type="checkbox"></label>`;
      }
      return `<label>${escapeHtml(item.label)}<input name="${escapeAttr(item.key)}" type="${escapeAttr(item.type)}"></label>`;
    }).join("");
    return `<div class="manual-form"><h4>${escapeHtml(config.title)}</h4><form id="form-${escapeAttr(config.key)}">${controls}<button type="submit">Добавить</button></form></div>`;
  }

  async function importFiles() {
    const input = document.getElementById("fileInput");
    const type = document.getElementById("uploadType").value;
    const status = document.getElementById("importStatus");
    const files = Array.from(input.files || []);
    if (!files.length) {
      status.textContent = "Выберите файлы для загрузки.";
      return;
    }
    const log = [];
    const importedMonths = new Set();
    for (const file of files) {
      try {
        const rows = await readRowsFromFile(file);
        const detected = type === "auto" ? detectDataset(rows, file.name) : type;
        if (!state[detected]) throw new Error("Не удалось определить тип выгрузки");
        const records = rows
          .map((row, index) => normalizeUploadedRow(detected, row, file.name, index))
          .filter(Boolean);
        const beforeReplace = state[detected].length;
        state[detected] = state[detected].filter((record) => !record.sourceFile);
        const replaced = beforeReplace - state[detected].length;
        state[detected].push(...records);
        state[detected] = dedupeRecords(state[detected], detected);
        records.forEach((record) => {
          const month = recordMonth(record, detected);
          if (month) importedMonths.add(month);
        });
        log.push(importSummary(file.name, detected, rows.length, records, replaced));
      } catch (error) {
        log.push(`${file.name}: ошибка - ${error.message}`);
      }
    }
    if (importedMonths.size === 1) {
      filters.month = Array.from(importedMonths)[0];
    }
    saveState();
    input.value = "";
    status.textContent = log.join("; ");
    render();
  }

  function importSummary(fileName, detected, sourceRows, records, replaced) {
    const parts = [`${fileName}: ${records.length} строк -> ${labelForDataset(detected)}`];
    if (replaced) parts.push(`заменено старых строк: ${replaced}`);
    if (!records.length && sourceRows) {
      parts.push("проверьте тип отчета или заголовки колонок");
    }
    if (detected === "sales" && records.length) {
      const amount = sum(records, "amount");
      parts.push(`сумма ${money(amount)}`);
      if (!amount) parts.push("сумма не найдена в колонках");
    }
    return parts.join(", ");
  }

  async function readRowsFromFile(file) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
      const text = decodeBuffer(await file.arrayBuffer());
      return parseDelimited(text, lower.endsWith(".tsv") ? "\t" : null);
    }
    if (lower.endsWith(".html") || lower.endsWith(".htm")) {
      const text = decodeBuffer(await file.arrayBuffer());
      return parseHtmlTable(text);
    }
    if (!window.XLSX) {
      throw new Error("Для XLS/XLSX нужен интернет-доступ к SheetJS CDN или загрузка CSV/HTML.");
    }
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
  }

  function parseHtmlTable(text) {
    const documentObject = new DOMParser().parseFromString(text, "text/html");
    const rows = Array.from(documentObject.querySelectorAll("table tr")).map((tr) =>
      Array.from(tr.children).map((cell) => clean(cell.textContent))
    ).filter((row) => row.some(Boolean));
    if (!rows.length) return [];
    const headers = rows[0];
    return rows.slice(1).map((row) => objectFromHeaders(headers, row));
  }

  function parseDelimited(text, forcedDelimiter) {
    const delimiter = forcedDelimiter || guessDelimiter(text);
    const rows = parseCsvRows(text, delimiter).filter((row) => row.some((value) => clean(value)));
    if (!rows.length) return [];
    const headers = rows[0].map(clean);
    return rows.slice(1).map((row) => objectFromHeaders(headers, row));
  }

  function parseCsvRows(text, delimiter) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      const next = text[index + 1];
      if (char === '"' && quoted && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        row.push(value);
        value = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") index += 1;
        row.push(value);
        rows.push(row);
        row = [];
        value = "";
      } else {
        value += char;
      }
    }
    row.push(value);
    rows.push(row);
    return rows;
  }

  function objectFromHeaders(headers, values) {
    const object = {};
    headers.forEach((header, index) => {
      object[header || `column_${index + 1}`] = values[index] == null ? "" : values[index];
    });
    return object;
  }

  function detectDataset(rows, fileName) {
    const sample = rows[0] || {};
    const keys = Object.keys(sample).map(normalizeKey).join(" ");
    const lowerName = fileName.toLowerCase();
    if (keys.includes("дата проведения") || keys.includes("всего слотов") || lowerName.includes("распис")) return "schedules";
    if (keys.includes("время входа") || keys.includes("номер карты") || lowerName.includes("посещ")) return "visits";
    if (keys.includes("сумма продления") || keys.includes("дата окончания") || lowerName.includes("contract")) return "renewals";
    if (lowerName.includes("продаж") || (keys.includes("наименование") && (keys.includes("сумма") || keys.includes("оплачено") || keys.includes("итоговая стоимость")))) return "sales";
    if (keys.includes("расход") || keys.includes("категория")) return "expenses";
    if (keys.includes("проб")) return "trials";
    return "sales";
  }

  function normalizeUploadedRow(type, row, fileName, index) {
    const id = `${type}-${Date.now()}-${index}`;
    if (type === "sales") {
      const name = findValue(row, ["Наименование", "Название", "Абонемент", "Услуга"]);
      const productType = classifyProduct(`${name} ${findValue(row, ["Тип"])}`);
      const amount = firstMoney(row, [
        "Сумма",
        "Стоимость",
        "Выручка",
        "Оплачено за вычетом комиссии",
        "Оплачено, ₽",
        "Оплачено",
        "Итоговая стоимость, ₽",
        "Итоговая стоимость",
        "Полн. стоимость, ₽",
        "Полн. стоимость"
      ]);
      if (!name) return null;
      return normalizeLoadedRecord("sales", {
        id,
        date: parseDate(findValue(row, ["Дата", "Дата продажи", "Дата покупки", "Дата оплаты", "Дата начисления"])) || defaultImportDate(),
        clientId: findValue(row, ["ID клиента", "ID"]),
        client: findValue(row, ["Клиент", "ФИО", "Имя клиента"]),
        type: findValue(row, ["Тип"]) || productType,
        name,
        quantity: parseLeadingOrNumber(findValue(row, ["Кол-во", "Количество", "Qty"])) || 1,
        amount,
        fullPrice: firstMoney(row, ["Полн. стоимость, ₽", "Полн. стоимость", "Полная стоимость"]),
        finalPrice: firstMoney(row, ["Итоговая стоимость, ₽", "Итоговая стоимость"]),
        productType,
        manager: firstValue(row, ["Отв. менеджер", "Менеджер", "Администратор", "Инициатор"]),
        direction: findValue(row, ["Направление", "Подразделение", "Категория"]),
        segment: findValue(row, ["Сегмент", "Взрослые / дети"]),
        paymentMethod: findValue(row, ["Способ оплаты"]),
        status: findValue(row, ["Статус продления абонемента", "Статус"]),
        source: firstValue(row, ["Источник оплаты", "Источник создания"]) || "FitBase",
        sourceFile: fileName
      });
    }
    if (type === "renewals") {
      const client = findValue(row, ["Клиент", "ФИО", "Имя клиента"]);
      if (!client) return null;
      return normalizeLoadedRecord("renewals", {
        id,
        clientId: findValue(row, ["ID клиента", "ID"]),
        client,
        membership: findValue(row, ["Абонемент", "Текущий абонемент"]),
        endDate: parseDate(findValue(row, ["Дата окончания", "Окончание"])),
        status: findValue(row, ["Статус"]),
        purchaseDate: parseDate(findValue(row, ["Дата покупки", "Дата продления"])),
        renewalName: findValue(row, ["Наименование", "Что купил", "Новый абонемент"]),
        amount: parseMoney(findValue(row, ["Сумма продления", "Сумма", "Стоимость"])),
        manager: findValue(row, ["Менеджер", "Администратор"]),
        source: "FitBase",
        sourceFile: fileName
      });
    }
    if (type === "schedules") {
      const className = findValue(row, ["Название", "Занятие", "Группа"]);
      if (!className) return null;
      const capacityRaw = findValue(row, ["Всего слотов", "Слоты", "Вместимость", "Доступно записей"]);
      const bookedRaw = findValue(row, ["Записались, чел", "Записались", "Всего записей"]);
      const attendedRaw = findValue(row, ["Пришли, чел", "Пришли", "Посещения"]);
      const occupancyRaw = findValue(row, ["Заполняемость", "Заполненность", "Загрузка", "Загруженность", "Заполняемость, %", "Заполненность, %"]);
      const hasOccupancyPct = Boolean(occupancyRaw || clean(attendedRaw).includes("%") || clean(bookedRaw).includes("%"));
      const occupancyPct = hasOccupancyPct
        ? parsePercent(occupancyRaw, true) || parsePercent(attendedRaw) || parsePercent(bookedRaw)
        : "";
      return normalizeLoadedRecord("schedules", {
        id,
        date: parseDate(findValue(row, ["Дата проведения", "Дата", "Время"])),
        className,
        trainer: findValue(row, ["Тренер"]),
        type: findValue(row, ["Тип"]),
        hall: findValue(row, ["Зал"]),
        direction: findValue(row, ["Подразделение", "Направление"]) || className,
        capacity: parseLeadingOrNumber(capacityRaw),
        booked: parseLeadingOrNumber(bookedRaw),
        attended: parseLeadingOrNumber(attendedRaw),
        occupancyPct,
        hasOccupancyPct,
        source: "FitBase",
        sourceFile: fileName
      });
    }
    if (type === "visits") {
      const client = findValue(row, ["ФИО", "Клиент", "Имя"]);
      if (!client) return null;
      const entryAt = parseDate(findValue(row, ["Время входа", "Дата", "Дата посещения"]));
      return normalizeLoadedRecord("visits", {
        id,
        client,
        type: findValue(row, ["Тип"]),
        card: findValue(row, ["Номер карты"]),
        membership: findValue(row, ["Наименование", "Абонемент"]),
        trainer: findValue(row, ["Тренер"]),
        direction: findValue(row, ["Занятие", "Направление"]),
        entryAt,
        exitAt: parseDate(findValue(row, ["Время выхода"])),
        date: dateOnly(entryAt),
        source: "FitBase",
        sourceFile: fileName
      });
    }
    if (type === "trials") {
      const client = findValue(row, ["Клиент", "ФИО", "Имя"]);
      return normalizeLoadedRecord("trials", {
        id,
        date: parseDate(findValue(row, ["Дата", "Дата пробного"])) || defaultImportDate(),
        client,
        direction: findValue(row, ["Направление", "Занятие"]),
        converted: yes(findValue(row, ["Купил", "Конверсия", "Статус"])),
        purchaseDate: parseDate(findValue(row, ["Дата покупки"])),
        renewalName: findValue(row, ["Что купил", "Абонемент"]),
        amount: parseMoney(findValue(row, ["Сумма", "Стоимость"])),
        manager: findValue(row, ["Менеджер", "Администратор"]),
        source: "FitBase",
        sourceFile: fileName
      });
    }
    if (type === "personals") {
      const client = findValue(row, ["Клиент", "ФИО", "Имя"]);
      return normalizeLoadedRecord("personals", {
        id,
        date: parseDate(findValue(row, ["Дата", "Дата занятия"])) || defaultImportDate(),
        client,
        direction: findValue(row, ["Направление", "Занятие"]),
        trainer: findValue(row, ["Тренер"]),
        sessions: parseLeadingOrNumber(findValue(row, ["Кол-во", "Сессий", "Количество"])) || 1,
        amount: parseMoney(findValue(row, ["Сумма", "Стоимость"])),
        manager: findValue(row, ["Менеджер", "Администратор"]),
        source: "FitBase",
        sourceFile: fileName
      });
    }
    if (type === "clients") {
      const client = findValue(row, ["Клиент", "ФИО", "Имя"]);
      if (!client) return null;
      return normalizeLoadedRecord("clients", {
        id,
        client,
        firstSeen: parseDate(findValue(row, ["Дата", "Дата создания", "Первый визит"])),
        segment: findValue(row, ["Сегмент"]),
        source: findValue(row, ["Источник"]) || "FitBase",
        sourceFile: fileName
      });
    }
    return null;
  }

  function buildRecommendations(data, metrics, directionStats, salesStats) {
    const rows = [];
    directionStats.forEach((row) => {
      if (row.hasOccupancy && row.occupancy < 30) {
        rows.push({
          priority: "Высокий",
          signal: `${row.direction}: заполняемость ${percent(row.occupancy)}`,
          action: "Запустить точечный прогрев/акцию по направлению и проверить расписание.",
          reason: "Ниже 30% - красная зона, группа может съедать ресурс без возврата."
        });
      } else if (row.hasOccupancy && row.occupancy < 50) {
        rows.push({
          priority: "Средний",
          signal: `${row.direction}: заполняемость ${percent(row.occupancy)}`,
          action: "Проверить удобство времени, оффер и коммуникацию до занятия.",
          reason: "30-50% - зона внимания."
        });
      } else if (row.hasOccupancy && row.occupancy >= 70) {
        rows.push({
          priority: "Рост",
          signal: `${row.direction}: заполняемость ${percent(row.occupancy)}`,
          action: "Рассмотреть добавление группы, повышение цены или усиление продаж.",
          reason: "70%+ - сильное направление, можно масштабировать."
        });
      }
    });

    if (metrics.trialsTotal >= 5 && metrics.conversion < 40) {
      rows.push({
        priority: "Высокий",
        signal: `Пробных ${number(metrics.trialsTotal)}, конверсия ${percent(metrics.conversion)}`,
        action: "Проверить скрипт администратора, оффер и сообщение после пробного занятия.",
        reason: "Пробные есть, но покупка после пробного проседает."
      });
    }
    if (metrics.notRenewed > 0 && metrics.notRenewed >= metrics.renewed * 0.4) {
      rows.push({
        priority: "Высокий",
        signal: `Непродленных ${number(metrics.notRenewed)} при продлениях ${number(metrics.renewed)}`,
        action: "Запустить реактивацию: напоминания, персональные предложения, быстрый обзвон.",
        reason: "Большая доля непродлений бьет по удержанию и повторной выручке."
      });
    }
    const marketingSpend = data.expenses.filter((row) => includes(row.category, "маркет")).reduce((total, row) => total + toNumber(row.amount), 0);
    if (marketingSpend > 0 && metrics.salesRevenue <= 0) {
      rows.push({
        priority: "Высокий",
        signal: `Маркетинг ${money(marketingSpend)}, продаж нет`,
        action: "Пересмотреть канал, оффер, креатив и фиксацию лидов.",
        reason: "Расход есть, результата в продажах не видно."
      });
    }
    const four = salesStats.names.filter((row) => /4/.test(row.name)).reduce((total, row) => total + row.quantity, 0);
    const long = salesStats.names.filter((row) => /(8|10|12)/.test(row.name)).reduce((total, row) => total + row.quantity, 0);
    if (four > long && four >= 3) {
      rows.push({
        priority: "Средний",
        signal: `4 занятия продаются чаще (${number(four)}) чем 8/10/12 (${number(long)})`,
        action: "Проверить упаковку длинных абонементов и мотивацию администратора продавать длинный пакет.",
        reason: "Короткие абонементы могут снижать предсказуемость выручки и удержание."
      });
    }
    if (metrics.plan && metrics.revenue < metrics.plan * 0.9) {
      rows.push({
        priority: "Средний",
        signal: `Выручка ${money(metrics.revenue)} ниже плана ${money(metrics.plan)}`,
        action: "Собрать план догоняющих продаж: продления, апсейл на 8/12 занятий, реактивация.",
        reason: "До плана не хватает больше 10%."
      });
    }
    if (metrics.profit < 0) {
      rows.push({
        priority: "Высокий",
        signal: `Прибыль отрицательная: ${money(metrics.profit)}`,
        action: "Разделить проблему на рост продаж и оптимизацию крупнейших расходов.",
        reason: "Дашборд должен показывать, где студия теряет деньги."
      });
    }
    if (!rows.length) {
      rows.push({
        priority: "Наблюдение",
        signal: "Нет критичных отклонений",
        action: "Продолжать вести данные и сравнить следующий месяц с текущим.",
        reason: "Рекомендации станут точнее после расходов, плана продаж и маркетинговых активностей."
      });
    }
    return rows;
  }

  function clientActions(endingSoon, notRenewed, trialNoBuy) {
    const rows = [];
    endingSoon.forEach((row) => rows.push({
      client: row.client,
      reason: "Абонемент заканчивается в ближайшие 7 дней",
      action: "Написать и предложить продление до окончания",
      manager: row.manager
    }));
    notRenewed.forEach((row) => rows.push({
      client: row.client,
      reason: "Не продлен",
      action: "Вернуть: выяснить причину, предложить формат/время/бонус",
      manager: row.manager
    }));
    trialNoBuy.forEach((row) => rows.push({
      client: row.client,
      reason: "Пробное без покупки",
      action: "Дожать после пробного: короткое сообщение + оффер на первый абонемент",
      manager: row.manager
    }));
    return dedupeActions(rows);
  }

  function dedupeActions(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = `${row.client}-${row.reason}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function repeatPurchaseClients(data) {
    const counts = new Map();
    data.sales.forEach((row) => {
      if (row.client) counts.set(row.client, (counts.get(row.client) || 0) + 1);
    });
    data.renewals.forEach((row) => {
      if (row.client && isRenewed(row)) counts.set(row.client, (counts.get(row.client) || 0) + 1);
    });
    return Array.from(counts.entries()).filter(([, count]) => count >= 2).map(([client]) => client);
  }

  function newClientsCount(data) {
    const currentMonth = filters.month !== "all" ? filters.month : "";
    if (!currentMonth) return data.clients.length;
    return data.clients.filter((row) => monthKey(row.firstSeen || row.createdAt) === currentMonth).length;
  }

  function groupExpenses(expenses) {
    const groups = new Map();
    expenses.forEach((row) => {
      const category = clean(row.category || "Прочее");
      const item = groups.get(category) || { category, amount: 0 };
      item.amount += toNumber(row.amount);
      groups.set(category, item);
    });
    return Array.from(groups.values()).sort((a, b) => b.amount - a.amount);
  }

  function previousMonthSnapshot() {
    const month = filters.month !== "all" ? filters.month : latestMonth();
    const previous = previousMonth(month);
    const rows = state.expenses.filter((row) => monthKey(row.date) === previous);
    return {
      month: previous,
      expensesByCategory: new Map(groupExpenses(rows).map((row) => [row.category, row.amount]))
    };
  }

  function latestMonth() {
    return Array.from(collectMonths()).sort().pop() || "";
  }

  function previousMonth(month) {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return "";
    const [year, value] = month.split("-").map(Number);
    const date = new Date(year, value - 2, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function exportState() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fitbase-dashboard-data-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function table(columns, rows, emptyText = "Нет данных") {
    const header = columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join("");
    const body = rows.length
      ? rows.map((row) => {
        const cells = columns.map(([, accessor]) => {
          const raw = typeof accessor === "function" ? accessor(row) : row[accessor];
          return `<td>${escapeHtml(raw == null ? "" : raw)}</td>`;
        }).join("");
        return `<tr class="${escapeAttr(row._class || "")}">${cells}</tr>`;
      }).join("")
      : `<tr><td colspan="${columns.length}">${escapeHtml(emptyText)}</td></tr>`;
    return `<table class="data-table"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function wideTable(columns, rows, emptyText = "Нет данных") {
    return `<div class="table-scroll">${table(columns, rows, emptyText)}</div>`;
  }

  function ratioCell(value, base, converted) {
    return base ? `${percent(value)} (${number(converted)} из ${number(base)})` : "нет данных";
  }

  function metricPercentCell(value, hasData) {
    return hasData ? percent(value) : "нет данных";
  }

  function avgCheck(sales) {
    const quantity = sum(sales, "quantity");
    return quantity ? sum(sales, "amount") / quantity : 0;
  }

  function countUniqueBy(rows, key) {
    const values = new Set();
    rows.forEach((row) => {
      const value = clean(row[key]);
      if (value) values.add(value.toLowerCase());
    });
    return values.size;
  }

  function clientKey(value) {
    return clean(value).toLowerCase().replace(/\s+/g, " ");
  }

  function isRenewed(row) {
    const status = clean(row.status).toLowerCase();
    if (status.includes("не")) return false;
    return status.includes("продлен") || status.includes("продление") || toNumber(row.amount) > 0;
  }

  function isNotRenewed(row) {
    return includes(row.status, "не") || (!isRenewed(row) && clean(row.status));
  }

  function isEndingSoon(row) {
    const date = dateOnly(row.endDate);
    if (!date || isRenewed(row)) return false;
    const today = new Date();
    const end = new Date(`${date}T00:00:00`);
    const diff = (end - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  }

  function occupancyZone(value) {
    if (value < 30) return { label: "красная зона", className: "status-red" };
    if (value < 50) return { label: "зона внимания", className: "status-yellow" };
    if (value < 70) return { label: "нормальная загрузка", className: "status-green" };
    return { label: "сильное направление", className: "status-blue" };
  }

  function classifyProduct(text) {
    const value = clean(text).toLowerCase();
    if (value.includes("проб")) return "пробное";
    if (value.includes("персон")) return "персональное";
    if (value.includes("разов")) return "разовое";
    return "абонемент";
  }

  function classifySegment(text) {
    const value = clean(text).toLowerCase();
    if (value.includes("дет") || value.includes("подрост")) return "дети / подростки";
    if (value.includes("персон")) return "персональные";
    return "взрослые";
  }

  const DIRECTION_ALIASES = {
    "антиотечность": "Гибкость",
    "аренда": "Йога",
    "здоровая спина": "Гибкость",
    "индивидуальное занятие": "Гибкость",
    "йога в гамаках": "Йога",
    "йога нидра": "Йога",
    "мастер класс": "Гибкость",
    "мышцы тазового дна": "Гибкость",
    "плоский живот": "Сила",
    "растяжка stretching": "Гибкость",
    "сила мфр": "Сила",
    "фитнес растяжка": "Сила",
    "хатха йога": "Йога",
    "ягодицы 3d": "Сила"
  };

  function normalizeClassKey(value) {
    return clean(value)
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[|+\-–—_/]+/g, " ")
      .replace(/[^a-zа-я0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function resolveDirection(row) {
    const direction = clean(row.direction);
    const className = clean(row.className || row.direction);
    const aliasKey = normalizeClassKey(className);

    if (DIRECTION_ALIASES[aliasKey]) return DIRECTION_ALIASES[aliasKey];

    const mappedDirection = directionForClass(className);
    if (mappedDirection) return mappedDirection;

    if (direction && !isGenericDirection(direction)) return direction;
    return className || "Без направления";
  }

  function directionForClass(className) {
    const target = normalizeClassKey(className);
    if (!target || !state || !Array.isArray(state.schedules)) return "";

    const match = state.schedules.find((schedule) => {
      const scheduleClass = normalizeClassKey(schedule.className);
      return scheduleClass === target;
    });

    if (!match) return "";
    const mappedDirection = clean(match.direction);
    return mappedDirection && !isGenericDirection(mappedDirection) ? mappedDirection : "";
  }

  function findValue(row, aliases) {
    const normalizedAliases = aliases.map(normalizeKey);
    for (const [key, value] of Object.entries(row)) {
      if (normalizedAliases.includes(normalizeKey(key))) return clean(value);
    }
    return "";
  }

  function firstValue(row, aliases) {
    for (const alias of aliases) {
      const value = findValue(row, [alias]);
      if (value) return value;
    }
    return "";
  }

  function normalizeKey(value) {
    return clean(value)
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^a-zа-я0-9]+/gi, " ")
      .trim();
  }

  function parseMoney(value) {
    return toNumber(String(value || "").replace(/\s/g, "").replace(/[^0-9,.-]/g, "").replace(",", "."));
  }

  function firstMoney(row, aliases) {
    for (const alias of aliases) {
      const value = findValue(row, [alias]);
      if (clean(value) !== "") return parseMoney(value);
    }
    return 0;
  }

  function parseLeadingOrNumber(value) {
    const match = clean(value).match(/^-?\d+(?:[.,]\d+)?/);
    return match ? toNumber(match[0]) : parseMoney(value);
  }

  function parsePercent(value, allowPlainNumber) {
    const text = clean(value);
    if (!text) return 0;
    const percentMatch = text.match(/(-?\d+(?:[.,]\d+)?)\s*%/);
    if (percentMatch) return toNumber(percentMatch[1]);
    if (allowPlainNumber) {
      const numberValue = parseMoney(text);
      return numberValue >= 0 && numberValue <= 100 ? numberValue : 0;
    }
    return 0;
  }

  function normalizeOccupancy(value) {
    return parsePercent(value, true);
  }

  function parseDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return toIsoDateTime(value);
    if (typeof value === "number") {
      const date = new Date(Math.round((value - 25569) * 86400 * 1000));
      return toIsoDateTime(date);
    }
    const text = clean(value);
    if (!text || text === "-") return "";
    const russian = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (russian) {
      const [, day, month, year, hour, minute] = russian;
      const date = `${year}-${pad(month)}-${pad(day)}`;
      return hour ? `${date}T${pad(hour)}:${pad(minute)}` : date;
    }
    const iso = text.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (iso) return iso[4] ? `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}` : `${iso[1]}-${iso[2]}-${iso[3]}`;
    return "";
  }

  function toIsoDateTime(date) {
    const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const hour = date.getHours();
    const minute = date.getMinutes();
    return hour || minute ? `${base}T${pad(hour)}:${pad(minute)}` : base;
  }

  function dateOnly(value) {
    const parsed = parseDate(value);
    return parsed ? parsed.slice(0, 10) : "";
  }

  function daysBetween(left, right) {
    if (!left || !right) return Number.POSITIVE_INFINITY;
    const leftDate = new Date(`${left}T00:00:00`);
    const rightDate = new Date(`${right}T00:00:00`);
    return (leftDate - rightDate) / (1000 * 60 * 60 * 24);
  }

  function isSameOrAfter(value, floor) {
    const date = dateOnly(value);
    if (!date) return false;
    return !floor || date >= floor;
  }

  function isAfter(value, floor) {
    const date = dateOnly(value);
    if (!date || !floor) return false;
    return date > floor;
  }

  function monthKey(value) {
    const date = dateOnly(value);
    return date ? date.slice(0, 7) : "";
  }

  function defaultImportDate() {
    if (filters.month !== "all") return `${filters.month}-01`;
    return new Date().toISOString().slice(0, 10);
  }

  function selectedPeriodLabel() {
    if (filters.month !== "all") return monthLabel(filters.month);
    if (filters.from || filters.to) return `${filters.from || "начало"} - ${filters.to || "конец"}`;
    return "все данные";
  }

  function monthLabel(month) {
    if (!month || month === "all" || month === "Без месяца") return month || "";
    const [year, numberValue] = month.split("-");
    const names = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
    return `${names[Number(numberValue) - 1] || numberValue} ${year}`;
  }

  function decodeBuffer(buffer) {
    const utf8 = new TextDecoder("utf-8").decode(buffer);
    const badChars = (utf8.match(/\uFFFD/g) || []).length;
    if (badChars > 3) return new TextDecoder("windows-1251").decode(buffer);
    return utf8;
  }

  function guessDelimiter(text) {
    const firstLine = text.split(/\r?\n/).find(Boolean) || "";
    const variants = [";", ",", "\t"];
    return variants
      .map((delimiter) => ({ delimiter, count: firstLine.split(delimiter).length }))
      .sort((a, b) => b.count - a.count)[0].delimiter;
  }

  function labelForDataset(key) {
    return {
      sales: "продажи",
      renewals: "продления",
      schedules: "расписание",
      visits: "посещения",
      trials: "пробные",
      personals: "персональные",
      clients: "клиенты",
      expenses: "расходы",
      plans: "планы",
      marketing: "маркетинг"
    }[key] || key;
  }

  function sum(rows, key) {
    return rows.reduce((total, row) => total + toNumber(row[key]), 0);
  }

  function toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const normalized = String(value || "").replace(/\s/g, "").replace(",", ".");
    const numberValue = Number.parseFloat(normalized);
    return Number.isFinite(numberValue) ? numberValue : 0;
  }

  function number(value) {
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(toNumber(value));
  }

  function money(value) {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0
    }).format(toNumber(value));
  }

  function percent(value) {
    return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(toNumber(value))}%`;
  }

  function yes(value) {
    const text = clean(value).toLowerCase();
    if (text.includes("нет") || text.includes("не ")) return false;
    return ["да", "true", "1", "купил", "продление", "продлен"].some((item) => text.includes(item));
  }

  function includes(value, part) {
    return clean(value).toLowerCase().includes(part.toLowerCase());
  }

  function firstFilled() {
    for (const value of arguments) {
      if (value != null && clean(value) !== "") return value;
    }
    return "";
  }

  function clean(value) {
    return value == null ? "" : String(value).replace(/\u00a0/g, " ").trim();
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function valueOf(id) {
    return document.getElementById(id).value;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return clean(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
