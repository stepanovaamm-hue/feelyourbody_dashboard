(function () {
  "use strict";

  const STORAGE_KEY = "fitbase-studio-dashboard-state-v1";
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

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindWelcomeScreen();
    bindTabs();
    bindFilters();
    bindDataActions();
    renderManualForms();
    render();
  }


  function bindWelcomeScreen() {
    const phrases = [
      "Студия растёт из маленьких шагов: одного занятия, одного решения, одного человека, который вернулся снова.",
      "Цифры — это история людей, которые выбирают заботиться о себе вместе с нами.",
      "Всё, что мы измеряем сегодня, помогает создавать более тёплое и устойчивое пространство завтра.",
      "Хорошая студия похожа на сад: где-то нужно полить, где-то поддержать, а где-то просто дать время для роста.",
      "Этот дашборд — не про контроль. Он про внимание к тому, что помогает студии жить и развиваться.",
      "Как у любого живого организма, у студии есть свой ритм. Этот отчёт помогает его услышать.",
      "Хорошая студия начинается с заботы. А устойчивый рост появляется там, где забота встречается с вниманием к цифрам.",
      "Когда есть ясность в цифрах, появляется больше пространства для творчества, развития и заботы о клиентах.",
      "Здесь собрана история месяца: люди, занятия, энергия команды и результаты, которые мы создаём вместе."
    ];
    const welcome = document.getElementById("welcome");
    const button = document.getElementById("welcomeEnter");
    const motivation = document.getElementById("motivation");
    const vine = document.getElementById("vine");
    if (!welcome || !button || !motivation || !vine) return;

    let index = Math.floor(Math.random() * phrases.length);
    const duration = 7000;

    function runVineAnimation() {
      vine.classList.remove("play");
      void vine.offsetWidth;
      vine.classList.add("play");
    }

    motivation.textContent = phrases[index];
    runVineAnimation();

    setInterval(() => {
      index = (index + 1) % phrases.length;
      motivation.style.transition = "opacity .5s";
      motivation.style.opacity = "0";
      window.setTimeout(() => {
        motivation.textContent = phrases[index];
        motivation.style.opacity = "1";
        runVineAnimation();
      }, 500);
    }, duration);

    button.addEventListener("click", () => {
      welcome.classList.add("hide");
    });
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

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

    renderHeaderNote();
    renderDashboard(data, metrics, directionStats, recommendations);
    renderSales(data, metrics, salesStats);
    renderAttendance(data, metrics, directionStats);
    renderFunnel(data, metrics);
    renderClients(data, metrics);
    renderExpenses(data, metrics);
    renderRecommendations(recommendations);
    renderMonthReport(data, metrics, directionStats, salesStats, recommendations);
    renderDataStats();
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
    setOptions("filterDirection", [["all", "Все направления"]].concat(valuesFromState(["direction", "className"]).map((v) => [v, v])), filters.direction);
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
    if (!matchesValue(filters.direction, row.direction || row.className)) return false;
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
    const avgOccupancy = scheduleCapacity ? (scheduleAttended / scheduleCapacity) * 100 : 0;
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

  function buildDirectionStats(data) {
    const groups = new Map();
    data.schedules.forEach((row) => {
      const key = clean(row.direction || row.className || "Без направления");
      const item = groups.get(key) || {
        direction: key,
        classes: 0,
        capacity: 0,
        booked: 0,
        attended: 0,
        visits: 0
      };
      item.classes += 1;
      item.capacity += toNumber(row.capacity);
      item.booked += toNumber(row.booked);
      item.attended += toNumber(row.attended);
      groups.set(key, item);
    });
    data.visits.forEach((row) => {
      const key = clean(row.direction || "Без направления");
      const item = groups.get(key) || {
        direction: key,
        classes: 0,
        capacity: 0,
        booked: 0,
        attended: 0,
        visits: 0
      };
      item.visits += toNumber(row.visits || 1);
      groups.set(key, item);
    });
    return Array.from(groups.values())
      .map((item) => {
        item.occupancy = item.capacity ? (item.attended / item.capacity) * 100 : 0;
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
        direction: clean(row.direction || ""),
        classes: 0,
        capacity: 0,
        booked: 0,
        attended: 0
      };
      item.classes += 1;
      item.capacity += toNumber(row.capacity);
      item.booked += toNumber(row.booked);
      item.attended += toNumber(row.attended);
      groups.set(key, item);
    });
    return Array.from(groups.values())
      .map((item) => {
        item.occupancy = item.capacity ? (item.attended / item.capacity) * 100 : 0;
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

  function renderRecommendations(recommendations) {
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

  function renderDataStats() {
    document.getElementById("dataStats").textContent = DATASETS.map((key) => `${labelForDataset(key)}: ${state[key].length}`).join("; ");
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
    for (const file of files) {
      try {
        const rows = await readRowsFromFile(file);
        const detected = type === "auto" ? detectDataset(rows, file.name) : type;
        if (!state[detected]) throw new Error("Не удалось определить тип выгрузки");
        const records = rows
          .map((row, index) => normalizeUploadedRow(detected, row, file.name, index))
          .filter(Boolean);
        state[detected].push(...records);
        log.push(`${file.name}: ${records.length} строк -> ${labelForDataset(detected)}`);
      } catch (error) {
        log.push(`${file.name}: ошибка - ${error.message}`);
      }
    }
    saveState();
    input.value = "";
    status.textContent = log.join("; ");
    render();
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
    if (keys.includes("кол во") && keys.includes("сумма") && keys.includes("наименование")) return "sales";
    if (keys.includes("расход") || keys.includes("категория")) return "expenses";
    if (keys.includes("проб")) return "trials";
    return "sales";
  }

  function normalizeUploadedRow(type, row, fileName, index) {
    const id = `${type}-${Date.now()}-${index}`;
    if (type === "sales") {
      const name = findValue(row, ["Наименование", "Название", "Абонемент", "Услуга"]);
      const productType = classifyProduct(`${name} ${findValue(row, ["Тип"])}`);
      if (!name) return null;
      return normalizeLoadedRecord("sales", {
        id,
        date: parseDate(findValue(row, ["Дата", "Дата продажи", "Дата покупки"])) || defaultImportDate(),
        type: findValue(row, ["Тип"]) || productType,
        name,
        quantity: parseLeadingOrNumber(findValue(row, ["Кол-во", "Количество", "Qty"])) || 1,
        amount: parseMoney(findValue(row, ["Сумма", "Стоимость", "Выручка"])),
        productType,
        manager: findValue(row, ["Менеджер", "Администратор"]),
        direction: findValue(row, ["Направление", "Подразделение"]),
        segment: findValue(row, ["Сегмент", "Взрослые / дети"]),
        source: "FitBase",
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
      return normalizeLoadedRecord("schedules", {
        id,
        date: parseDate(findValue(row, ["Дата проведения", "Дата", "Время"])),
        className,
        trainer: findValue(row, ["Тренер"]),
        type: findValue(row, ["Тип"]),
        hall: findValue(row, ["Зал"]),
        direction: findValue(row, ["Подразделение", "Направление"]) || className,
        capacity: parseLeadingOrNumber(findValue(row, ["Всего слотов", "Слоты", "Вместимость"])),
        booked: parseLeadingOrNumber(findValue(row, ["Записались, чел", "Записались"])),
        attended: parseLeadingOrNumber(findValue(row, ["Пришли, чел", "Пришли", "Посещения"])),
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
      if (row.capacity && row.occupancy < 30) {
        rows.push({
          priority: "Высокий",
          signal: `${row.direction}: заполняемость ${percent(row.occupancy)}`,
          action: "Запустить точечный прогрев/акцию по направлению и проверить расписание.",
          reason: "Ниже 30% - красная зона, группа может съедать ресурс без возврата."
        });
      } else if (row.capacity && row.occupancy < 50) {
        rows.push({
          priority: "Средний",
          signal: `${row.direction}: заполняемость ${percent(row.occupancy)}`,
          action: "Проверить удобство времени, оффер и коммуникацию до занятия.",
          reason: "30-50% - зона внимания."
        });
      } else if (row.capacity && row.occupancy >= 70) {
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

  function findValue(row, aliases) {
    const normalizedAliases = aliases.map(normalizeKey);
    for (const [key, value] of Object.entries(row)) {
      if (normalizedAliases.includes(normalizeKey(key))) return clean(value);
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

  function parseLeadingOrNumber(value) {
    const match = clean(value).match(/^-?\d+(?:[.,]\d+)?/);
    return match ? toNumber(match[0]) : parseMoney(value);
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
