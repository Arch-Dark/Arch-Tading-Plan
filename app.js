/* ============================================================
   ARCH TRADING PLAN
   app.js
   Logique principale de l'application
   ============================================================ */


/* ============================================================
   1. CONFIGURATION
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
   2. ÉTAT GLOBAL
   ============================================================ */

let trades = [];
let archives = [];
let activeCapital = null;

let currentPeriod = "today";
let currentCapitalModalMode = "new";
let editingArchiveId = null;

let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();

let currentAnalysisTrades = [];

let capitalChartInstance = null;
let archiveChartInstance = null;


/* ============================================================
   3. UTILITAIRES
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
    return "$" + parseNumber(value).toFixed(2);
}


function formatMoney(value) {
    return money(value);
}


function formatNumber(value, decimals = 2) {
    return parseNumber(value).toFixed(decimals);
}


function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}


function escapeHtml(value) {
    return String(value ?? "")
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


function getTodayDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: MADAGASCAR_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
}


function getMadagascarDateTime(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);

    return new Intl.DateTimeFormat("fr-FR", {
        timeZone: MADAGASCAR_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }).format(date);
}


function formatStoredDateTime(value) {
    if (!value) {
        return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return getMadagascarDateTime(date);
}


/* ============================================================
   4. STOCKAGE
   ============================================================ */

function saveTrades() {
    localStorage.setItem(TRADES_KEY, JSON.stringify(trades));
}


function saveArchives() {
    localStorage.setItem(ARCHIVES_KEY, JSON.stringify(archives));
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
   5. CAPITAL
   ============================================================ */

function getCapitalRisk(capital = activeCapital) {
    if (!capital) {
        return 0;
    }

    const risk = parseNumber(
        capital.riskReference ??
        capital.riskPerTrade ??
        capital.risk ??
        0
    );

    return risk > 0 ? risk : 0;
}


function getCapitalRR(capital = activeCapital) {
    if (!capital) {
        return MIN_RR;
    }

    const rr = parseNumber(
        capital.rrTarget ??
        capital.rr ??
        MIN_RR
    );

    return rr >= MIN_RR ? rr : MIN_RR;
}


function getCapitalObjective(capital = activeCapital) {
    return getCapitalRisk(capital) * getCapitalRR(capital);
}


function getCapitalTrades(capitalId) {
    if (!capitalId) {
        return [];
    }

    return trades.filter(
        trade => String(trade.capitalId) === String(capitalId)
    );
}


function getActiveCapitalTrades() {
    if (!activeCapital) {
        return [];
    }

    return getCapitalTrades(activeCapital.id);
}


function getAllCapitalTrades() {
    return Array.isArray(trades) ? trades : [];
}


function calculateProfit(tradeList) {
    if (!Array.isArray(tradeList)) {
        return 0;
    }

    return tradeList.reduce((total, trade) => {
        return total + parseNumber(
            trade.profit ??
            trade.pnl ??
            trade.P_L ??
            0
        );
    }, 0);
}


function calculateCurrentBalance() {
    if (!activeCapital) {
        return 0;
    }

    return parseNumber(activeCapital.initialCapital) +
        calculateProfit(getActiveCapitalTrades());
}


function calculateAllCapitalsBalance() {
    let total = 0;

    if (activeCapital) {
        total += calculateCurrentBalance();
    }

    archives.forEach(archive => {
        total +=
            parseNumber(archive.initialCapital) +
            calculateProfit(archive.trades || []);
    });

    return total;
}


/* ============================================================
   6. CHARGEMENT / MIGRATION
   ============================================================ */

function loadData() {
    try {
        const storedTrades = localStorage.getItem(TRADES_KEY);
        const storedArchives = localStorage.getItem(ARCHIVES_KEY);
        const storedCapital = localStorage.getItem(CAPITAL_KEY);

        trades = storedTrades
            ? JSON.parse(storedTrades)
            : [];

        archives = storedArchives
            ? JSON.parse(storedArchives)
            : [];

        activeCapital = storedCapital
            ? JSON.parse(storedCapital)
            : null;

    } catch (error) {
        console.error("Erreur lors du chargement des données :", error);

        trades = [];
        archives = [];
        activeCapital = null;
    }

    if (!Array.isArray(trades)) {
        trades = [];
    }

    if (!Array.isArray(archives)) {
        archives = [];
    }

    /*
     * Migration des anciens trades sans capitalId.
     */
    if (activeCapital) {
        let migrated = false;

        trades.forEach(trade => {
            if (!trade.capitalId) {
                trade.capitalId = activeCapital.id;
                migrated = true;
            }
        });

        if (migrated) {
            saveTrades();
        }
    }
}


/* ============================================================
   7. DATES / PÉRIODES
   ============================================================ */

function getTradeDate(trade) {
    if (!trade) {
        return "";
    }

    return trade.date ||
        trade.tradeDate ||
        trade.createdDate ||
        "";
}


function getTradeDateObject(trade) {
    const dateString = getTradeDate(trade);

    if (!dateString) {
        return null;
    }

    const date = new Date(dateString + "T12:00:00");

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
}


function getTodayDateObject() {
    const today = getTodayDate();
    return new Date(today + "T12:00:00");
}


function isToday(trade) {
    return getTradeDate(trade) === getTodayDate();
}


function isThisWeek(trade) {
    const date = getTradeDateObject(trade);

    if (!date) {
        return false;
    }

    const today = getTodayDateObject();

    const day = today.getDay() || 7;
    const monday = new Date(today);

    monday.setDate(today.getDate() - day + 1);
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

    const today = getTodayDateObject();

    return (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth()
    );
}


function isThisYear(trade) {
    const date = getTradeDateObject(trade);

    if (!date) {
        return false;
    }

    const today = getTodayDateObject();

    return date.getFullYear() === today.getFullYear();
}


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
            return [...tradeList];

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
   8. PAGES / NAVIGATION
   ============================================================ */

function isAnalysisPage() {
    const analysisPage = document.getElementById("pageAnalysis");

    if (analysisPage) {
        return analysisPage.classList.contains("active");
    }

    const currentPage =
        document.querySelector(".page-section.active");

    return currentPage?.dataset?.page === "analysis";
}


function showPage(pageName) {
    const pages = document.querySelectorAll(".page-section");
    const links = document.querySelectorAll(".app-nav-link");

    pages.forEach(page => {
        const isActive = page.dataset.page === pageName;

        page.classList.toggle("active", isActive);
        page.hidden = !isActive;
    });

    links.forEach(link => {
        link.classList.toggle(
            "active",
            link.dataset.page === pageName
        );
    });

    if (pageName === "analysis") {
        renderAnalysisPage();
    }

    if (pageName === "performance") {
        renderPerformancePage();
    }

    if (pageName === "archives") {
        renderArchives();
    }

    if (pageName === "dashboard") {
        renderDashboard();
    }
}


function initializeNavigation() {
    document.querySelectorAll(".app-nav-link").forEach(link => {
        link.addEventListener("click", event => {
            event.preventDefault();

            const page = link.dataset.page;

            if (page) {
                showPage(page);
            }
        });
    });
}


/* ============================================================
   9. THÈME
   ============================================================ */

function initializeTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const button = document.getElementById("themeToggle");

    if (savedTheme === "light") {
        document.body.classList.add("light-theme");
    } else {
        document.body.classList.remove("light-theme");
    }

    if (button) {
        button.addEventListener("click", () => {
            document.body.classList.toggle("light-theme");

            const theme =
                document.body.classList.contains("light-theme")
                    ? "light"
                    : "dark";

            localStorage.setItem(THEME_KEY, theme);
        });
    }
}


/* ============================================================
   10. CAPITAL — INTERFACE
   ============================================================ */

function openCapitalModal(mode = "new", capital = null) {
    const modal = document.getElementById("capitalModal");

    if (!modal) {
        return;
    }

    currentCapitalModalMode = mode;

    const nameInput =
        document.getElementById("capitalNameInput");

    const amountInput =
        document.getElementById("capitalAmountInput");

    const riskInput =
        document.getElementById("capitalRiskInput");

    const rrInput =
        document.getElementById("capitalRRInput");

    if (mode === "edit" && capital) {
        nameInput.value = capital.name || "";
        amountInput.value =
            parseNumber(capital.initialCapital);

        riskInput.value =
            getCapitalRisk(capital);

        rrInput.value =
            getCapitalRR(capital);

    } else {
        nameInput.value = "";
        amountInput.value = "";
        riskInput.value = "";
        rrInput.value = MIN_RR;
    }

    updateCapitalModalPreview();

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");

    setTimeout(() => {
        nameInput?.focus();
    }, 50);
}


function closeCapitalModal() {
    const modal = document.getElementById("capitalModal");

    if (!modal) {
        return;
    }

    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
}


function updateCapitalModalPreview() {
    const riskInput =
        document.getElementById("capitalRiskInput");

    const rrInput =
        document.getElementById("capitalRRInput");

    const riskPreview =
        document.getElementById("capitalModalRiskPreview");

    const rrPreview =
        document.getElementById("capitalModalRR");

    const objectivePreview =
        document.getElementById("capitalModalObjective");

    const risk = parseNumber(riskInput?.value);
    const rr = Math.max(
        MIN_RR,
        parseNumber(rrInput?.value) || MIN_RR
    );

    const objective = risk * rr;

    if (riskPreview) {
        riskPreview.textContent = money(risk);
    }

    if (rrPreview) {
        rrPreview.textContent = rr.toFixed(2);
    }

    if (objectivePreview) {
        objectivePreview.textContent = money(objective);
    }
}


function saveCapitalFromModal() {
    const nameInput =
        document.getElementById("capitalNameInput");

    const amountInput =
        document.getElementById("capitalAmountInput");

    const riskInput =
        document.getElementById("capitalRiskInput");

    const rrInput =
        document.getElementById("capitalRRInput");

    const name = nameInput?.value.trim();
    const amount = parseNumber(amountInput?.value);
    const risk = parseNumber(riskInput?.value);

    let rr = parseNumber(rrInput?.value);

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

    if (rr < MIN_RR) {
        rr = MIN_RR;
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
        activeCapital = {
            id: generateId(),
            name,
            initialCapital: amount,
            riskReference: risk,
            riskPerTrade: risk,
            rrTarget: rr,
            rr,
            createdAt: new Date().toISOString()
        };

        saveActiveCapital();
    }

    closeCapitalModal();

    renderEverything();
}


/* ============================================================
   11. ARCHIVAGE DU CAPITAL
   ============================================================ */

function archiveActiveCapital() {
    if (!activeCapital) {
        alert("Aucun capital actif à archiver.");
        return;
    }

    const capitalTrades =
        getActiveCapitalTrades();

    const confirmation = confirm(
        `Archiver le capital "${activeCapital.name}" ?\n\n` +
        `Capital initial : ${money(activeCapital.initialCapital)}\n` +
        `Solde final : ${money(calculateCurrentBalance())}\n` +
        `Trades : ${capitalTrades.length}`
    );

    if (!confirmation) {
        return;
    }

    const archive = {
        id: generateId(),
        name: activeCapital.name,
        initialCapital: parseNumber(
            activeCapital.initialCapital
        ),
        riskReference: getCapitalRisk(activeCapital),
        rrTarget: getCapitalRR(activeCapital),
        createdAt: activeCapital.createdAt,
        archivedAt: new Date().toISOString(),
        trades: JSON.parse(
            JSON.stringify(capitalTrades)
        )
    };

    archives.unshift(archive);

    /*
     * Les trades du capital archivé restent conservés
     * dans tradingTrades afin de ne pas perdre l'historique.
     */
    saveArchives();

    activeCapital = null;
    saveActiveCapital();

    renderEverything();
}


function createNewCapital() {
    if (activeCapital) {
        const existingTrades =
            getActiveCapitalTrades();

        if (existingTrades.length > 0) {
            const confirmNew = confirm(
                "Un capital est actuellement actif.\n\n" +
                "Créer un nouveau capital sans archiver " +
                "l'ancien peut rendre son suivi moins clair.\n\n" +
                "Voulez-vous continuer ?"
            );

            if (!confirmNew) {
                return;
            }
        }
    }

    openCapitalModal("new");
}


function selectArchive(archiveId) {
    const archive = archives.find(
        item => String(item.id) === String(archiveId)
    );

    if (!archive) {
        return;
    }

    openArchiveChart(archive);
}


function deleteArchive(archiveId) {
    const archive = archives.find(
        item => String(item.id) === String(archiveId)
    );

    if (!archive) {
        return;
    }

    const confirmation = confirm(
        `Supprimer définitivement l'archive "${archive.name}" ?\n\n` +
        "Cette action ne peut pas être annulée."
    );

    if (!confirmation) {
        return;
    }

    archives = archives.filter(
        item => String(item.id) !== String(archiveId)
    );

    saveArchives();

    renderArchives();
}


/* ============================================================
   12. TRADES — CALCULS
   ============================================================ */

function getTradeRiskDistance(trade) {
    const entry = parseNumber(trade.entry);
    const sl = parseNumber(trade.sl);

    if (entry === 0 || sl === 0) {
        return 0;
    }

    return Math.abs(entry - sl);
}


function calculateTP(entry, sl, direction, rr) {
    entry = parseNumber(entry);
    sl = parseNumber(sl);
    rr = parseNumber(rr);

    if (!entry || !sl || rr <= 0) {
        return 0;
    }

    const distance = Math.abs(entry - sl);

    if (direction === "BUY") {
        return entry + distance * rr;
    }

    return entry - distance * rr;
}


function getTradeTargetRR(trade) {
    if (!trade) {
        return null;
    }

    const entry = parseNumber(trade.entry);
    const sl = parseNumber(trade.sl);
    const tp = parseNumber(trade.tp);

    if (!entry || !sl || !tp) {
        return null;
    }

    const risk = Math.abs(entry - sl);

    if (risk <= 0) {
        return null;
    }

    const reward = Math.abs(tp - entry);

    return reward / risk;
}


function calculateRiskMoney(trade) {
    const capital =
        trades.find(t => t.id === trade?.id)?.capitalId
            ? getCapitalForTrade(trade)
            : activeCapital;

    if (!capital) {
        return 0;
    }

    const risk = getCapitalRisk(capital);

    if (risk <= 0) {
        return 0;
    }

    return risk;
}


function getCapitalForTrade(trade) {
    if (!trade?.capitalId) {
        return activeCapital;
    }

    if (
        activeCapital &&
        String(activeCapital.id) === String(trade.capitalId)
    ) {
        return activeCapital;
    }

    /*
     * Les capitaux archivés conservent leurs paramètres.
     */
    for (const archive of archives) {
        if (
            archive.trades?.some(
                item => String(item.id) === String(trade.id)
            )
        ) {
            return {
                initialCapital: archive.initialCapital,
                riskReference: archive.riskReference,
                rrTarget: archive.rrTarget
            };
        }
    }

    return activeCapital;
}


function calculateLotFromRisk(entry, sl, asset) {
    const capitalRisk = getCapitalRisk();

    if (capitalRisk <= 0) {
        return MIN_LOT;
    }

    const distance = Math.abs(
        parseNumber(entry) - parseNumber(sl)
    );

    if (distance <= 0) {
        return MIN_LOT;
    }

    /*
     * Modèle volontairement simple et transparent.
     * Il sert au plan de trading et peut être ajusté
     * plus tard selon le broker / contrat.
     */
    let multiplier = 1;

    if (asset === "XAUUSD") {
        multiplier = 100;
    }

    if (asset === "BTCUSD") {
        multiplier = 1;
    }

    const rawLot =
        capitalRisk / (distance * multiplier);

    const lot = roundToStep(
        Math.max(MIN_LOT, rawLot),
        LOT_STEP
    );

    return Math.max(MIN_LOT, lot);
}


function calculateTradeProfit(trade) {
    if (!trade) {
        return 0;
    }

    const result = String(
        trade.result || ""
    ).toUpperCase();

    const capital =
        getCapitalForTrade(trade);

    const risk =
        getCapitalRisk(capital);

    if (result === "TP" || result === "WIN") {
        const rr =
            getTradeTargetRR(trade) ??
            getCapitalRR(capital);

        return risk * rr;
    }

    if (
        result === "SL" ||
        result === "LOSS"
    ) {
        return -risk;
    }

    return 0;
}


function calculatePips(trade) {
    if (!trade) {
        return 0;
    }

    const entry = parseNumber(trade.entry);
    const exit = parseNumber(
        trade.exit ??
        trade.close ??
        trade.tp ??
        0
    );

    if (!entry || !exit) {
        return 0;
    }

    const asset = String(
        trade.asset || ""
    ).toUpperCase();

    let pipSize = 0.0001;

    if (asset.includes("JPY")) {
        pipSize = 0.01;
    }

    if (asset === "XAUUSD") {
        pipSize = 0.1;
    }

    if (asset === "BTCUSD") {
        pipSize = 1;
    }

    const difference =
        trade.direction === "SELL"
            ? entry - exit
            : exit - entry;

    return difference / pipSize;
}


/* ============================================================
   13. TRADE MODAL
   ============================================================ */

function openTradeModal() {
    const modal =
        document.getElementById("tradeModal");

    if (!modal) {
        return;
    }

    if (!activeCapital) {
        alert(
            "Créez d'abord un capital actif avant d'ajouter un trade."
        );
        openCapitalModal("new");
        return;
    }

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");

    document.body.classList.add(
        "trade-modal-open"
    );

    const dateInput =
        document.getElementById("tradeDate");

    if (dateInput && !dateInput.value) {
        dateInput.value = getTodayDate();
    }

    const assetInput =
        document.getElementById("tradeAsset");

    if (assetInput) {
        assetInput.focus();
    }

    updateAutomaticTradeValues();
}


function closeTradeModal() {
    const modal =
        document.getElementById("tradeModal");

    if (!modal) {
        return;
    }

    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");

    document.body.classList.remove(
        "trade-modal-open"
    );
}


function updateAutomaticTradeValues() {
    const asset =
        document.getElementById("tradeAsset")?.value || "";

    const direction =
        document.getElementById("tradeDirection")?.value ||
        "BUY";

    const entry =
        parseNumber(
            document.getElementById("tradeEntry")?.value
        );

    const sl =
        parseNumber(
            document.getElementById("tradeSL")?.value
        );

    const lotInput =
        document.getElementById("tradeLot");

    const tpInput =
        document.getElementById("tradeTP");

    const rrInput =
        document.getElementById("calculatedRR");

    if (
        entry > 0 &&
        sl > 0 &&
        activeCapital
    ) {
        const rr =
            getCapitalRR(activeCapital);

        const tp =
            calculateTP(
                entry,
                sl,
                direction,
                rr
            );

        const lot =
            calculateLotFromRisk(
                entry,
                sl,
                asset
            );

        if (tpInput) {
            tpInput.value =
                tp > 0
                    ? tp.toFixed(5)
                    : "";
        }

        if (lotInput) {
            lotInput.value =
                lot.toFixed(2);
        }

        if (rrInput) {
            rrInput.value =
                rr.toFixed(2);
        }
    } else {
        if (tpInput) {
            tpInput.value = "";
        }

        if (rrInput) {
            rrInput.value = "";
        }

        if (lotInput) {
            lotInput.value = MIN_LOT.toFixed(2);
        }
    }

    updateTradeMMInfo();
}


function updateTradeMMInfo() {
    const info =
        document.getElementById("tradeMMInfo");

    if (!info || !activeCapital) {
        return;
    }

    const risk =
        getCapitalRisk(activeCapital);

    const rr =
        getCapitalRR(activeCapital);

    const objective =
        getCapitalObjective(activeCapital);

    info.textContent =
        `Risque : ${money(risk)} | ` +
        `RR cible : ${rr.toFixed(2)} | ` +
        `Gain TP : ${money(objective)}`;
}


function handleTradeSubmit(event) {
    event.preventDefault();

    if (!activeCapital) {
        alert(
            "Aucun capital actif."
        );
        return;
    }

    const asset =
        document.getElementById("tradeAsset")?.value.trim();

    const date =
        document.getElementById("tradeDate")?.value ||
        getTodayDate();

    const direction =
        document.getElementById("tradeDirection")?.value ||
        "BUY";

    const orderType =
        document.getElementById("tradeOrderType")?.value ||
        "Market";

    const lot =
        parseNumber(
            document.getElementById("tradeLot")?.value
        );

    const entry =
        parseNumber(
            document.getElementById("tradeEntry")?.value
        );

    const sl =
        parseNumber(
            document.getElementById("tradeSL")?.value
        );

    const tp =
        parseNumber(
            document.getElementById("tradeTP")?.value
        );

    const result =
        document.querySelector(
            'input[name="tradeResult"]:checked'
        )?.value ||
        document.getElementById("tradeResult")?.value ||
        "BE";

    const setup =
        document.getElementById("tradeSetup")?.value ||
        "";

    const comment =
        document.getElementById("tradeComment")?.value.trim() ||
        "";

    if (!asset) {
        alert("Sélectionnez un actif.");
        return;
    }

    if (entry <= 0 || sl <= 0 || tp <= 0) {
        alert(
            "Veuillez renseigner correctement Entry, SL et TP."
        );
        return;
    }

    if (lot < MIN_LOT) {
        alert(
            `Le lot minimum est ${MIN_LOT.toFixed(2)}.`
        );
        return;
    }

    const targetRR =
        getTradeTargetRR({
            entry,
            sl,
            tp
        });

    const trade = {
        id: generateId(),

        capitalId: activeCapital.id,

        asset,
        date,
        direction,
        orderType,

        lot,
        entry,
        sl,
        tp,

        rr: targetRR,

        pips: 0,

        setup,
        result,

        profit: 0,
        pnl: 0,

        comment,

        createdAt: new Date().toISOString(),
        recordedAt: new Date().toISOString()
    };

    trade.profit =
        calculateTradeProfit(trade);

    trade.pnl =
        trade.profit;

    trade.pips =
        calculatePips(trade);

    trades.push(trade);

    saveTrades();

    closeTradeModal();

    const form =
        document.getElementById("tradeForm");

    form?.reset();

    renderEverything();
}


/* ============================================================
   14. SUPPRESSION DES TRADES
   ============================================================ */

function deleteTrade(tradeId) {
    const trade =
        trades.find(
            item => String(item.id) === String(tradeId)
        );

    if (!trade) {
        return;
    }

    const confirmation = confirm(
        `Supprimer le trade ${trade.asset || ""} ?`
    );

    if (!confirmation) {
        return;
    }

    trades = trades.filter(
        item => String(item.id) !== String(tradeId)
    );

    saveTrades();

    renderEverything();
}


/* ============================================================
   15. STATISTIQUES AVANCÉES
   ============================================================ */

function calculateAdvancedStats(tradeList) {
    const list =
        Array.isArray(tradeList)
            ? tradeList
            : [];

    const totalTrades = list.length;

    const wins =
        list.filter(
            trade =>
                String(trade.result).toUpperCase() === "TP" ||
                String(trade.result).toUpperCase() === "WIN"
        ).length;

    const losses =
        list.filter(
            trade =>
                String(trade.result).toUpperCase() === "SL" ||
                String(trade.result).toUpperCase() === "LOSS"
        ).length;

    const breakevens =
        list.filter(
            trade =>
                String(trade.result).toUpperCase() === "BE"
        ).length;

    const profit =
        calculateProfit(list);

    const winrate =
        totalTrades > 0
            ? (wins / totalTrades) * 100
            : 0;

    const rrValues =
        list
            .map(getTradeTargetRR)
            .filter(
                value =>
                    value !== null &&
                    Number.isFinite(value)
            );

    const averageRR =
        rrValues.length > 0
            ? rrValues.reduce(
                (sum, value) => sum + value,
                0
            ) / rrValues.length
            : 0;

    const winningTrades =
        list.filter(
            trade => parseNumber(
                trade.profit ?? trade.pnl
            ) > 0
        );

    const losingTrades =
        list.filter(
            trade => parseNumber(
                trade.profit ?? trade.pnl
            ) < 0
        );

    const averageTrade =
        totalTrades > 0
            ? profit / totalTrades
            : 0;

    const averageWin =
        winningTrades.length > 0
            ? calculateProfit(winningTrades) /
              winningTrades.length
            : 0;

    const averageLoss =
        losingTrades.length > 0
            ? calculateProfit(losingTrades) /
              losingTrades.length
            : 0;

    let runningProfit = 0;
    let peakProfit = 0;
    let maxDrawdown = 0;

    let currentWinStreak = 0;
    let currentLossStreak = 0;

    let maxWinStreak = 0;
    let maxLossStreak = 0;

    const ordered =
        [...list].sort(
            (a, b) =>
                new Date(
                    a.createdAt || a.date
                ) -
                new Date(
                    b.createdAt || b.date
                )
        );

    ordered.forEach(trade => {
        const pnl =
            parseNumber(
                trade.profit ?? trade.pnl
            );

        runningProfit += pnl;

        if (runningProfit > peakProfit) {
            peakProfit = runningProfit;
        }

        const drawdown =
            runningProfit - peakProfit;

        if (drawdown < maxDrawdown) {
            maxDrawdown = drawdown;
        }

        if (pnl > 0) {
            currentWinStreak++;
            currentLossStreak = 0;

            maxWinStreak =
                Math.max(
                    maxWinStreak,
                    currentWinStreak
                );
        } else if (pnl < 0) {
            currentLossStreak++;
            currentWinStreak = 0;

            maxLossStreak =
                Math.max(
                    maxLossStreak,
                    currentLossStreak
                );
        } else {
            currentWinStreak = 0;
            currentLossStreak = 0;
        }
    });

    const profitFactor =
        losingTrades.length > 0 &&
        Math.abs(calculateProfit(losingTrades)) > 0
            ? calculateProfit(winningTrades) /
              Math.abs(
                  calculateProfit(losingTrades)
              )
            : (
                winningTrades.length > 0
                    ? Infinity
                    : 0
            );

    let bestTrade = 0;
    let worstTrade = 0;

    if (list.length > 0) {
        bestTrade =
            Math.max(
                ...list.map(
                    trade =>
                        parseNumber(
                            trade.profit ?? trade.pnl
                        )
                )
            );

        worstTrade =
            Math.min(
                ...list.map(
                    trade =>
                        parseNumber(
                            trade.profit ?? trade.pnl
                        )
                )
            );
    }

    return {
        totalTrades,
        wins,
        losses,
        breakevens,
        winrate,
        profit,
        averageRR,
        averageTrade,
        averageWin,
        averageLoss,
        profitFactor,
        bestTrade,
        worstTrade,
        maxWinStreak,
        maxLossStreak,
        maxDrawdown
    };
}


/* ============================================================
   16. STATISTIQUES DE RISQUE
   ============================================================ */

function calculateRiskStats(tradeList) {
    const list =
        Array.isArray(tradeList)
            ? tradeList
            : [];

    const reference =
        getCapitalRisk();

    const risks = list
        .map(trade => {
            const capital =
                getCapitalForTrade(trade);

            return getCapitalRisk(capital);
        })
        .filter(
            value =>
                value > 0 &&
                Number.isFinite(value)
        );

    if (risks.length === 0) {
        return {
            averageRisk: 0,
            minimumRisk: 0,
            maximumRisk: 0,
            referenceRisk: reference,
            averageDeviation: 0,
            regularity: 0,
            compliantTrades: 0,
            nonCompliantTrades: 0
        };
    }

    const averageRisk =
        risks.reduce(
            (sum, value) => sum + value,
            0
        ) / risks.length;

    const minimumRisk =
        Math.min(...risks);

    const maximumRisk =
        Math.max(...risks);

    const referenceRisk =
        reference > 0
            ? reference
            : averageRisk;

    const deviations =
        risks.map(
            value =>
                Math.abs(
                    value - referenceRisk
                ) / referenceRisk
        );

    const averageDeviation =
        deviations.reduce(
            (sum, value) => sum + value,
            0
        ) / deviations.length;

    let compliantTrades = 0;
    let nonCompliantTrades = 0;

    risks.forEach(value => {
        const deviation =
            Math.abs(
                value - referenceRisk
            ) / referenceRisk;

        if (deviation <= RISK_TOLERANCE) {
            compliantTrades++;
        } else {
            nonCompliantTrades++;
        }
    });

    const regularity =
        risks.length > 0
            ? (
                compliantTrades /
                risks.length
            ) * 100
            : 0;

    return {
        averageRisk,
        minimumRisk,
        maximumRisk,
        referenceRisk,
        averageDeviation,
        regularity,
        compliantTrades,
        nonCompliantTrades
    };
}


/* ============================================================
   17. PERFORMANCE SETUPS
   ============================================================ */

function buildSetupStats(tradeList) {
    const groups = {};

    (tradeList || []).forEach(trade => {
        const setup =
            trade.setup?.trim() ||
            "Sans setup";

        if (!groups[setup]) {
            groups[setup] = {
                setup,
                trades: 0,
                wins: 0,
                losses: 0,
                breakevens: 0,
                profit: 0
            };
        }

        const group = groups[setup];

        group.trades++;

        const result =
            String(
                trade.result || ""
            ).toUpperCase();

        if (
            result === "TP" ||
            result === "WIN"
        ) {
            group.wins++;
        } else if (
            result === "SL" ||
            result === "LOSS"
        ) {
            group.losses++;
        } else {
            group.breakevens++;
        }

        group.profit +=
            parseNumber(
                trade.profit ?? trade.pnl
            );
    });

    return Object.values(groups)
        .map(item => ({
            ...item,
            winrate:
                item.trades > 0
                    ? (item.wins / item.trades) * 100
                    : 0
        }))
        .sort(
            (a, b) =>
                b.profit - a.profit
        );
}


/* ============================================================
   18. PERFORMANCE ACTIFS
   ============================================================ */

function buildAssetStats(tradeList) {
    const groups = {};

    (tradeList || []).forEach(trade => {
        const asset =
            trade.asset?.trim() ||
            "Sans actif";

        if (!groups[asset]) {
            groups[asset] = {
                asset,
                trades: 0,
                wins: 0,
                losses: 0,
                breakevens: 0,
                profit: 0,
                rrValues: [],
                best: null,
                worst: null
            };
        }

        const group = groups[asset];

        group.trades++;

        const result =
            String(
                trade.result || ""
            ).toUpperCase();

        if (
            result === "TP" ||
            result === "WIN"
        ) {
            group.wins++;
        } else if (
            result === "SL" ||
            result === "LOSS"
        ) {
            group.losses++;
        } else {
            group.breakevens++;
        }

        const pnl =
            parseNumber(
                trade.profit ?? trade.pnl
            );

        group.profit += pnl;

        const rr =
            getTradeTargetRR(trade);

        if (rr !== null) {
            group.rrValues.push(rr);
        }

        if (
            group.best === null ||
            pnl > group.best
        ) {
            group.best = pnl;
        }

        if (
            group.worst === null ||
            pnl < group.worst
        ) {
            group.worst = pnl;
        }
    });

    return Object.values(groups)
        .map(item => ({
            ...item,
            winrate:
                item.trades > 0
                    ? (item.wins / item.trades) * 100
                    : 0,

            averageRR:
                item.rrValues.length > 0
                    ? item.rrValues.reduce(
                        (sum, value) =>
                            sum + value,
                        0
                    ) /
                    item.rrValues.length
                    : 0
        }))
        .sort(
            (a, b) =>
                b.profit - a.profit
        );
}


/* ============================================================
   19. RENDU DASHBOARD
   ============================================================ */

function renderDashboard() {
    renderActiveCapital();
    renderCapitalChart();
}


function renderActiveCapital() {
    const name =
        document.getElementById(
            "activeCapitalName"
        );

    const created =
        document.getElementById(
            "activeCapitalCreatedAt"
        );

    const initial =
        document.getElementById(
            "initialCapital"
        );

    const balance =
        document.getElementById(
            "currentBalance"
        );

    const profit =
        document.getElementById(
            "totalProfit"
        );

    const risk =
        document.getElementById(
            "riskReference"
        );

    const rr =
        document.getElementById(
            "rrTarget"
        );

    const objective =
        document.getElementById(
            "theoreticalObjective"
        );

    if (!activeCapital) {
        if (name) {
            name.textContent =
                "Aucun capital actif";
        }

        if (created) {
            created.textContent =
                "Créez un capital pour commencer";
        }

        [
            initial,
            balance,
            profit,
            risk,
            rr,
            objective
        ].forEach(element => {
            if (element) {
                element.textContent = "-";
            }
        });

        return;
    }

    const currentProfit =
        calculateProfit(
            getActiveCapitalTrades()
        );

    if (name) {
        name.textContent =
            activeCapital.name;
    }

    if (created) {
        created.textContent =
            activeCapital.createdAt
                ? `Créé le ${formatStoredDateTime(
                    activeCapital.createdAt
                )}`
                : "";
    }

    if (initial) {
        initial.textContent =
            money(
                activeCapital.initialCapital
            );
    }

    if (balance) {
        balance.textContent =
            money(
                calculateCurrentBalance()
            );
    }

    if (profit) {
        profit.textContent =
            money(currentProfit);
    }

    if (risk) {
        risk.textContent =
            money(
                getCapitalRisk(activeCapital)
            );
    }

    if (rr) {
        rr.textContent =
            getCapitalRR(activeCapital)
                .toFixed(2);
    }

    if (objective) {
        objective.textContent =
            money(
                getCapitalObjective(
                    activeCapital
                )
            );
    }
}


/* ============================================================
   20. GRAPHIQUE CAPITAL
   ============================================================ */

function drawLineChart(
    canvas,
    labels,
    values,
    options = {}
) {
    if (!canvas) {
        return;
    }

    const ctx =
        canvas.getContext("2d");

    const width =
        canvas.clientWidth || 800;

    const height =
        canvas.clientHeight || 320;

    const ratio =
        window.devicePixelRatio || 1;

    canvas.width =
        width * ratio;

    canvas.height =
        height * ratio;

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

    if (!values.length) {
        return;
    }

    const padding = 40;

    const minValue =
        Math.min(...values);

    const maxValue =
        Math.max(...values);

    const range =
        maxValue - minValue || 1;

    const xStep =
        values.length > 1
            ? (width - padding * 2) /
              (values.length - 1)
            : 0;

    ctx.lineWidth = 2;
    ctx.beginPath();

    values.forEach((value, index) => {
        const x =
            padding +
            index * xStep;

        const y =
            height -
            padding -
            (
                (value - minValue) /
                range
            ) *
            (height - padding * 2);

        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.stroke();

    ctx.font = "12px Arial";
    ctx.fillText(
        money(maxValue),
        padding,
        18
    );

    ctx.fillText(
        money(minValue),
        padding,
        height - 10
    );
}


function renderCapitalChart() {
    const canvas =
        document.getElementById(
            "capitalChart"
        );

    const empty =
        document.getElementById(
            "emptyChartMessage"
        );

    if (!canvas) {
        return;
    }

    if (!activeCapital) {
        if (empty) {
            empty.style.display =
                "block";
        }

        const ctx =
            canvas.getContext("2d");

        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        return;
    }

    const capitalTrades =
        [...getActiveCapitalTrades()]
            .sort(
                (a, b) =>
                    new Date(
                        a.createdAt || a.date
                    ) -
                    new Date(
                        b.createdAt || b.date
                    )
            );

    if (!capitalTrades.length) {
        if (empty) {
            empty.style.display =
                "block";
        }

        const ctx =
            canvas.getContext("2d");

        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        return;
    }

    if (empty) {
        empty.style.display =
            "none";
    }

    let balance =
        parseNumber(
            activeCapital.initialCapital
        );

    const values = [
        balance
    ];

    const labels = [
        "Départ"
    ];

    capitalTrades.forEach(trade => {
        balance +=
            parseNumber(
                trade.profit ?? trade.pnl
            );

        values.push(balance);

        labels.push(
            trade.date || ""
        );
    });

    drawLineChart(
        canvas,
        labels,
        values
    );
}


/* ============================================================
   21. PERFORMANCE
   ============================================================ */

function renderPerformancePage() {
    const periodTrades =
        getTradesForPeriod(
            currentPeriod
        );

    renderPerformanceStats(
        periodTrades
    );

    renderPerformanceSetupTable(
        periodTrades
    );

    renderPerformanceAssetTable(
        periodTrades
    );

    renderHistory(
        periodTrades
    );
}


function renderPerformanceStats(tradeList) {
    const stats =
        calculateAdvancedStats(
            tradeList
        );

    const map = {
        statBalance:
            activeCapital
                ? calculateCurrentBalance()
                : 0,

        statProfit:
            stats.profit,

        statWinrate:
            stats.winrate,

        statAverageRR:
            stats.averageRR,

        statTrades:
            stats.totalTrades,

        statProfitFactor:
            stats.profitFactor,

        statAverageTrade:
            stats.averageTrade,

        statAverageWin:
            stats.averageWin,

        statAverageLoss:
            stats.averageLoss,

        statBestTrade:
            stats.bestTrade,

        statWorstTrade:
            stats.worstTrade,

        statMaxWinStreak:
            stats.maxWinStreak,

        statMaxLossStreak:
            stats.maxLossStreak,

        statMaxDrawdown:
            stats.maxDrawdown
    };

    Object.entries(map).forEach(
        ([id, value]) => {
            const element =
                document.getElementById(id);

            if (!element) {
                return;
            }

            if (
                id.includes("Winrate")
            ) {
                element.textContent =
                    `${value.toFixed(1)}%`;
            } else if (
                id.includes("RR")
            ) {
                element.textContent =
                    value.toFixed(2);
            } else if (
                id === "statProfitFactor"
            ) {
                element.textContent =
                    Number.isFinite(value)
                        ? value.toFixed(2)
                        : "∞";
            } else if (
                [
                    "statProfit",
                    "statAverageTrade",
                    "statAverageWin",
                    "statAverageLoss",
                    "statBestTrade",
                    "statWorstTrade",
                    "statMaxDrawdown",
                    "statBalance"
                ].includes(id)
            ) {
                element.textContent =
                    money(value);
            } else {
                element.textContent =
                    value;
            }
        }
    );

    const setupStats =
        buildSetupStats(tradeList);

    const bestSetup =
        document.getElementById(
            "statBestSetup"
        );

    if (bestSetup) {
        bestSetup.textContent =
            setupStats.length > 0
                ? setupStats[0].setup
                : "-";
    }

    const lastTrade =
        document.getElementById(
            "statLastTrade"
        );

    if (lastTrade) {
        const sorted =
            [...tradeList].sort(
                (a, b) =>
                    new Date(
                        b.createdAt || b.date
                    ) -
                    new Date(
                        a.createdAt || a.date
                    )
            );

        lastTrade.textContent =
            sorted.length > 0
                ? sorted[0].date || "-"
                : "-";
    }
}


function renderPerformanceSetupTable(
    tradeList
) {
    const tbody =
        document.getElementById(
            "setupTableBody"
        );

    if (!tbody) {
        return;
    }

    const stats =
        buildSetupStats(tradeList);

    if (!stats.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    Aucun trade pour cette période.
                </td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML =
        stats.map(item => `
            <tr>
                <td>${escapeHtml(item.setup)}</td>
                <td>${item.trades}</td>
                <td>${item.wins}</td>
                <td>${item.losses}</td>
                <td>${item.winrate.toFixed(1)}%</td>
                <td>${item.breakevens}</td>
                <td>${money(item.profit)}</td>
            </tr>
        `).join("");
}


function renderPerformanceAssetTable(
    tradeList
) {
    const tbody =
        document.getElementById(
            "assetTableBody"
        );

    if (!tbody) {
        return;
    }

    const stats =
        buildAssetStats(tradeList);

    if (!stats.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10">
                    Aucun trade pour cette période.
                </td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML =
        stats.map(item => `
            <tr>
                <td>${escapeHtml(item.asset)}</td>
                <td>${item.trades}</td>
                <td>${item.wins}</td>
                <td>${item.losses}</td>
                <td>${item.breakevens}</td>
                <td>${item.winrate.toFixed(1)}%</td>
                <td>${money(item.profit)}</td>
                <td>${item.averageRR.toFixed(2)}</td>
                <td>${money(item.best)}</td>
                <td>${money(item.worst)}</td>
            </tr>
        `).join("");
}


/* ============================================================
   22. HISTORIQUE
   ============================================================ */

function renderHistory(tradeList) {
    const tbody =
        document.getElementById(
            "historyBody"
        );

    if (!tbody) {
        return;
    }

    const sorted =
        [...tradeList].sort(
            (a, b) =>
                new Date(
                    b.createdAt || b.date
                ) -
                new Date(
                    a.createdAt || a.date
                )
        );

    if (!sorted.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="14">
                    Aucun trade pour cette période.
                </td>
            </tr>
        `;

        return;
    }

    tbody.innerHTML =
        sorted.map(trade => {
            const pnl =
                parseNumber(
                    trade.profit ?? trade.pnl
                );

            const rr =
                getTradeTargetRR(trade);

            return `
                <tr>
                    <td>${escapeHtml(
                        trade.date || "-"
                    )}</td>

                    <td>${escapeHtml(
                        formatStoredDateTime(
                            trade.recordedAt ||
                            trade.createdAt
                        )
                    )}</td>

                    <td>${escapeHtml(
                        trade.asset || "-"
                    )}</td>

                    <td>${escapeHtml(
                        trade.direction || "-"
                    )}</td>

                    <td>${formatNumber(
                        trade.lot,
                        2
                    )}</td>

                    <td>${formatNumber(
                        trade.entry,
                        5
                    )}</td>

                    <td>${formatNumber(
                        trade.sl,
                        5
                    )}</td>

                    <td>${formatNumber(
                        trade.tp,
                        5
                    )}</td>

                    <td>${rr !== null
                        ? rr.toFixed(2)
                        : "-"
                    }</td>

                    <td>${formatNumber(
                        trade.pips,
                        1
                    )}</td>

                    <td>${escapeHtml(
                        trade.setup || "-"
                    )}</td>

                    <td>${escapeHtml(
                        trade.result || "-"
                    )}</td>

                    <td>${money(pnl)}</td>

                    <td>
                        <button
                            type="button"
                            class="delete-btn"
                            onclick="deleteTrade('${escapeHtml(
                                trade.id
                            )}')"
                        >
                            Supprimer
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
}


function clearCurrentCapitalTrades() {
    if (!activeCapital) {
        return;
    }

    const capitalTrades =
        getActiveCapitalTrades();

    if (!capitalTrades.length) {
        return;
    }

    const confirmation = confirm(
        `Supprimer les ${capitalTrades.length} trades du capital actif ?\n\n` +
        "Cette action ne peut pas être annulée."
    );

    if (!confirmation) {
        return;
    }

    trades = trades.filter(
        trade =>
            String(trade.capitalId) !==
            String(activeCapital.id)
    );

    saveTrades();

    renderEverything();
}


/* ============================================================
   23. ANALYSE / V51
   ============================================================ */

function renderAnalysisPage() {
    const allTrades =
        getActiveCapitalTrades();

    currentAnalysisTrades =
        [...allTrades];

    /*
     * Les fonctions suivantes sont fournies
     * par v51-filters.js.
     */
    if (typeof displayRiskStats === "function") {
        displayRiskStats(
            currentAnalysisTrades
        );
    }

    if (typeof displayRRStats === "function") {
        displayRRStats(
            currentAnalysisTrades
        );
    }

    if (
        typeof renderSetupPerformance ===
        "function"
    ) {
        renderSetupPerformance(
            currentAnalysisTrades
        );
    }

    if (
        typeof renderAssetPerformance ===
        "function"
    ) {
        renderAssetPerformance(
            currentAnalysisTrades
        );
    }

    if (
        typeof renderSetupRanking ===
        "function"
    ) {
        renderSetupRanking(
            currentAnalysisTrades
        );
    }

    if (
        typeof renderRecommendations ===
        "function"
    ) {
        renderRecommendations(
            currentAnalysisTrades
        );
    }

    if (
        typeof renderCalendar ===
        "function"
    ) {
        renderCalendar(
            currentAnalysisTrades
        );
    }
}


/* ============================================================
   24. ARCHIVES
   ============================================================ */

function renderArchives() {
    const container =
        document.getElementById(
            "archivesList"
        );

    if (!container) {
        return;
    }

    if (!archives.length) {
        container.innerHTML = `
            <div class="archive-empty">
                <p>Aucune archive disponible.</p>
            </div>
        `;

        return;
    }

    container.innerHTML =
        archives.map(archive => {
            const archiveTrades =
                archive.trades || [];

            const profit =
                calculateProfit(
                    archiveTrades
                );

            const initial =
                parseNumber(
                    archive.initialCapital
                );

            const finalBalance =
                initial + profit;

            return `
                <article
                    class="archive-card"
                    data-archive-id="${escapeHtml(
                        archive.id
                    )}"
                >
                    <div class="archive-card-header">
                        <div>
                            <h3>
                                ${escapeHtml(
                                    archive.name
                                )}
                            </h3>

                            <small>
                                Archivé le
                                ${escapeHtml(
                                    formatStoredDateTime(
                                        archive.archivedAt
                                    )
                                )}
                            </small>
                        </div>
                    </div>

                    <div class="archive-card-stats">
                        <div class="archive-stat">
                            <span>Initial</span>
                            <strong>
                                ${money(initial)}
                            </strong>
                        </div>

                        <div class="archive-stat">
                            <span>Final</span>
                            <strong>
                                ${money(finalBalance)}
                            </strong>
                        </div>

                        <div class="archive-stat">
                            <span>Profit</span>
                            <strong>
                                ${money(profit)}
                            </strong>
                        </div>

                        <div class="archive-stat">
                            <span>Trades</span>
                            <strong>
                                ${archiveTrades.length}
                            </strong>
                        </div>
                    </div>

                    <div class="archive-card-actions">
                        <button
                            type="button"
                            class="archive-view-btn"
                            onclick="openArchiveChartById('${escapeHtml(
                                archive.id
                            )}')"
                        >
                            Voir
                        </button>

                        <button
                            type="button"
                            class="archive-delete-btn"
                            onclick="deleteArchive('${escapeHtml(
                                archive.id
                            )}')"
                        >
                            Supprimer
                        </button>
                    </div>
                </article>
            `;
        }).join("");
}


function openArchiveChartById(archiveId) {
    const archive =
        archives.find(
            item =>
                String(item.id) ===
                String(archiveId)
        );

    if (archive) {
        openArchiveChart(archive);
    }
}


function openArchiveChart(archive) {
    const modal =
        document.getElementById(
            "archiveChartModal"
        );

    if (!modal) {
        return;
    }

    editingArchiveId =
        archive.id;

    const title =
        document.getElementById(
            "archiveChartTitle"
        );

    const subtitle =
        document.getElementById(
            "archiveChartSubtitle"
        );

    const initial =
        document.getElementById(
            "archiveChartInitial"
        );

    const final =
        document.getElementById(
            "archiveChartFinal"
        );

    const profit =
        document.getElementById(
            "archiveChartProfit"
        );

    const archiveTrades =
        archive.trades || [];

    const initialValue =
        parseNumber(
            archive.initialCapital
        );

    const profitValue =
        calculateProfit(
            archiveTrades
        );

    const finalValue =
        initialValue + profitValue;

    if (title) {
        title.textContent =
            archive.name;
    }

    if (subtitle) {
        subtitle.textContent =
            `Archivé le ${formatStoredDateTime(
                archive.archivedAt
            )}`;
    }

    if (initial) {
        initial.textContent =
            money(initialValue);
    }

    if (final) {
        final.textContent =
            money(finalValue);
    }

    if (profit) {
        profit.textContent =
            money(profitValue);
    }

    modal.classList.add("show");
    modal.setAttribute(
        "aria-hidden",
        "false"
    );

    renderArchiveChart(
        archive
    );
}


function closeArchiveChart() {
    const modal =
        document.getElementById(
            "archiveChartModal"
        );

    if (!modal) {
        return;
    }

    modal.classList.remove("show");
    modal.setAttribute(
        "aria-hidden",
        "true"
    );

    editingArchiveId = null;
}


function renderArchiveChart(archive) {
    const canvas =
        document.getElementById(
            "archiveChart"
        );

    if (!canvas) {
        return;
    }

    const archiveTrades =
        [...(archive.trades || [])]
            .sort(
                (a, b) =>
                    new Date(
                        a.createdAt || a.date
                    ) -
                    new Date(
                        b.createdAt || b.date
                    )
            );

    let balance =
        parseNumber(
            archive.initialCapital
        );

    const values = [
        balance
    ];

    const labels = [
        "Départ"
    ];

    archiveTrades.forEach(trade => {
        balance +=
            parseNumber(
                trade.profit ?? trade.pnl
            );

        values.push(balance);
        labels.push(
            trade.date || ""
        );
    });

    drawLineChart(
        canvas,
        labels,
        values
    );
}


/* ============================================================
   25. BOUTONS DE PÉRIODE
   ============================================================ */

function initializePeriodButtons() {
    document
        .querySelectorAll(
            ".period-btn"
        )
        .forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    currentPeriod =
                        button.dataset.period ||
                        "today";

                    document
                        .querySelectorAll(
                            ".period-btn"
                        )
                        .forEach(item => {
                            item.classList.toggle(
                                "active",
                                item === button
                            );
                        });

                    renderPerformancePage();
                }
            );
        });
}


/* ============================================================
   26. MODALES
   ============================================================ */

function initializeModals() {
    const capitalModal =
        document.getElementById(
            "capitalModal"
        );

    const archiveModal =
        document.getElementById(
            "archiveChartModal"
        );

    const tradeModal =
        document.getElementById(
            "tradeModal"
        );

    document
        .getElementById(
            "changeCapitalBtn"
        )
        ?.addEventListener(
            "click",
            () => {
                if (activeCapital) {
                    openCapitalModal(
                        "edit",
                        activeCapital
                    );
                }
            }
        );

    document
        .getElementById(
            "newCapitalBtn"
        )
        ?.addEventListener(
            "click",
            createNewCapital
        );

    document
        .getElementById(
            "archiveCapitalBtn"
        )
        ?.addEventListener(
            "click",
            archiveActiveCapital
        );

    document
        .getElementById(
            "openTradeModalBtn"
        )
        ?.addEventListener(
            "click",
            openTradeModal
        );

    document
        .getElementById(
            "capitalSaveBtn"
        )
        ?.addEventListener(
            "click",
            saveCapitalFromModal
        );

    document
        .getElementById(
            "capitalCancelBtn"
        )
        ?.addEventListener(
            "click",
            closeCapitalModal
        );

    document
        .getElementById(
            "capitalModalClose"
        )
        ?.addEventListener(
            "click",
            closeCapitalModal
        );

    document
        .getElementById(
            "archiveChartClose"
        )
        ?.addEventListener(
            "click",
            closeArchiveChart
        );

    document
        .getElementById(
            "archiveChartCancel"
        )
        ?.addEventListener(
            "click",
            closeArchiveChart
        );

    [
        capitalModal,
        archiveModal,
        tradeModal
    ].forEach(modal => {
        modal?.addEventListener(
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

                    document.body.classList.remove(
                        "trade-modal-open"
                    );
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

            closeCapitalModal();
            closeArchiveChart();
            closeTradeModal();
        }
    );
}


/* ============================================================
   27. FORMULAIRE TRADE
   ============================================================ */

function initializeTradeForm() {
    const form =
        document.getElementById(
            "tradeForm"
        );

    if (!form) {
        return;
    }

    form.addEventListener(
        "submit",
        handleTradeSubmit
    );

    [
        "tradeAsset",
        "tradeDirection",
        "tradeEntry",
        "tradeSL"
    ].forEach(id => {
        document
            .getElementById(id)
            ?.addEventListener(
                "input",
                updateAutomaticTradeValues
            );

        document
            .getElementById(id)
            ?.addEventListener(
                "change",
                updateAutomaticTradeValues
            );
    });

    document
        .getElementById(
            "tradeResult"
        )
        ?.addEventListener(
            "change",
            updateAutomaticTradeValues
        );
}


/* ============================================================
   28. CAPITAL MODAL
   ============================================================ */

function initializeCapitalForm() {
    [
        "capitalRiskInput",
        "capitalRRInput"
    ].forEach(id => {
        document
            .getElementById(id)
            ?.addEventListener(
                "input",
                updateCapitalModalPreview
            );
    });
}


/* ============================================================
   29. BOUTON CLEAR
   ============================================================ */

function initializeClearButton() {
    document
        .getElementById(
            "clearBtn"
        )
        ?.addEventListener(
            "click",
            clearCurrentCapitalTrades
        );
}


/* ============================================================
   30. CALENDRIER V51
   ============================================================ */

function initializeCalendarState() {
    const now =
        new Date();

    calendarMonth =
        now.getMonth();

    calendarYear =
        now.getFullYear();
}


/* ============================================================
   31. RENDU GLOBAL
   ============================================================ */

function renderEverything() {
    renderDashboard();

    renderPerformancePage();

    renderAnalysisPage();

    renderArchives();
}


/* ============================================================
   32. INITIALISATION
   ============================================================ */

function initializeApp() {
    loadData();

    initializeTheme();
    initializeNavigation();
    initializePeriodButtons();
    initializeModals();
    initializeTradeForm();
    initializeCapitalForm();
    initializeClearButton();
    initializeCalendarState();

    /*
     * Par défaut : Dashboard.
     */
    showPage("dashboard");

    renderEverything();
}


/* ============================================================
   33. REDIMENSIONNEMENT DES GRAPHIQUES
   ============================================================ */

window.addEventListener(
    "resize",
    () => {
        renderCapitalChart();

        if (
            editingArchiveId
        ) {
            const archive =
                archives.find(
                    item =>
                        String(item.id) ===
                        String(editingArchiveId)
                );

            if (archive) {
                renderArchiveChart(
                    archive
                );
            }
        }
    }
);


/* ============================================================
   34. DÉMARRAGE
   ============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    initializeApp
);
