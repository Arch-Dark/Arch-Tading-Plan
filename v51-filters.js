/* ============================================================
   ARCH TRADING PLAN
   APP.JS — CORE APPLICATION
   ============================================================ */

"use strict";

/* ============================================================
   CONSTANTES
============================================================ */

const TRADES_KEY = "tradingTrades";
const CAPITAL_KEY = "tradingActiveCapital";
const ARCHIVES_KEY = "tradingCapitalArchives";
const THEME_KEY = "tradingDashboardTheme";

const MIN_RR = 2.00;
const MIN_LOT = 0.01;
const LOT_STEP = 0.01;

const RISK_TOLERANCE = 0.10;

const MADAGASCAR_TIMEZONE = "Indian/Antananarivo";

const ASSETS = [
    "EUR/USD",
    "GBP/USD",
    "AUD/USD",
    "NZD/USD",
    "USD/CAD",
    "USD/CHF",
    "USD/JPY",
    "XAUUSD",
    "BTCUSD"
];

const SETUPS = [
    "LDP+QML",
    "LDP+FIBO 50",
    "OB",
    "BB",
    "ZS OA",
    "SSM1",
    "SSM2",
    "SSM3",
    "SBM1",
    "SBM2",
    "SBM3"
];


/* ============================================================
   ÉTAT GLOBAL
============================================================ */

let trades = [];
let archives = [];
let activeCapital = null;

let currentPeriod = "today";
let currentCapitalModalMode = "new";

let editingArchiveId = null;
let editingTradeId = null;

let currentPage = "dashboard";

let analysisFilters = {
    period: "all",
    asset: "all",
    setup: "all",
    result: "all"
};

let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();


/* ============================================================
   UTILITAIRES
============================================================ */

function parseNumber(value) {
    if (value === null || value === undefined || value === "") {
        return 0;
    }

    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }

    const normalized = String(value)
        .replace(/\s/g, "")
        .replace(",", ".");

    const number = Number(normalized);

    return Number.isFinite(number) ? number : 0;
}


function money(value) {
    const number = parseNumber(value);

    return "$" + number.toFixed(2);
}


function formatMoney(value) {
    return money(value);
}


function formatNumber(value, decimals = 2) {
    return parseNumber(value).toFixed(decimals);
}


function formatPercent(value, decimals = 1) {
    return parseNumber(value).toFixed(decimals) + "%";
}


function generateId() {
    return (
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 8)
    );
}


function escapeHtml(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function escapeValue(value) {
    return escapeHtml(value);
}


function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}


function roundToStep(value, step = LOT_STEP) {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.round(value / step) * step;
}


function getElement(id) {
    return document.getElementById(id);
}


function setText(id, value) {
    const element = getElement(id);

    if (element) {
        element.textContent = value;
    }
}


function setValue(id, value) {
    const element = getElement(id);

    if (element) {
        element.value = value;
    }
}


function getValue(id) {
    const element = getElement(id);

    return element ? element.value : "";
}


/* ============================================================
   DATES — MADAGASCAR
============================================================ */

function getTodayDate() {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: MADAGASCAR_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });

    return formatter.format(new Date());
}


function getMadagascarDateTime(value) {
    const date = value ? new Date(value) : new Date();

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return new Intl.DateTimeFormat("fr-FR", {
        timeZone: MADAGASCAR_TIMEZONE,
        dateStyle: "short",
        timeStyle: "short"
    }).format(date);
}


function formatStoredDateTime(value) {
    if (!value) {
        return "—";
    }

    return getMadagascarDateTime(value);
}


function getTradeDate(trade) {
    if (!trade) {
        return "";
    }

    return trade.date || "";
}


function getTradeDateObject(trade) {
    const dateString = getTradeDate(trade);

    if (!dateString) {
        return null;
    }

    const parts = dateString.split("-");

    if (parts.length !== 3) {
        return null;
    }

    const year = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    const day = Number(parts[2]);

    const date = new Date(year, month, day);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
}


function isToday(trade) {
    return getTradeDate(trade) === getTodayDate();
}


function isThisWeek(trade) {
    const date = getTradeDateObject(trade);

    if (!date) {
        return false;
    }

    const today = new Date();

    const day = today.getDay();

    const mondayOffset = day === 0 ? -6 : 1 - day;

    const monday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + mondayOffset
    );

    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return date >= monday && date <= sunday;
}


function isThisMonth(trade) {
    const date = getTradeDateObject(trade);

    if (!date) {
        return false;
    }

    const now = new Date();

    return (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth()
    );
}


function isThisYear(trade) {
    const date = getTradeDateObject(trade);

    if (!date) {
        return false;
    }

    return date.getFullYear() === new Date().getFullYear();
}


/* ============================================================
   STORAGE
============================================================ */

function saveTrades() {
    localStorage.setItem(
        TRADES_KEY,
        JSON.stringify(trades)
    );
}


function saveArchives() {
    localStorage.setItem(
        ARCHIVES_KEY,
        JSON.stringify(archives)
    );
}


function saveActiveCapital() {
    if (activeCapital) {
        localStorage.setItem(
            CAPITAL_KEY,
            JSON.stringify(activeCapital)
        );
    } else {
        localStorage.removeItem(CAPITAL_KEY);
    }
}


/* ============================================================
   CHARGEMENT
============================================================ */

function loadData() {

    try {
        const storedTrades = localStorage.getItem(TRADES_KEY);

        trades = storedTrades
            ? JSON.parse(storedTrades)
            : [];

        if (!Array.isArray(trades)) {
            trades = [];
        }
    } catch (error) {
        console.error("Erreur chargement trades :", error);
        trades = [];
    }


    try {
        const storedArchives = localStorage.getItem(ARCHIVES_KEY);

        archives = storedArchives
            ? JSON.parse(storedArchives)
            : [];

        if (!Array.isArray(archives)) {
            archives = [];
        }
    } catch (error) {
        console.error("Erreur chargement archives :", error);
        archives = [];
    }


    try {
        const storedCapital = localStorage.getItem(CAPITAL_KEY);

        activeCapital = storedCapital
            ? JSON.parse(storedCapital)
            : null;
    } catch (error) {
        console.error("Erreur chargement capital :", error);
        activeCapital = null;
    }


    if (activeCapital && !activeCapital.id) {
        activeCapital.id = generateId();
        saveActiveCapital();
    }


    migrateTrades();


    if (!activeCapital && trades.length === 0 && archives.length === 0) {
        return;
    }


    if (!activeCapital && trades.length > 0) {

        const capitalId = trades[0].capitalId;

        if (capitalId) {

            activeCapital = {
                id: capitalId,
                name: "Capital principal",
                initialCapital: 0,
                riskReference: 0,
                rrTarget: MIN_RR,
                createdAt: new Date().toISOString()
            };

            saveActiveCapital();
        }
    }
}


function migrateTrades() {

    if (!activeCapital) {
        return;
    }

    let changed = false;

    trades.forEach(trade => {

        if (!trade.id) {
            trade.id = generateId();
            changed = true;
        }

        if (!trade.capitalId) {
            trade.capitalId = activeCapital.id;
            changed = true;
        }

        if (!trade.createdAt && trade.recordedAt) {
            trade.createdAt = trade.recordedAt;
            changed = true;
        }

        if (!trade.recordedAt && trade.createdAt) {
            trade.recordedAt = trade.createdAt;
            changed = true;
        }

        if (!trade.result && trade.outcome) {
            trade.result = trade.outcome;
            changed = true;
        }

        if (trade.profit === undefined && trade.pnl !== undefined) {
            trade.profit = parseNumber(trade.pnl);
            changed = true;
        }

        if (trade.pnl === undefined && trade.profit !== undefined) {
            trade.pnl = parseNumber(trade.profit);
            changed = true;
        }
    });

    if (changed) {
        saveTrades();
    }
}


/* ============================================================
   CAPITAL
============================================================ */

function getCapitalRisk(capital = activeCapital) {

    if (!capital) {
        return 0;
    }

    const risk = parseNumber(
        capital.riskReference !== undefined
            ? capital.riskReference
            : capital.riskPerTrade
    );

    return Math.max(0, risk);
}


function getCapitalRR(capital = activeCapital) {

    if (!capital) {
        return MIN_RR;
    }

    const rr = parseNumber(
        capital.rrTarget !== undefined
            ? capital.rrTarget
            : capital.rr
    );

    return Math.max(MIN_RR, rr || MIN_RR);
}


function getCapitalObjective(capital = activeCapital) {
    return getCapitalRisk(capital) * getCapitalRR(capital);
}


function getCapitalTrades(capitalId) {

    if (!capitalId) {
        return [];
    }

    return trades.filter(
        trade => trade.capitalId === capitalId
    );
}


function getActiveCapitalTrades() {

    if (!activeCapital) {
        return [];
    }

    return getCapitalTrades(activeCapital.id);
}


function getAllCapitalTrades() {
    return [...trades];
}


function calculateProfit(tradeList) {

    if (!Array.isArray(tradeList)) {
        return 0;
    }

    return tradeList.reduce(
        (total, trade) => {

            const value =
                trade.profit !== undefined
                    ? trade.profit
                    : trade.pnl;

            return total + parseNumber(value);
        },
        0
    );
}


function calculateCurrentBalance() {

    if (!activeCapital) {
        return 0;
    }

    return (
        parseNumber(activeCapital.initialCapital) +
        calculateProfit(getActiveCapitalTrades())
    );
}


function calculateAllCapitalsBalance() {

    return archives.reduce(
        (total, archive) => {

            const initial = parseNumber(
                archive.initialCapital
            );

            const profit = calculateProfit(
                archive.trades || []
            );

            return total + initial + profit;
        },
        0
    );
}


/* ============================================================
   PÉRIODES
============================================================ */

function filterTradesByPeriod(tradeList, period = currentPeriod) {

    if (!Array.isArray(tradeList)) {
        return [];
    }

    switch (period) {

        case "today":
            return tradeList.filter(isToday);

        case "week":
            return tradeList.filter(isThisWeek);

        case "month":
            return tradeList.filter(isThisMonth);

        case "year":
            return tradeList.filter(isThisYear);

        case "all":
        case "all-capitals":
        default:
            return [...tradeList];
    }
}


function getTradesForPeriod(period = currentPeriod) {

    if (period === "all-capitals") {
        return filterTradesByPeriod(
            getAllCapitalTrades(),
            "all"
        );
    }

    return filterTradesByPeriod(
        getActiveCapitalTrades(),
        period
    );
}


/* ============================================================
   NAVIGATION
============================================================ */

function isAnalysisPage() {
    return currentPage === "analysis";
}


function showPage(page) {

    const allowedPages = [
        "dashboard",
        "analysis",
        "performance",
        "archives"
    ];

    if (!allowedPages.includes(page)) {
        page = "dashboard";
    }

    currentPage = page;


    document.querySelectorAll(
        "[data-page-section]"
    ).forEach(section => {

        section.classList.toggle(
            "active",
            section.dataset.pageSection === page
        );
    });


    document.querySelectorAll(
        ".app-nav-link"
    ).forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.page === page
        );
    });


    if (page === "dashboard") {
        renderDashboard();
    }

    if (page === "analysis") {
        renderAnalysis();
    }

    if (page === "performance") {
        renderPerformance();
    }

    if (page === "archives") {
        renderArchives();
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


/* ============================================================
   THÈME
============================================================ */

function loadTheme() {

    const savedTheme =
        localStorage.getItem(THEME_KEY);

    if (savedTheme === "light") {
        document.body.classList.add("light-theme");
    } else {
        document.body.classList.remove("light-theme");
    }
}


function toggleTheme() {

    const isLight =
        document.body.classList.toggle("light-theme");

    localStorage.setItem(
        THEME_KEY,
        isLight ? "light" : "dark"
    );

    renderCurrentPage();
}


/* ============================================================
   CAPITAL — MODAL
============================================================ */

function openCapitalModal(mode = "new") {

    currentCapitalModalMode = mode;

    const modal = getElement("capitalModal");

    if (!modal) {
        return;
    }


    if (mode === "edit" && activeCapital) {

        setText(
            "capitalModalTitle",
            "Modifier le capital"
        );

        setValue(
            "capitalNameInput",
            activeCapital.name || ""
        );

        setValue(
            "capitalAmountInput",
            parseNumber(activeCapital.initialCapital)
        );

        setValue(
            "capitalRiskInput",
            getCapitalRisk(activeCapital)
        );

        setValue(
            "capitalRRInput",
            getCapitalRR(activeCapital)
        );

    } else {

        setText(
            "capitalModalTitle",
            "Nouveau capital"
        );

        setValue(
            "capitalNameInput",
            ""
        );

        setValue(
            "capitalAmountInput",
            ""
        );

        setValue(
            "capitalRiskInput",
            ""
        );

        setValue(
            "capitalRRInput",
            MIN_RR
        );
    }


    updateCapitalModalPreview();

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");

    setTimeout(() => {

        const input =
            getElement("capitalNameInput");

        if (input) {
            input.focus();
        }

    }, 50);
}


function closeCapitalModal() {

    const modal = getElement("capitalModal");

    if (!modal) {
        return;
    }

    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
}


function updateCapitalModalPreview() {

    const amount =
        parseNumber(getValue("capitalAmountInput"));

    const risk =
        parseNumber(getValue("capitalRiskInput"));

    const rr =
        Math.max(
            MIN_RR,
            parseNumber(getValue("capitalRRInput")) || MIN_RR
        );


    setText(
        "capitalModalRiskPreview",
        money(risk)
    );

    setText(
        "capitalModalRR",
        rr.toFixed(2) + "R"
    );

    setText(
        "capitalModalObjective",
        money(risk * rr)
    );
}


function saveCapitalFromForm(event) {

    event.preventDefault();

    const name =
        getValue("capitalNameInput").trim();

    const amount =
        parseNumber(getValue("capitalAmountInput"));

    const risk =
        parseNumber(getValue("capitalRiskInput"));

    const rr =
        Math.max(
            MIN_RR,
            parseNumber(getValue("capitalRRInput")) || MIN_RR
        );


    if (!name) {
        alert("Veuillez donner un nom au capital.");
        return;
    }

    if (amount <= 0) {
        alert("Le capital initial doit être supérieur à 0.");
        return;
    }

    if (risk <= 0) {
        alert("Le risque par trade doit être supérieur à 0.");
        return;
    }


    if (
        currentCapitalModalMode === "edit" &&
        activeCapital
    ) {

        activeCapital.name = name;
        activeCapital.initialCapital = amount;
        activeCapital.riskReference = risk;
        activeCapital.riskPerTrade = risk;
        activeCapital.rrTarget = rr;
        activeCapital.rr = rr;

        saveActiveCapital();

    } else {

        const newCapital = {
            id: generateId(),
            name,
            initialCapital: amount,
            riskReference: risk,
            riskPerTrade: risk,
            rrTarget: rr,
            rr,
            createdAt: new Date().toISOString()
        };

        activeCapital = newCapital;

        saveActiveCapital();
    }


    closeCapitalModal();

    renderAll();
}


/* ============================================================
   CAPITAL SELECTOR
============================================================ */

function getAvailableCapitals() {

    const result = [];

    if (activeCapital) {
        result.push(activeCapital);
    }

    archives.forEach(archive => {

        if (
            archive &&
            archive.id &&
            !result.some(
                capital => capital.id === archive.id
            )
        ) {
            result.push(archive);
        }
    });

    return result;
}


function openCapitalSelector() {

    const modal =
        getElement("capitalSelectorModal");

    const list =
        getElement("capitalSelectorList");

    if (!modal || !list) {
        return;
    }


    const activeId =
        activeCapital ? activeCapital.id : null;


    const activeItem = activeCapital
        ? `
            <button
                type="button"
                class="capital-selector-item active"
                data-capital-id="${escapeHtml(activeCapital.id)}">

                <div>
                    <strong>
                        ${escapeHtml(activeCapital.name)}
                    </strong>

                    <small>
                        Capital actif
                    </small>
                </div>

                <span>
                    ${money(calculateCurrentBalance())}
                </span>

            </button>
        `
        : "";


    const archivedItems = archives
        .filter(archive => archive.id !== activeId)
        .map(archive => {

            const balance =
                parseNumber(archive.initialCapital) +
                calculateProfit(archive.trades || []);

            return `
                <button
                    type="button"
                    class="capital-selector-item"
                    data-archive-id="${escapeHtml(archive.id)}">

                    <div>
                        <strong>
                            ${escapeHtml(archive.name || "Capital")}
                        </strong>

                        <small>
                            Archivé
                        </small>
                    </div>

                    <span>
                        ${money(balance)}
                    </span>

                </button>
            `;
        })
        .join("");


    if (!activeItem && !archivedItems) {

        list.innerHTML = `
            <div class="empty-cell">
                Aucun capital disponible.
            </div>
        `;

    } else {

        list.innerHTML =
            activeItem +
            archivedItems;
    }


    list.querySelectorAll(
        "[data-capital-id]"
    ).forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const id =
                    button.dataset.capitalId;

                if (activeCapital && activeCapital.id === id) {
                    closeCapitalSelector();
                    return;
                }

                closeCapitalSelector();
            }
        );
    });


    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
}


function closeCapitalSelector() {

    const modal =
        getElement("capitalSelectorModal");

    if (!modal) {
        return;
    }

    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
}


/* ============================================================
   ARCHIVAGE DU CAPITAL
============================================================ */

function archiveActiveCapital() {

    if (!activeCapital) {
        alert("Aucun capital actif à archiver.");
        return;
    }


    const capitalTrades =
        getActiveCapitalTrades();


    const finalBalance =
        calculateCurrentBalance();


    const confirmed = confirm(
        "Archiver le capital « " +
        activeCapital.name +
        " » ?\n\n" +
        "Solde final : " +
        money(finalBalance)
    );


    if (!confirmed) {
        return;
    }


    const archive = {
        ...activeCapital,

        archivedAt:
            new Date().toISOString(),

        finalBalance,

        trades:
            JSON.parse(
                JSON.stringify(capitalTrades)
            )
    };


    archives.unshift(archive);


    trades = trades.filter(
        trade =>
            trade.capitalId !== activeCapital.id
    );


    saveTrades();
    saveArchives();


    activeCapital = null;

    saveActiveCapital();


    renderAll();

    showPage("archives");
}


/* ============================================================
   TRADE — FORMULAIRE
============================================================ */

function populateTradeForm() {

    const assetSelect =
        getElement("tradeAsset");

    const setupSelect =
        getElement("tradeSetup");


    if (assetSelect) {

        assetSelect.innerHTML =
            ASSETS.map(asset => `
                <option value="${escapeHtml(asset)}">
                    ${escapeHtml(asset)}
                </option>
            `).join("");
    }


    if (setupSelect) {

        setupSelect.innerHTML =
            `<option value="">Sans setup</option>` +
            SETUPS.map(setup => `
                <option value="${escapeHtml(setup)}">
                    ${escapeHtml(setup)}
                </option>
            `).join("");
    }
}


function openTradeModal() {

    if (!activeCapital) {

        alert(
            "Crée d'abord un capital actif avant d'enregistrer un trade."
        );

        openCapitalModal("new");

        return;
    }


    const modal =
        getElement("tradeModal");

    if (!modal) {
        return;
    }


    editingTradeId = null;


    setValue(
        "tradeDate",
        getTodayDate()
    );

    setValue(
        "tradeDirection",
        "BUY"
    );

    setValue(
        "tradeOrderType",
        "MARKET"
    );

    setValue(
        "tradeLot",
        MIN_LOT.toFixed(2)
    );

    setValue("tradeEntry", "");
    setValue("tradeSL", "");
    setValue("tradeTP", "");
    setValue("calculatedRR", "");
    setValue("tradePips", "");
    setValue("tradeProfit", "");
    setValue("tradeComment", "");
    setValue("tradeResult", "TP");
    setValue("tradeSetup", "");


    setText(
        "tradeRiskAmount",
        money(getCapitalRisk())
    );

    setText(
        "tradePotentialProfit",
        money(getCapitalObjective())
    );

    setText(
        "tradeSLDistance",
        "—"
    );


    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");

    document.body.classList.add(
        "trade-modal-open"
    );


    updateAutomaticTradeValues();


    setTimeout(() => {

        const asset =
            getElement("tradeAsset");

        if (asset) {
            asset.focus();
        }

    }, 50);
}


function closeTradeModal() {

    const modal =
        getElement("tradeModal");

    if (!modal) {
        return;
    }

    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");

    document.body.classList.remove(
        "trade-modal-open"
    );

    editingTradeId = null;
}


/* ============================================================
   CALCULS TRADE
============================================================ */

function getAssetPriceDecimals(asset) {

    if (asset === "XAUUSD") {
        return 2;
    }

    if (asset === "BTCUSD") {
        return 2;
    }

    if (
        asset === "USD/JPY"
    ) {
        return 3;
    }

    return 5;
}


function getPipSize(asset) {

    if (asset === "XAUUSD") {
        return 0.01;
    }

    if (asset === "BTCUSD") {
        return 1;
    }

    if (asset === "USD/JPY") {
        return 0.01;
    }

    return 0.0001;
}


function calculateStopDistance(entry, sl) {

    return Math.abs(
        parseNumber(entry) -
        parseNumber(sl)
    );
}


function calculateTargetPrice(
    entry,
    sl,
    direction,
    rr
) {

    entry = parseNumber(entry);
    sl = parseNumber(sl);
    rr = parseNumber(rr);

    if (
        entry <= 0 ||
        sl <= 0 ||
        rr <= 0
    ) {
        return 0;
    }


    const riskDistance =
        Math.abs(entry - sl);


    if (direction === "SELL") {

        return entry -
            riskDistance * rr;

    }


    return entry +
        riskDistance * rr;
}


function calculateTradeRR(
    entry,
    sl,
    tp
) {

    const risk =
        Math.abs(
            parseNumber(entry) -
            parseNumber(sl)
        );

    const reward =
        Math.abs(
            parseNumber(tp) -
            parseNumber(entry)
        );

    if (risk <= 0) {
        return null;
    }

    return reward / risk;
}


function getTradeTargetRR(trade) {

    if (!trade) {
        return null;
    }


    if (trade.rr !== undefined) {

        const rr =
            parseNumber(trade.rr);

        if (rr > 0) {
            return rr;
        }
    }


    const rr =
        calculateTradeRR(
            trade.entry,
            trade.sl,
            trade.tp
        );


    return rr && rr > 0
        ? rr
        : null;
}


function calculateLotFromRisk(
    asset,
    entry,
    sl,
    riskMoney
) {

    const distance =
        calculateStopDistance(
            entry,
            sl
        );


    if (
        distance <= 0 ||
        riskMoney <= 0
    ) {
        return MIN_LOT;
    }


    /*
       Modèle simplifié et cohérent pour le dashboard.

       Forex :
       pip value approximative = 10 $ / lot.

       XAUUSD :
       estimation simplifiée basée sur 100 unités.

       BTCUSD :
       estimation simplifiée basée sur 1 unité.
    */

    const pipSize =
        getPipSize(asset);


    const pips =
        distance / pipSize;


    let pipValuePerLot = 10;


    if (asset === "XAUUSD") {
        pipValuePerLot = 1;
    }

    if (asset === "BTCUSD") {
        pipValuePerLot = 1;
    }


    if (pips <= 0) {
        return MIN_LOT;
    }


    let lot =
        riskMoney /
        (pips * pipValuePerLot);


    lot =
        Math.max(
            MIN_LOT,
            roundToStep(
                lot,
                LOT_STEP
            )
        );


    return Number(
        lot.toFixed(2)
    );
}


function calculatePips(
    asset,
    entry,
    exitPrice
) {

    const pipSize =
        getPipSize(asset);


    if (pipSize <= 0) {
        return 0;
    }


    return Math.abs(
        parseNumber(exitPrice) -
        parseNumber(entry)
    ) / pipSize;
}


function calculateProfitFromResult(
    result,
    riskMoney,
    rr
) {

    riskMoney = parseNumber(riskMoney);
    rr = parseNumber(rr);

    switch (result) {

        case "TP":
            return riskMoney * rr;

        case "SL":
            return -riskMoney;

        case "BE":
        default:
            return 0;
    }
}


function updateAutomaticTradeValues() {

    const asset =
        getValue("tradeAsset");

    const direction =
        getValue("tradeDirection");

    const entry =
        parseNumber(
            getValue("tradeEntry")
        );

    const sl =
        parseNumber(
            getValue("tradeSL")
        );


    const riskMoney =
        getCapitalRisk();


    const rrTarget =
        getCapitalRR();


    if (
        entry <= 0 ||
        sl <= 0 ||
        !activeCapital
    ) {

        setValue(
            "tradeTP",
            ""
        );

        setValue(
            "calculatedRR",
            ""
        );

        setValue(
            "tradeLot",
            MIN_LOT.toFixed(2)
        );

        setText(
            "tradeSLDistance",
            "—"
        );

        return;
    }


    const distance =
        calculateStopDistance(
            entry,
            sl
        );


    const lot =
        calculateLotFromRisk(
            asset,
            entry,
            sl,
            riskMoney
        );


    const tp =
        calculateTargetPrice(
            entry,
            sl,
            direction,
            rrTarget
        );


    const calculatedRR =
        calculateTradeRR(
            entry,
            sl,
            tp
        );


    const decimals =
        getAssetPriceDecimals(
            asset
        );


    setValue(
        "tradeLot",
        lot.toFixed(2)
    );


    setValue(
        "tradeTP",
        tp > 0
            ? tp.toFixed(decimals)
            : ""
    );


    setValue(
        "calculatedRR",
        calculatedRR
            ? calculatedRR.toFixed(2) + "R"
            : ""
    );


    const pips =
        calculatePips(
            asset,
            entry,
            sl
        );


    setValue(
        "tradePips",
        pips
            ? pips.toFixed(1)
            : ""
    );


    setText(
        "tradeRiskAmount",
        money(riskMoney)
    );


    setText(
        "tradePotentialProfit",
        money(
            riskMoney *
            rrTarget
        )
    );


    setText(
        "tradeSLDistance",
        pips
            ? pips.toFixed(1) + " pips"
            : "—"
    );


    updateTradeProfitPreview();
}


function updateTradeProfitPreview() {

    const result =
        getValue("tradeResult");

    const rr =
        parseNumber(
            getValue("calculatedRR")
                .replace("R", "")
        ) || getCapitalRR();


    const risk =
        getCapitalRisk();


    const profit =
        calculateProfitFromResult(
            result,
            risk,
            rr
        );


    setValue(
        "tradeProfit",
        profit.toFixed(2)
    );
}


/* ============================================================
   TRADE — SAUVEGARDE
============================================================ */

function saveTradeFromForm(event) {

    event.preventDefault();


    if (!activeCapital) {
        alert("Aucun capital actif.");
        return;
    }


    const asset =
        getValue("tradeAsset");

    const date =
        getValue("tradeDate") ||
        getTodayDate();

    const direction =
        getValue("tradeDirection") ||
        "BUY";

    const orderType =
        getValue("tradeOrderType") ||
        "MARKET";

    const lot =
        parseNumber(
            getValue("tradeLot")
        );

    const entry =
        parseNumber(
            getValue("tradeEntry")
        );

    const sl =
        parseNumber(
            getValue("tradeSL")
        );

    const tp =
        parseNumber(
            getValue("tradeTP")
        );

    const rr =
        calculateTradeRR(
            entry,
            sl,
            tp
        );

    const pips =
        parseNumber(
            getValue("tradePips")
        );

    const setup =
        getValue("tradeSetup");

    const result =
        getValue("tradeResult");

    const comment =
        getValue("tradeComment").trim();


    if (!asset) {
        alert("Sélectionne un actif.");
        return;
    }

    if (
        entry <= 0 ||
        sl <= 0
    ) {
        alert(
            "L'Entry et le Stop Loss doivent être supérieurs à 0."
        );

        return;
    }


    if (entry === sl) {

        alert(
            "L'Entry et le Stop Loss doivent être différents."
        );

        return;
    }


    if (
        !tp ||
        tp <= 0
    ) {

        alert(
            "Le Take Profit n'a pas pu être calculé."
        );

        return;
    }


    if (
        rr === null ||
        rr < MIN_RR
    ) {

        alert(
            "Le RR du trade doit être au minimum de " +
            MIN_RR.toFixed(2) +
            "R."
        );

        return;
    }


    if (
        lot <= 0
    ) {

        alert(
            "Le lot doit être supérieur à 0."
        );

        return;
    }


    const risk =
        getCapitalRisk();


    const finalProfit =
        calculateProfitFromResult(
            result,
            risk,
            rr
        );


    const now =
        new Date().toISOString();


    const tradeData = {

        id:
            editingTradeId ||
            generateId(),

        capitalId:
            activeCapital.id,

        asset,

        date,

        direction,

        orderType,

        lot,

        entry,

        sl,

        tp,

        rr,

        pips,

        setup,

        result,

        profit:
            finalProfit,

        pnl:
            finalProfit,

        riskAmount:
            risk,

        comment,

        createdAt:
            editingTradeId
                ? getExistingTradeCreatedAt(
                    editingTradeId
                )
                : now,

        recordedAt:
            now
    };


    if (editingTradeId) {

        const index =
            trades.findIndex(
                trade =>
                    trade.id === editingTradeId
            );


        if (index !== -1) {
            trades[index] = tradeData;
        }

    } else {

        trades.push(tradeData);
    }


    saveTrades();

    closeTradeModal();

    renderAll();

    showPage("dashboard");
}


function getExistingTradeCreatedAt(id) {

    const trade =
        trades.find(
            item => item.id === id
        );

    return trade &&
        trade.createdAt
        ? trade.createdAt
        : new Date().toISOString();
}


/* ============================================================
   TRADE — MODIFICATION
============================================================ */

function editTrade(id) {

    const trade =
        trades.find(
            item => item.id === id
        );


    if (!trade) {
        return;
    }


    if (
        !activeCapital ||
        trade.capitalId !== activeCapital.id
    ) {

        alert(
            "Ce trade n'appartient pas au capital actif."
        );

        return;
    }


    editingTradeId = id;


    const modal =
        getElement("tradeModal");

    if (!modal) {
        return;
    }


    setValue(
        "tradeAsset",
        trade.asset || ASSETS[0]
    );

    setValue(
        "tradeDate",
        trade.date || getTodayDate()
    );

    setValue(
        "tradeDirection",
        trade.direction || "BUY"
    );

    setValue(
        "tradeOrderType",
        trade.orderType || "MARKET"
    );

    setValue(
        "tradeLot",
        parseNumber(
            trade.lot
        ).toFixed(2)
    );

    setValue(
        "tradeEntry",
        trade.entry || ""
    );

    setValue(
        "tradeSL",
        trade.sl || ""
    );

    setValue(
        "tradeTP",
        trade.tp || ""
    );

    setValue(
        "calculatedRR",
        trade.rr
            ? parseNumber(trade.rr).toFixed(2) + "R"
            : ""
    );

    setValue(
        "tradePips",
        trade.pips || ""
    );

    setValue(
        "tradeResult",
        trade.result || "BE"
    );

    setValue(
        "tradeSetup",
        trade.setup || ""
    );

    setValue(
        "tradeProfit",
        parseNumber(
            trade.profit !== undefined
                ? trade.profit
                : trade.pnl
        ).toFixed(2)
    );

    setValue(
        "tradeComment",
        trade.comment || ""
    );


    setText(
        "tradeRiskAmount",
        money(
            trade.riskAmount ||
            getCapitalRisk()
        )
    );


    setText(
        "tradePotentialProfit",
        money(
            getCapitalRisk() *
            getTradeTargetRR(trade)
        )
    );


    const distance =
        calculatePips(
            trade.asset,
            trade.entry,
            trade.sl
        );


    setText(
        "tradeSLDistance",
        distance
            ? distance.toFixed(1) + " pips"
            : "—"
    );


    setText(
        "tradeModalTitle",
        "Modifier le trade"
    );


    modal.classList.add("show");
    modal.setAttribute(
        "aria-hidden",
        "false"
    );

    document.body.classList.add(
        "trade-modal-open"
    );
}


function deleteTrade(id) {

    const trade =
        trades.find(
            item => item.id === id
        );


    if (!trade) {
        return;
    }


    const confirmed =
        confirm(
            "Supprimer ce trade ?"
        );


    if (!confirmed) {
        return;
    }


    trades =
        trades.filter(
            item => item.id !== id
        );


    saveTrades();

    renderAll();
}


/* ============================================================
   TRADE — EFFACER
============================================================ */

function clearTrades() {

    if (!activeCapital) {
        alert("Aucun capital actif.");
        return;
    }


    const capitalTrades =
        getActiveCapitalTrades();


    if (capitalTrades.length === 0) {
        alert("Aucun trade à supprimer.");
        return;
    }


    const confirmed =
        confirm(
            "Supprimer tous les trades du capital actif ?\n\n" +
            "Cette action est irréversible."
        );


    if (!confirmed) {
        return;
    }


    trades =
        trades.filter(
            trade =>
                trade.capitalId !==
                activeCapital.id
        );


    saveTrades();

    renderAll();
}


/* ============================================================
   STATISTIQUES AVANCÉES
============================================================ */

function calculateAdvancedStats(tradeList) {

    const list =
        Array.isArray(tradeList)
            ? tradeList
            : [];


    const total =
        list.length;


    let wins = 0;
    let losses = 0;
    let breakeven = 0;


    let totalProfit = 0;
    let grossProfit = 0;
    let grossLoss = 0;


    let bestTrade =
        total > 0
            ? -Infinity
            : 0;

    let worstTrade =
        total > 0
            ? Infinity
            : 0;


    let totalRR = 0;
    let rrCount = 0;


    let currentWinStreak = 0;
    let currentLossStreak = 0;

    let maxWinStreak = 0;
    let maxLossStreak = 0;


    let equity =
        activeCapital
            ? parseNumber(
                activeCapital.initialCapital
            )
            : 0;


    let peakEquity = equity;
    let maxDrawdown = 0;


    const sorted =
        [...list].sort(
            (a, b) => {

                const dateA =
                    new Date(
                        a.createdAt ||
                        a.recordedAt ||
                        a.date ||
                        0
                    ).getTime();

                const dateB =
                    new Date(
                        b.createdAt ||
                        b.recordedAt ||
                        b.date ||
                        0
                    ).getTime();

                return dateA - dateB;
            }
        );


    sorted.forEach(trade => {

        const profit =
            parseNumber(
                trade.profit !== undefined
                    ? trade.profit
                    : trade.pnl
            );


        totalProfit += profit;


        if (profit > 0) {

            wins++;

            grossProfit += profit;

            currentWinStreak++;
            currentLossStreak = 0;

            maxWinStreak =
                Math.max(
                    maxWinStreak,
                    currentWinStreak
                );

        } else if (profit < 0) {

            losses++;

            grossLoss += Math.abs(profit);

            currentLossStreak++;
            currentWinStreak = 0;

            maxLossStreak =
                Math.max(
                    maxLossStreak,
                    currentLossStreak
                );

        } else {

            breakeven++;

            currentWinStreak = 0;
            currentLossStreak = 0;
        }


        bestTrade =
            Math.max(
                bestTrade,
                profit
            );

        worstTrade =
            Math.min(
                worstTrade,
                profit
            );


        const rr =
            getTradeTargetRR(trade);


        if (
            rr !== null &&
            Number.isFinite(rr)
        ) {

            totalRR += rr;
            rrCount++;
        }


        equity += profit;

        peakEquity =
            Math.max(
                peakEquity,
                equity
            );


        const drawdown =
            equity - peakEquity;


        maxDrawdown =
            Math.min(
                maxDrawdown,
                drawdown
            );
    });


    const winrate =
        total > 0
            ? wins / total * 100
            : 0;


    const averageTrade =
        total > 0
            ? totalProfit / total
            : 0;


    const averageWin =
        wins > 0
            ? grossProfit / wins
            : 0;


    const averageLoss =
        losses > 0
            ? -(grossLoss / losses)
            : 0;


    const profitFactor =
        grossLoss > 0
            ? grossProfit / grossLoss
            : grossProfit > 0
                ? Infinity
                : 0;


    const averageRR =
        rrCount > 0
            ? totalRR / rrCount
            : 0;


    return {

        total,

        wins,

        losses,

        breakeven,

        totalProfit,

        grossProfit,

        grossLoss,

        winrate,

        averageTrade,

        averageWin,

        averageLoss,

        bestTrade:
            total > 0
                ? bestTrade
                : 0,

        worstTrade:
            total > 0
                ? worstTrade
                : 0,

        maxWinStreak,

        maxLossStreak,

        maxDrawdown,

        profitFactor,

        averageRR,

        endingBalance:
            (activeCapital
                ? parseNumber(
                    activeCapital.initialCapital
                )
                : 0
            ) + totalProfit
    };
}


/* ============================================================
   STATISTIQUES DE RISQUE — V51
============================================================ */

function calculateRiskStats(tradeList) {

    const list =
        Array.isArray(tradeList)
            ? tradeList
            : [];


    const referenceRisk =
        getCapitalRisk();


    const risks =
        list.map(trade => {

            const explicit =
                parseNumber(
                    trade.riskAmount
                );


            if (explicit > 0) {
                return explicit;
            }


            const profit =
                Math.abs(
                    parseNumber(
                        trade.profit !== undefined
                            ? trade.profit
                            : trade.pnl
                    )
                );


            if (
                trade.result === "SL" &&
                profit > 0
            ) {
                return profit;
            }


            return referenceRisk;
        })
        .filter(
            value => value > 0
        );


    if (risks.length === 0) {

        return {

            averageRisk: 0,

            minimumRisk: 0,

            maximumRisk: 0,

            referenceRisk,

            averageDeviation: 0,

            riskRegularity: 0,

            compliantTrades: 0,

            nonCompliantTrades: 0
        };
    }


    const averageRisk =
        risks.reduce(
            (sum, value) =>
                sum + value,
            0
        ) / risks.length;


    const minimumRisk =
        Math.min(...risks);


    const maximumRisk =
        Math.max(...risks);


    const deviations =
        referenceRisk > 0
            ? risks.map(
                risk =>
                    Math.abs(
                        risk -
                        referenceRisk
                    ) /
                    referenceRisk
            )
            : risks.map(() => 0);


    const averageDeviation =
        deviations.reduce(
            (sum, value) =>
                sum + value,
            0
        ) /
        deviations.length;


    let compliantTrades = 0;
    let nonCompliantTrades = 0;


    risks.forEach(risk => {

        if (!referenceRisk) {
            return;
        }


        const deviation =
            Math.abs(
                risk -
                referenceRisk
            ) /
            referenceRisk;


        if (
            deviation <=
            RISK_TOLERANCE
        ) {

            compliantTrades++;

        } else {

            nonCompliantTrades++;
        }
    });


    const riskRegularity =
        risks.length > 0
            ? compliantTrades /
                risks.length *
                100
            : 0;


    return {

        averageRisk,

        minimumRisk,

        maximumRisk,

        referenceRisk,

        averageDeviation,

        riskRegularity,

        compliantTrades,

        nonCompliantTrades
    };
}


/* ============================================================
   PERFORMANCE SETUPS
============================================================ */

function buildSetupStats(tradeList) {

    const groups = {};


    (tradeList || []).forEach(trade => {

        const setup =
            trade.setup ||
            "Sans setup";


        if (!groups[setup]) {

            groups[setup] = {

                setup,

                trades: 0,

                wins: 0,

                losses: 0,

                breakeven: 0,

                profit: 0
            };
        }


        const item =
            groups[setup];


        const profit =
            parseNumber(
                trade.profit !== undefined
                    ? trade.profit
                    : trade.pnl
            );


        item.trades++;

        item.profit += profit;


        if (profit > 0) {

            item.wins++;

        } else if (profit < 0) {

            item.losses++;

        } else {

            item.breakeven++;
        }
    });


    return Object.values(groups)
        .map(item => ({

            ...item,

            winrate:
                item.trades > 0
                    ? item.wins /
                        item.trades *
                        100
                    : 0
        }))
        .sort(
            (a, b) =>
                b.profit -
                a.profit
        );
}


function renderPerformanceSetupTable(
    tradeList
) {

    const tbody =
        getElement("setupTableBody");


    if (!tbody) {
        return;
    }


    const stats =
        buildSetupStats(
            tradeList
        );


    if (stats.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-cell">
                    Aucun trade.
                </td>
            </tr>
        `;

        return;
    }


    tbody.innerHTML =
        stats.map(item => `

            <tr>

                <td>
                    ${escapeHtml(item.setup)}
                </td>

                <td>
                    ${item.trades}
                </td>

                <td>
                    ${item.wins}
                </td>

                <td>
                    ${item.losses}
                </td>

                <td>
                    ${formatPercent(item.winrate)}
                </td>

                <td>
                    ${item.breakeven}
                </td>

                <td class="${item.profit >= 0 ? "profit-positive" : "profit-negative"}">
                    ${money(item.profit)}
                </td>

            </tr>

        `).join("");
}


/* ============================================================
   PERFORMANCE ACTIFS
============================================================ */

function buildAssetStats(tradeList) {

    const groups = {};


    (tradeList || []).forEach(trade => {

        const asset =
            trade.asset ||
            "Sans actif";


        if (!groups[asset]) {

            groups[asset] = {

                asset,

                trades: 0,

                wins: 0,

                losses: 0,

                breakeven: 0,

                profit: 0,

                rrTotal: 0,

                rrCount: 0,

                best: 0,

                worst: 0
            };
        }


        const item =
            groups[asset];


        const profit =
            parseNumber(
                trade.profit !== undefined
                    ? trade.profit
                    : trade.pnl
            );


        const rr =
            getTradeTargetRR(trade);


        item.trades++;

        item.profit += profit;


        if (profit > 0) {

            item.wins++;

        } else if (profit < 0) {

            item.losses++;

        } else {

            item.breakeven++;
        }


        if (
            rr !== null &&
            Number.isFinite(rr)
        ) {

            item.rrTotal += rr;
            item.rrCount++;
        }


        if (
            item.trades === 1
        ) {

            item.best = profit;
            item.worst = profit;

        } else {

            item.best =
                Math.max(
                    item.best,
                    profit
                );

            item.worst =
                Math.min(
                    item.worst,
                    profit
                );
        }
    });


    return Object.values(groups)
        .map(item => ({

            ...item,

            winrate:
                item.trades > 0
                    ? item.wins /
                        item.trades *
                        100
                    : 0,

            averageRR:
                item.rrCount > 0
                    ? item.rrTotal /
                        item.rrCount
                    : 0
        }))
        .sort(
            (a, b) =>
                b.profit -
                a.profit
        );
}


function renderPerformanceAssetTable(
    tradeList
) {

    const tbody =
        getElement("assetTableBody");


    if (!tbody) {
        return;
    }


    const stats =
        buildAssetStats(
            tradeList
        );


    if (stats.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-cell">
                    Aucun trade.
                </td>
            </tr>
        `;

        return;
    }


    tbody.innerHTML =
        stats.map(item => `

            <tr>

                <td>
                    ${escapeHtml(item.asset)}
                </td>

                <td>
                    ${item.trades}
                </td>

                <td>
                    ${item.wins}
                </td>

                <td>
                    ${item.losses}
                </td>

                <td>
                    ${item.breakeven}
                </td>

                <td>
                    ${formatPercent(item.winrate)}
                </td>

                <td class="${item.profit >= 0 ? "profit-positive" : "profit-negative"}">
                    ${money(item.profit)}
                </td>

                <td>
                    ${item.averageRR
                        ? item.averageRR.toFixed(2) + "R"
                        : "—"}
                </td>

                <td>
                    ${money(item.best)}
                </td>

                <td>
                    ${money(item.worst)}
                </td>

            </tr>

        `).join("");
}


/* ============================================================
   HISTORIQUE
============================================================ */

function renderHistory() {

    const tbody =
        getElement("historyBody");


    if (!tbody) {
        return;
    }


    const list =
        getActiveCapitalTrades()
            .slice()
            .sort(
                (a, b) =>
                    new Date(
                        b.createdAt ||
                        b.recordedAt ||
                        0
                    ) -
                    new Date(
                        a.createdAt ||
                        a.recordedAt ||
                        0
                    )
            );


    if (list.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td colspan="14" class="empty-cell">
                    Aucun trade enregistré.
                </td>
            </tr>
        `;

        return;
    }


    tbody.innerHTML =
        list.map(trade => {

            const profit =
                parseNumber(
                    trade.profit !== undefined
                        ? trade.profit
                        : trade.pnl
                );


            const resultClass =
                trade.result === "TP"
                    ? "result-win"
                    : trade.result === "SL"
                        ? "result-loss"
                        : "result-be";


            return `

                <tr>

                    <td>
                        ${escapeHtml(
                            trade.date || "—"
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            formatStoredDateTime(
                                trade.recordedAt ||
                                trade.createdAt
                            )
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            trade.asset || "—"
                        )}
                    </td>

                    <td>
                        ${escapeHtml(
                            trade.direction || "—"
                        )}
                    </td>

                    <td>
                        ${formatNumber(
                            trade.lot,
                            2
                        )}
                    </td>

                    <td>
                        ${formatNumber(
                            trade.entry,
                            getAssetPriceDecimals(
                                trade.asset
                            )
                        )}
                    </td>

                    <td>
                        ${formatNumber(
                            trade.sl,
                            getAssetPriceDecimals(
                                trade.asset
                            )
                        )}
                    </td>

                    <td>
                        ${formatNumber(
                            trade.tp,
                            getAssetPriceDecimals(
                                trade.asset
                            )
                        )}
                    </td>

                    <td>
                        ${trade.rr
                            ? formatNumber(
                                trade.rr,
                                2
                            ) + "R"
                            : "—"}
                    </td>

                    <td>
                        ${trade.pips !== undefined
                            ? formatNumber(
                                trade.pips,
                                1
                            )
                            : "—"}
                    </td>

                    <td>
                        ${escapeHtml(
                            trade.setup ||
                            "Sans setup"
                        )}
                    </td>

                    <td>
                        <span class="${resultClass}">
                            ${escapeHtml(
                                trade.result ||
                                "—"
                            )}
                        </span>
                    </td>

                    <td class="${profit >= 0 ? "profit-positive" : "profit-negative"}">
                        ${money(profit)}
                    </td>

                    <td>

                        <div class="table-actions">

                            <button
                                type="button"
                                class="archive-view-btn"
                                data-edit-trade="${escapeHtml(trade.id)}">
                                Modifier
                            </button>

                            <button
                                type="button"
                                class="delete-btn"
                                data-delete-trade="${escapeHtml(trade.id)}">
                                Supprimer
                            </button>

                        </div>

                    </td>

                </tr>
            `;
        }).join("");
}


/* ============================================================
   PERFORMANCE
============================================================ */

function renderPerformance() {

    const list =
        getTradesForPeriod(
            currentPeriod
        );


    const stats =
        calculateAdvancedStats(
            list
        );


    setText(
        "statBalance",
        money(
            stats.endingBalance
        )
    );

    setText(
        "statProfit",
        money(
            stats.totalProfit
        )
    );

    setText(
        "statWinrate",
        formatPercent(
            stats.winrate
        )
    );

    setText(
        "statAverageRR",
        stats.averageRR
            ? stats.averageRR.toFixed(2) + "R"
            : "—"
    );

    setText(
        "statTrades",
        stats.total
    );


    const setupStats =
        buildSetupStats(list);


    setText(
        "statBestSetup",
        setupStats.length > 0
            ? setupStats[0].setup
            : "—"
    );


    const lastTrade =
        [...list]
            .sort(
                (a, b) =>
                    new Date(
                        b.date || 0
                    ) -
                    new Date(
                        a.date || 0
                    )
            )[0];


    setText(
        "statLastTrade",
        lastTrade
            ? lastTrade.date
            : "—"
    );


    setText(
        "statProfitFactor",
        stats.profitFactor === Infinity
            ? "∞"
            : stats.profitFactor
                ? stats.profitFactor.toFixed(2)
                : "—"
    );


    setText(
        "statAverageTrade",
        money(
            stats.averageTrade
        )
    );

    setText(
        "statAverageWin",
        money(
            stats.averageWin
        )
    );

    setText(
        "statAverageLoss",
        money(
            stats.averageLoss
        )
    );

    setText(
        "statBestTrade",
        money(
            stats.bestTrade
        )
    );

    setText(
        "statWorstTrade",
        money(
            stats.worstTrade
        )
    );

    setText(
        "statMaxWinStreak",
        stats.maxWinStreak
    );

    setText(
        "statMaxLossStreak",
        stats.maxLossStreak
    );

    setText(
        "statMaxDrawdown",
        money(
            stats.maxDrawdown
        )
    );


    renderPerformanceSetupTable(
        list
    );

    renderPerformanceAssetTable(
        list
    );

    renderHistory();


    document.querySelectorAll(
        ".period-btn"
    ).forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.period ===
                currentPeriod
        );
    });
}


/* ============================================================
   DASHBOARD
============================================================ */

function renderDashboard() {

    if (!activeCapital) {

        setText(
            "activeCapitalName",
            "Aucun capital"
        );

        setText(
            "activeCapitalCreatedAt",
            "Crée un capital pour commencer."
        );

        setText(
            "initialCapital",
            "$0.00"
        );

        setText(
            "currentBalance",
            "$0.00"
        );

        setText(
            "totalProfit",
            "$0.00"
        );

        setText(
            "riskReference",
            "$0.00"
        );

        setText(
            "rrTarget",
            MIN_RR.toFixed(2) + "R"
        );

        setText(
            "theoreticalObjective",
            "$0.00"
        );

        drawCapitalChart([]);

        return;
    }


    const initial =
        parseNumber(
            activeCapital.initialCapital
        );


    const profit =
        calculateProfit(
            getActiveCapitalTrades()
        );


    const balance =
        initial + profit;


    setText(
        "activeCapitalName",
        activeCapital.name ||
        "Capital actif"
    );


    setText(
        "activeCapitalCreatedAt",
        activeCapital.createdAt
            ? "Créé le " +
                formatStoredDateTime(
                    activeCapital.createdAt
                )
            : "—"
    );


    setText(
        "initialCapital",
        money(initial)
    );


    setText(
        "currentBalance",
        money(balance)
    );


    setText(
        "totalProfit",
        money(profit)
    );


    setText(
        "riskReference",
        money(
            getCapitalRisk()
        )
    );


    setText(
        "rrTarget",
        getCapitalRR().toFixed(2) +
        "R"
    );


    setText(
        "theoreticalObjective",
        money(
            getCapitalObjective()
        )
    );


    const capitalTrades =
        getActiveCapitalTrades();


    drawCapitalChart(
        capitalTrades
    );
}


/* ============================================================
   GRAPHIQUE CAPITAL
============================================================ */

function drawCapitalChart(tradeList) {

    const canvas =
        getElement("capitalChart");

    const empty =
        getElement("emptyChartMessage");


    if (!canvas) {
        return;
    }


    const ctx =
        canvas.getContext("2d");


    if (!ctx) {
        return;
    }


    const rect =
        canvas.getBoundingClientRect();


    const width =
        Math.max(
            rect.width,
            300
        );


    const height =
        Math.max(
            rect.height,
            240
        );


    const ratio =
        window.devicePixelRatio ||
        1;


    canvas.width =
        width * ratio;

    canvas.height =
        height * ratio;

    canvas.style.width =
        width + "px";

    canvas.style.height =
        height + "px";


    ctx.setTransform(
        ratio,
        0,
        0,
        ratio,
        0,
        0
    );


    ctx.clearRect(
        0,
        0,
        width,
        height
    );


    if (
        !activeCapital ||
        !tradeList ||
        tradeList.length === 0
    ) {

        if (empty) {
            empty.style.display = "flex";
        }

        return;
    }


    if (empty) {
        empty.style.display = "none";
    }


    const sorted =
        [...tradeList]
            .sort(
                (a, b) =>
                    new Date(
                        a.date ||
                        a.createdAt ||
                        0
                    ) -
                    new Date(
                        b.date ||
                        b.createdAt ||
                        0
                    )
            );


    const points = [];


    let balance =
        parseNumber(
            activeCapital.initialCapital
        );


    points.push({
        balance,
        date: "Initial"
    });


    sorted.forEach(trade => {

        balance +=
            parseNumber(
                trade.profit !== undefined
                    ? trade.profit
                    : trade.pnl
            );


        points.push({
            balance,
            date:
                trade.date ||
                ""
        });
    });


    const padding = {
        top: 30,
        right: 30,
        bottom: 40,
        left: 70
    };


    const chartWidth =
        width -
        padding.left -
        padding.right;


    const chartHeight =
        height -
        padding.top -
        padding.bottom;


    const values =
        points.map(
            point => point.balance
        );


    let min =
        Math.min(...values);

    let max =
        Math.max(...values);


    if (min === max) {

        min -= 1;
        max += 1;

    } else {

        const margin =
            (max - min) * 0.1;

        min -= margin;
        max += margin;
    }


    const xStep =
        points.length > 1
            ? chartWidth /
                (points.length - 1)
            : 0;


    function getX(index) {

        if (points.length === 1) {
            return (
                padding.left +
                chartWidth / 2
            );
        }

        return (
            padding.left +
            index * xStep
        );
    }


    function getY(value) {

        return (
            padding.top +
            chartHeight -
            (
                (value - min) /
                (max - min)
            ) *
            chartHeight
        );
    }


    /* Grille */

    ctx.font =
        "12px Arial";


    ctx.textAlign =
        "right";


    ctx.textBaseline =
        "middle";


    for (let i = 0; i <= 4; i++) {

        const ratioY =
            i / 4;

        const y =
            padding.top +
            ratioY *
            chartHeight;


        const value =
            max -
            ratioY *
            (max - min);


        ctx.beginPath();

        ctx.moveTo(
            padding.left,
            y
        );

        ctx.lineTo(
            width -
                padding.right,
            y
        );

        ctx.strokeStyle =
            "rgba(128,128,128,.18)";

        ctx.lineWidth = 1;

        ctx.stroke();


        ctx.fillStyle =
            "rgba(160,160,160,.9)";

        ctx.fillText(
            money(value),
            padding.left - 10,
            y
        );
    }


    /* Ligne */

    ctx.beginPath();


    points.forEach(
        (point, index) => {

            const x =
                getX(index);

            const y =
                getY(
                    point.balance
                );


            if (index === 0) {

                ctx.moveTo(
                    x,
                    y
                );

            } else {

                ctx.lineTo(
                    x,
                    y
                );
            }
        }
    );


    ctx.strokeStyle =
        getComputedStyle(
            document.body
        ).getPropertyValue(
            "--accent"
        ) ||
        "#00e5ff";


    ctx.lineWidth = 3;

    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.stroke();


    /* Points */

    points.forEach(
        (point, index) => {

            const x =
                getX(index);

            const y =
                getY(
                    point.balance
                );


            ctx.beginPath();

            ctx.arc(
                x,
                y,
                4,
                0,
                Math.PI * 2
            );


            ctx.fillStyle =
                getComputedStyle(
                    document.body
                ).getPropertyValue(
                    "--accent"
                ) ||
                "#00e5ff";


            ctx.fill();
        }
    );
}


/* ============================================================
   ANALYSE — FILTRES
============================================================ */

function populateAnalysisFilters() {

    const assetSelect =
        getElement(
            "analysisAssetFilter"
        );


    const setupSelect =
        getElement(
            "analysisSetupFilter"
        );


    if (assetSelect) {

        const current =
            analysisFilters.asset;


        assetSelect.innerHTML =
            `<option value="all">
                Tous les actifs
            </option>` +
            ASSETS.map(asset => `
                <option value="${escapeHtml(asset)}">
                    ${escapeHtml(asset)}
                </option>
            `).join("");


        assetSelect.value =
            ASSETS.includes(current)
                ? current
                : "all";
    }


    if (setupSelect) {

        const current =
            analysisFilters.setup;


        setupSelect.innerHTML =
            `<option value="all">
                Tous les setups
            </option>` +
            SETUPS.map(setup => `
                <option value="${escapeHtml(setup)}">
                    ${escapeHtml(setup)}
                </option>
            `).join("");


        setupSelect.value =
            SETUPS.includes(current)
                ? current
                : "all";
    }


    setValue(
        "analysisPeriodFilter",
        analysisFilters.period
    );

    setValue(
        "analysisResultFilter",
        analysisFilters.result
    );
}


function getFilteredAnalysisTrades() {

    let list =
        getActiveCapitalTrades();


    list =
        filterTradesByPeriod(
            list,
            analysisFilters.period
        );


    if (
        analysisFilters.asset !== "all"
    ) {

        list =
            list.filter(
                trade =>
                    trade.asset ===
                    analysisFilters.asset
            );
    }


    if (
        analysisFilters.setup !== "all"
    ) {

        list =
            list.filter(
                trade =>
                    (
                        trade.setup ||
                        "Sans setup"
                    ) ===
                    analysisFilters.setup
            );
    }


    if (
        analysisFilters.result !== "all"
    ) {

        list =
            list.filter(
                trade =>
                    trade.result ===
                    analysisFilters.result
            );
    }


    return list;
}


function applyAnalysisFilters() {

    analysisFilters = {

        period:
            getValue(
                "analysisPeriodFilter"
            ) || "all",

        asset:
            getValue(
                "analysisAssetFilter"
            ) || "all",

        setup:
            getValue(
                "analysisSetupFilter"
            ) || "all",

        result:
            getValue(
                "analysisResultFilter"
            ) || "all"
    };


    renderAnalysis();
}


function resetAnalysisFilters() {

    analysisFilters = {

        period: "all",

        asset: "all",

        setup: "all",

        result: "all"
    };


    populateAnalysisFilters();

    renderAnalysis();
}


/* ============================================================
   ANALYSE — RENDU V51
============================================================ */

function renderAnalysis() {

    populateAnalysisFilters();


    const filteredTrades =
        getFilteredAnalysisTrades();


    /*
       Les fonctions V51 sont définies dans
       v51-filters.js.

       On vérifie leur existence avant appel
       pour éviter de casser toute l'application.
    */

    if (
        typeof displayRiskStats ===
        "function"
    ) {

        displayRiskStats(
            filteredTrades
        );
    }


    if (
        typeof displayRRStats ===
        "function"
    ) {

        displayRRStats(
            filteredTrades
        );
    }


    if (
        typeof renderSetupPerformance ===
        "function"
    ) {

        renderSetupPerformance(
            filteredTrades
        );
    }


    if (
        typeof renderAssetPerformance ===
        "function"
    ) {

        renderAssetPerformance(
            filteredTrades
        );
    }


    if (
        typeof renderSetupRanking ===
        "function"
    ) {

        renderSetupRanking(
            filteredTrades
        );
    }


    if (
        typeof renderRecommendations ===
        "function"
    ) {

        renderRecommendations(
            filteredTrades
        );
    }


    if (
        typeof renderCalendar ===
        "function"
    ) {

        renderCalendar(
            filteredTrades
        );
    }
}


/* ============================================================
   ARCHIVES
============================================================ */

function renderArchives() {

    const container =
        getElement("archivesList");


    if (!container) {
        return;
    }


    if (
        !archives ||
        archives.length === 0
    ) {

        container.innerHTML = `
            <div class="empty-cell">
                Aucun capital archivé.
            </div>
        `;

        return;
    }


    container.innerHTML =
        archives.map(
            archive => {

                const archiveTrades =
                    Array.isArray(
                        archive.trades
                    )
                        ? archive.trades
                        : [];


                const initial =
                    parseNumber(
                        archive.initialCapital
                    );


                const profit =
                    calculateProfit(
                        archiveTrades
                    );


                const finalBalance =
                    initial + profit;


                const winrate =
                    archiveTrades.length > 0
                        ? archiveTrades.filter(
                            trade =>
                                parseNumber(
                                    trade.profit !== undefined
                                        ? trade.profit
                                        : trade.pnl
                                ) > 0
                        ).length /
                        archiveTrades.length *
                        100
                        : 0;


                return `

                    <article
                        class="archive-card"
                        data-archive-card="${escapeHtml(archive.id)}">

                        <div class="archive-card-header">

                            <div>

                                <div class="section-label">
                                    ARCHIVED CAPITAL
                                </div>

                                <h3>
                                    ${escapeHtml(
                                        archive.name ||
                                        "Capital"
                                    )}
                                </h3>

                                <div class="muted">

                                    Créé :
                                    ${escapeHtml(
                                        formatStoredDateTime(
                                            archive.createdAt
                                        )
                                    )}

                                    <br>

                                    Archivé :
                                    ${escapeHtml(
                                        formatStoredDateTime(
                                            archive.archivedAt
                                        )
                                    )}

                                </div>

                            </div>

                        </div>


                        <div class="archive-summary">

                            <div class="archive-stat">

                                <span>
                                    Initial
                                </span>

                                <strong>
                                    ${money(initial)}
                                </strong>

                            </div>


                            <div class="archive-stat">

                                <span>
                                    Final
                                </span>

                                <strong>
                                    ${money(finalBalance)}
                                </strong>

                            </div>


                            <div class="archive-stat">

                                <span>
                                    Profit
                                </span>

                                <strong class="${profit >= 0 ? "profit-positive" : "profit-negative"}">
                                    ${money(profit)}
                                </strong>

                            </div>


                            <div class="archive-stat">

                                <span>
                                    Trades
                                </span>

                                <strong>
                                    ${archiveTrades.length}
                                </strong>

                            </div>


                            <div class="archive-stat">

                                <span>
                                    Winrate
                                </span>

                                <strong>
                                    ${formatPercent(winrate)}
                                </strong>

                            </div>

                        </div>


                        <div class="archive-actions">

                            <button
                                type="button"
                                class="archive-view-btn"
                                data-view-archive="${escapeHtml(archive.id)}">
                                Voir graphique
                            </button>

                            <button
                                type="button"
                                class="archive-delete-btn"
                                data-delete-archive="${escapeHtml(archive.id)}">
                                Supprimer
                            </button>

                        </div>

                    </article>

                `;
            }
        ).join("");
}


/* ============================================================
   ARCHIVE — GRAPHIQUE
============================================================ */

function openArchiveChart(id) {

    const archive =
        archives.find(
            item => item.id === id
        );


    if (!archive) {
        return;
    }


    editingArchiveId = id;


    setText(
        "archiveChartTitle",
        archive.name ||
        "Capital archivé"
    );


    setText(
        "archiveChartSubtitle",
        archive.archivedAt
            ? "Archivé le " +
                formatStoredDateTime(
                    archive.archivedAt
                )
            : "—"
    );


    const initial =
        parseNumber(
            archive.initialCapital
        );


    const profit =
        calculateProfit(
            archive.trades || []
        );


    const finalBalance =
        initial + profit;


    setText(
        "archiveChartInitial",
        money(initial)
    );

    setText(
        "archiveChartFinal",
        money(finalBalance)
    );

    setText(
        "archiveChartProfit",
        money(profit)
    );


    drawArchiveChart(
        archive
    );


    const modal =
        getElement(
            "archiveChartModal"
        );


    if (modal) {

        modal.classList.add(
            "show"
        );

        modal.setAttribute(
            "aria-hidden",
            "false"
        );
    }
}


function closeArchiveChart() {

    const modal =
        getElement(
            "archiveChartModal"
        );


    if (!modal) {
        return;
    }


    modal.classList.remove(
        "show"
    );

    modal.setAttribute(
        "aria-hidden",
        "true"
    );


    editingArchiveId = null;
}


function drawArchiveChart(archive) {

    const canvas =
        getElement("archiveChart");


    if (
        !canvas ||
        !archive
    ) {
        return;
    }


    const ctx =
        canvas.getContext("2d");


    const rect =
        canvas.getBoundingClientRect();


    const width =
        Math.max(
            rect.width,
            300
        );


    const height =
        Math.max(
            rect.height,
            240
        );


    const ratio =
        window.devicePixelRatio ||
        1;


    canvas.width =
        width * ratio;

    canvas.height =
        height * ratio;

    canvas.style.width =
        width + "px";

    canvas.style.height =
        height + "px";


    ctx.setTransform(
        ratio,
        0,
        0,
        ratio,
        0,
        0
    );


    ctx.clearRect(
        0,
        0,
        width,
        height
    );


    const archiveTrades =
        Array.isArray(
            archive.trades
        )
            ? archive.trades
            : [];


    let balance =
        parseNumber(
            archive.initialCapital
        );


    const points = [
        balance
    ];


    archiveTrades
        .slice()
        .sort(
            (a, b) =>
                new Date(
                    a.date ||
                    a.createdAt ||
                    0
                ) -
                new Date(
                    b.date ||
                    b.createdAt ||
                    0
                )
        )
        .forEach(trade => {

            balance +=
                parseNumber(
                    trade.profit !== undefined
                        ? trade.profit
                        : trade.pnl
                );

            points.push(balance);
        });


    if (points.length === 0) {
        return;
    }


    const padding = {
        top: 25,
        right: 25,
        bottom: 30,
        left: 70
    };


    const chartWidth =
        width -
        padding.left -
        padding.right;


    const chartHeight =
        height -
        padding.top -
        padding.bottom;


    let min =
        Math.min(...points);

    let max =
        Math.max(...points);


    if (min === max) {
        min -= 1;
        max += 1;
    }


    const margin =
        (max - min) * 0.1;


    min -= margin;
    max += margin;


    const step =
        points.length > 1
            ? chartWidth /
                (points.length - 1)
            : 0;


    const x =
        index =>
            points.length === 1
                ? padding.left +
                    chartWidth / 2
                : padding.left +
                    index * step;


    const y =
        value =>
            padding.top +
            chartHeight -
            (
                (value - min) /
                (max - min)
            ) *
            chartHeight;


    for (let i = 0; i <= 4; i++) {

        const lineY =
            padding.top +
            chartHeight *
            i /
            4;


        const value =
            max -
            (max - min) *
            i /
            4;


        ctx.beginPath();

        ctx.moveTo(
            padding.left,
            lineY
        );

        ctx.lineTo(
            width -
                padding.right,
            lineY
        );


        ctx.strokeStyle =
            "rgba(128,128,128,.18)";

        ctx.stroke();


        ctx.font =
            "12px Arial";

        ctx.textAlign =
            "right";

        ctx.textBaseline =
            "middle";

        ctx.fillStyle =
            "rgba(160,160,160,.9)";


        ctx.fillText(
            money(value),
            padding.left - 10,
            lineY
        );
    }


    ctx.beginPath();


    points.forEach(
        (value, index) => {

            if (index === 0) {

                ctx.moveTo(
                    x(index),
                    y(value)
                );

            } else {

                ctx.lineTo(
                    x(index),
                    y(value)
                );
            }
        }
    );


    ctx.strokeStyle =
        getComputedStyle(
            document.body
        ).getPropertyValue(
            "--accent"
        ) ||
        "#00e5ff";


    ctx.lineWidth = 3;

    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.stroke();
}


/* ============================================================
   SUPPRESSION ARCHIVE
============================================================ */

function deleteArchive(id) {

    const archive =
        archives.find(
            item => item.id === id
        );


    if (!archive) {
        return;
    }


    const confirmed =
        confirm(
            "Supprimer définitivement l'archive « " +
            (archive.name || "Capital") +
            " » ?\n\n" +
            "Cette action est irréversible."
        );


    if (!confirmed) {
        return;
    }


    archives =
        archives.filter(
            item => item.id !== id
        );


    saveArchives();

    renderArchives();
}


/* ============================================================
   RENDU GLOBAL
============================================================ */

function renderAll() {

    renderDashboard();

    renderPerformance();

    renderAnalysis();

    renderArchives();

    populateTradeForm();
}


function renderCurrentPage() {

    if (currentPage === "dashboard") {
        renderDashboard();
    }

    if (currentPage === "analysis") {
        renderAnalysis();
    }

    if (currentPage === "performance") {
        renderPerformance();
    }

    if (currentPage === "archives") {
        renderArchives();
    }
}


/* ============================================================
   ÉVÉNEMENTS — NAVIGATION
============================================================ */

function initNavigation() {

    document.querySelectorAll(
        ".app-nav-link"
    ).forEach(button => {

        button.addEventListener(
            "click",
            () => {

                showPage(
                    button.dataset.page
                );
            }
        );
    });


    document.querySelectorAll(
        "[data-go-page]"
    ).forEach(button => {

        button.addEventListener(
            "click",
            () => {

                showPage(
                    button.dataset.goPage
                );
            }
        );
    });
}


/* ============================================================
   ÉVÉNEMENTS — CAPITAL
============================================================ */

function initCapitalEvents() {

    const newCapital =
        getElement("newCapitalBtn");

    const newCapitalArchives =
        getElement(
            "newCapitalBtnArchives"
        );

    const changeCapital =
        getElement(
            "changeCapitalBtn"
        );

    const archiveCapital =
        getElement(
            "archiveCapitalBtn"
        );


    if (newCapital) {

        newCapital.addEventListener(
            "click",
            () =>
                openCapitalModal("new")
        );
    }


    if (newCapitalArchives) {

        newCapitalArchives.addEventListener(
            "click",
            () =>
                openCapitalModal("new")
        );
    }


    if (changeCapital) {

        changeCapital.addEventListener(
            "click",
            () => {

                if (!activeCapital) {

                    openCapitalModal(
                        "new"
                    );

                } else {

                    openCapitalModal(
                        "edit"
                    );
                }
            }
        );
    }


    if (archiveCapital) {

        archiveCapital.addEventListener(
            "click",
            archiveActiveCapital
        );
    }


    const close =
        getElement(
            "closeCapitalModalBtn"
        );

    const cancel =
        getElement(
            "cancelCapitalBtn"
        );


    if (close) {
        close.addEventListener(
            "click",
            closeCapitalModal
        );
    }


    if (cancel) {
        cancel.addEventListener(
            "click",
            closeCapitalModal
        );
    }


    const form =
        getElement(
            "capitalForm"
        );


    if (form) {

        form.addEventListener(
            "submit",
            saveCapitalFromForm
        );
    }


    [
        "capitalAmountInput",
        "capitalRiskInput",
        "capitalRRInput"
    ].forEach(id => {

        const element =
            getElement(id);

        if (element) {

            element.addEventListener(
                "input",
                updateCapitalModalPreview
            );
        }
    });


    const closeSelector =
        getElement(
            "closeCapitalSelectorBtn"
        );


    if (closeSelector) {

        closeSelector.addEventListener(
            "click",
            closeCapitalSelector
        );
    }
}


/* ============================================================
   ÉVÉNEMENTS — TRADE
============================================================ */

function initTradeEvents() {

    const openPrimary =
        getElement(
            "openTradeModalBtn"
        );


    const openSecondary =
        getElement(
            "openTradeModalBtnSecondary"
        );


    if (openPrimary) {

        openPrimary.addEventListener(
            "click",
            openTradeModal
        );
    }


    if (openSecondary) {

        openSecondary.addEventListener(
            "click",
            openTradeModal
        );
    }


    const close =
        getElement(
            "closeTradeModalBtn"
        );


    const cancel =
        getElement(
            "cancelTradeBtn"
        );


    if (close) {

        close.addEventListener(
            "click",
            closeTradeModal
        );
    }


    if (cancel) {

        cancel.addEventListener(
            "click",
            closeTradeModal
        );
    }


    const form =
        getElement(
            "tradeForm"
        );


    if (form) {

        form.addEventListener(
            "submit",
            saveTradeFromForm
        );
    }


    [
        "tradeAsset",
        "tradeDirection",
        "tradeEntry",
        "tradeSL"
    ].forEach(id => {

        const element =
            getElement(id);

        if (element) {

            element.addEventListener(
                "input",
                updateAutomaticTradeValues
            );

            element.addEventListener(
                "change",
                updateAutomaticTradeValues
            );
        }
    });


    const result =
        getElement(
            "tradeResult"
        );


    if (result) {

        result.addEventListener(
            "change",
            updateTradeProfitPreview
        );
    }


    const clear =
        getElement("clearBtn");


    if (clear) {

        clear.addEventListener(
            "click",
            clearTrades
        );
    }
}


/* ============================================================
   ÉVÉNEMENTS — ANALYSE
============================================================ */

function initAnalysisEvents() {

    const apply =
        getElement(
            "applyAnalysisFiltersBtn"
        );


    const reset =
        getElement(
            "resetAnalysisFiltersBtn"
        );


    if (apply) {

        apply.addEventListener(
            "click",
            applyAnalysisFilters
        );
    }


    if (reset) {

        reset.addEventListener(
            "click",
            resetAnalysisFilters
        );
    }


    [
        "analysisPeriodFilter",
        "analysisAssetFilter",
        "analysisSetupFilter",
        "analysisResultFilter"
    ].forEach(id => {

        const element =
            getElement(id);

        if (element) {

            element.addEventListener(
                "change",
                applyAnalysisFilters
            );
        }
    });
}


/* ============================================================
   ÉVÉNEMENTS — PERFORMANCE
============================================================ */

function initPerformanceEvents() {

    document.querySelectorAll(
        ".period-btn"
    ).forEach(button => {

        button.addEventListener(
            "click",
            () => {

                currentPeriod =
                    button.dataset.period ||
                    "today";


                renderPerformance();
            }
        );
    });
}


/* ============================================================
   ÉVÉNEMENTS — ARCHIVES
============================================================ */

function initArchiveEvents() {

    const archivesList =
        getElement(
            "archivesList"
        );


    if (!archivesList) {
        return;
    }


    archivesList.addEventListener(
        "click",
        event => {

            const viewButton =
                event.target.closest(
                    "[data-view-archive]"
                );


            if (viewButton) {

                openArchiveChart(
                    viewButton.dataset.viewArchive
                );

                return;
            }


            const deleteButton =
                event.target.closest(
                    "[data-delete-archive]"
                );


            if (deleteButton) {

                deleteArchive(
                    deleteButton.dataset.deleteArchive
                );
            }
        }
    );


    const close =
        getElement(
            "closeArchiveChartBtn"
        );


    if (close) {

        close.addEventListener(
            "click",
            closeArchiveChart
        );
    }
}


/* ============================================================
   ÉVÉNEMENTS — HISTORIQUE
============================================================ */

function initHistoryEvents() {

    const body =
        getElement(
            "historyBody"
        );


    if (!body) {
        return;
    }


    body.addEventListener(
        "click",
        event => {

            const editButton =
                event.target.closest(
                    "[data-edit-trade]"
                );


            if (editButton) {

                editTrade(
                    editButton.dataset.editTrade
                );

                return;
            }


            const deleteButton =
                event.target.closest(
                    "[data-delete-trade]"
                );


            if (deleteButton) {

                deleteTrade(
                    deleteButton.dataset.deleteTrade
                );
            }
        }
    );
}


/* ============================================================
   ÉVÉNEMENTS — THEME
============================================================ */

function initThemeEvents() {

    const toggle =
        getElement(
            "themeToggle"
        );


    if (toggle) {

        toggle.addEventListener(
            "click",
            toggleTheme
        );
    }
}


/* ============================================================
   MODALS — BACKDROP / ESCAPE
============================================================ */

function initModalEvents() {

    document.querySelectorAll(
        ".modal"
    ).forEach(modal => {

        modal.addEventListener(
            "click",
            event => {

                if (
                    event.target === modal
                ) {

                    modal.classList.remove(
                        "show"
                    );

                    modal.setAttribute(
                        "aria-hidden",
                        "true"
                    );

                    if (
                        modal.id ===
                        "tradeModal"
                    ) {

                        document.body.classList.remove(
                            "trade-modal-open"
                        );
                    }
                }
            }
        );
    });


    document.addEventListener(
        "keydown",
        event => {

            if (event.key !== "Escape") {
                return;
            }


            closeTradeModal();

            closeCapitalModal();

            closeCapitalSelector();

            closeArchiveChart();
        }
    );
}


/* ============================================================
   V51 — CALENDRIER
============================================================ */

function changeCalendarMonth(offset) {

    calendarMonth += offset;


    if (calendarMonth < 0) {

        calendarMonth = 11;
        calendarYear--;

    } else if (calendarMonth > 11) {

        calendarMonth = 0;
        calendarYear++;
    }


    if (
        typeof renderCalendar ===
        "function"
    ) {

        renderCalendar(
            getFilteredAnalysisTrades()
        );
    }
}


/* ============================================================
   RESIZE
============================================================ */

function initResizeEvents() {

    let timeout = null;


    window.addEventListener(
        "resize",
        () => {

            clearTimeout(
                timeout
            );


            timeout =
                setTimeout(
                    () => {

                        if (
                            currentPage ===
                            "dashboard"
                        ) {

                            drawCapitalChart(
                                getActiveCapitalTrades()
                            );
                        }


                        if (
                            editingArchiveId
                        ) {

                            const archive =
                                archives.find(
                                    item =>
                                        item.id ===
                                        editingArchiveId
                                );


                            if (archive) {

                                drawArchiveChart(
                                    archive
                                );
                            }
                        }

                    },
                    150
                );
        }
    );
}


/* ============================================================
   INITIALISATION
============================================================ */

function initApp() {

    loadTheme();

    loadData();

    populateTradeForm();

    populateAnalysisFilters();


    initNavigation();

    initCapitalEvents();

    initTradeEvents();

    initAnalysisEvents();

    initPerformanceEvents();

    initArchiveEvents();

    initHistoryEvents();

    initThemeEvents();

    initModalEvents();

    initResizeEvents();


    renderAll();


    showPage(
        currentPage
    );
}


/* ============================================================
   DOM READY
============================================================ */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initApp
    );

} else {

    initApp();
}


/* ============================================================
   EXPORT GLOBAL
   Compatibilité avec index.html / v51-filters.js
============================================================ */

window.tradingApp = {

    showPage,

    openTradeModal,

    closeTradeModal,

    openCapitalModal,

    closeCapitalModal,

    archiveActiveCapital,

    renderAll,

    renderDashboard,

    renderAnalysis,

    renderPerformance,

    renderArchives,

    getActiveCapitalTrades,

    getCapitalRisk,

    getCapitalRR,

    getCapitalObjective,

    calculateProfit,

    calculateCurrentBalance,

    calculateAdvancedStats,

    calculateRiskStats,

    calculateTradeRR,

    getTradeTargetRR,

    formatMoney,

    escapeValue,

    changeCalendarMonth
};
