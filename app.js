"use strict";

/* ============================================================
   ARCH TRADING PLAN
   APP.JS — LOGIQUE PRINCIPALE
   ============================================================ */


/* ============================================================
   CONFIGURATION
   ============================================================ */

const TRADES_KEY = "tradingTrades";
const CAPITAL_KEY = "tradingActiveCapital";
const ARCHIVES_KEY = "tradingCapitalArchives";
const THEME_KEY = "tradingDashboardTheme";

const MIN_RR = 2;
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
   ÉTAT
   ============================================================ */

let trades = [];
let archives = [];
let activeCapital = null;

let currentAnalysisPeriod = "today";
let currentPerformancePeriod = "today";

let currentCapitalModalMode = "new";

let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();

let capitalChartInstance = null;
let archiveChartInstance = null;


/* ============================================================
   UTILITAIRES
   ============================================================ */

function parseNumber(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return NaN;
    }

    return Number(
        String(value).replace(",", ".")
    );
}


function formatMoney(value) {

    const number = Number(value) || 0;

    return "$" + number.toFixed(2);
}


function money(value) {
    return formatMoney(value);
}


function formatNumber(value, decimals = 2) {

    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "-";
    }

    return number.toFixed(decimals);
}


function generateId() {

    return (
        Date.now().toString(36) +
        Math.random()
            .toString(36)
            .slice(2)
    );
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


function getTodayDate() {

    return new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone: MADAGASCAR_TIMEZONE
        }
    ).format(new Date());
}


function formatStoredDateTime(value) {

    if (!value) {
        return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return new Intl.DateTimeFormat(
        "fr-FR",
        {
            timeZone: MADAGASCAR_TIMEZONE,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        }
    ).format(date);
}


/* ============================================================
   STOCKAGE
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

    localStorage.setItem(
        CAPITAL_KEY,
        JSON.stringify(activeCapital)
    );
}


function loadData() {

    try {
        trades =
            JSON.parse(
                localStorage.getItem(TRADES_KEY)
            ) || [];
    } catch {
        trades = [];
    }


    try {
        archives =
            JSON.parse(
                localStorage.getItem(ARCHIVES_KEY)
            ) || [];
    } catch {
        archives = [];
    }


    try {
        activeCapital =
            JSON.parse(
                localStorage.getItem(CAPITAL_KEY)
            );
    } catch {
        activeCapital = null;
    }


    if (!Array.isArray(trades)) {
        trades = [];
    }

    if (!Array.isArray(archives)) {
        archives = [];
    }


    /*
       Migration des anciens trades.
    */

    trades = trades.map(trade => {

        return {
            ...trade,

            id:
                trade.id ||
                generateId(),

            pnl:
                Number(trade.pnl) || 0,

            capitalId:
                trade.capitalId ||
                activeCapital?.id ||
                null
        };
    });
}


/* ============================================================
   CAPITAL
   ============================================================ */

function getCapitalRisk(capital = activeCapital) {

    const value = Number(
        capital?.riskReference ??
        capital?.riskPerTrade ??
        0
    );

    return Number.isFinite(value) && value > 0
        ? value
        : 0;
}


function getCapitalRR(capital = activeCapital) {

    const value = Number(
        capital?.rrTarget ??
        capital?.rr ??
        MIN_RR
    );

    return Number.isFinite(value) && value >= MIN_RR
        ? value
        : MIN_RR;
}


function getCapitalObjective(capital = activeCapital) {

    return (
        getCapitalRisk(capital) *
        getCapitalRR(capital)
    );
}


function getCapitalTrades(capitalId) {

    return trades.filter(
        trade =>
            trade.capitalId === capitalId
    );
}


function getActiveCapitalTrades() {

    if (!activeCapital) {
        return [];
    }

    return getCapitalTrades(
        activeCapital.id
    );
}


function calculateProfit(tradeList) {

    return tradeList.reduce(
        (sum, trade) =>
            sum + (Number(trade.pnl) || 0),
        0
    );
}


function calculateCurrentBalance() {

    if (!activeCapital) {
        return 0;
    }

    return (
        Number(activeCapital.initialCapital) || 0
    ) +
    calculateProfit(
        getActiveCapitalTrades()
    );
}


/* ============================================================
   CAPITAL — CRÉATION / MODIFICATION
   ============================================================ */

function openCapitalModal(mode = "new") {

    const modal =
        document.getElementById("capitalModal");

    if (!modal) {
        return;
    }

    currentCapitalModalMode = mode;

    const title =
        document.getElementById(
            "capitalModalTitle"
        );

    const nameInput =
        document.getElementById(
            "capitalNameInput"
        );

    const amountInput =
        document.getElementById(
            "capitalAmountInput"
        );

    const riskInput =
        document.getElementById(
            "capitalRiskInput"
        );

    const rrInput =
        document.getElementById(
            "capitalRRInput"
        );


    if (mode === "edit" && activeCapital) {

        if (title) {
            title.textContent =
                "Modifier le capital";
        }

        if (nameInput) {
            nameInput.value =
                activeCapital.name || "";
        }

        if (amountInput) {
            amountInput.value =
                activeCapital.initialCapital || "";
        }

        if (riskInput) {
            riskInput.value =
                getCapitalRisk(activeCapital);
        }

        if (rrInput) {
            rrInput.value =
                getCapitalRR(activeCapital);
        }

    } else {

        if (title) {
            title.textContent =
                "Nouveau capital";
        }

        if (nameInput) {
            nameInput.value = "";
        }

        if (amountInput) {
            amountInput.value = "";
        }

        if (riskInput) {
            riskInput.value = "";
        }

        if (rrInput) {
            rrInput.value = MIN_RR;
        }
    }


    updateCapitalPreview();

    modal.classList.add("show");
    modal.setAttribute(
        "aria-hidden",
        "false"
    );
}


function closeCapitalModal() {

    const modal =
        document.getElementById("capitalModal");

    if (!modal) {
        return;
    }

    modal.classList.remove("show");

    modal.setAttribute(
        "aria-hidden",
        "true"
    );
}


function updateCapitalPreview() {

    const amount =
        parseNumber(
            document.getElementById(
                "capitalAmountInput"
            )?.value
        );

    const risk =
        parseNumber(
            document.getElementById(
                "capitalRiskInput"
            )?.value
        );

    const rr =
        parseNumber(
            document.getElementById(
                "capitalRRInput"
            )?.value
        );


    const riskPreview =
        document.getElementById(
            "capitalModalRiskPreview"
        );

    const rrPreview =
        document.getElementById(
            "capitalModalRR"
        );

    const objectivePreview =
        document.getElementById(
            "capitalModalObjective"
        );


    if (riskPreview) {
        riskPreview.textContent =
            Number.isFinite(risk)
                ? formatMoney(risk)
                : "$0.00";
    }


    if (rrPreview) {
        rrPreview.textContent =
            Number.isFinite(rr)
                ? rr.toFixed(2)
                : MIN_RR.toFixed(2);
    }


    if (objectivePreview) {
        objectivePreview.textContent =
            Number.isFinite(risk) &&
            Number.isFinite(rr)
                ? formatMoney(risk * rr)
                : "$0.00";
    }
}


function saveCapitalFromForm(event) {

    event.preventDefault();

    const name =
        document.getElementById(
            "capitalNameInput"
        )?.value.trim();

    const amount =
        parseNumber(
            document.getElementById(
                "capitalAmountInput"
            )?.value
        );

    const risk =
        parseNumber(
            document.getElementById(
                "capitalRiskInput"
            )?.value
        );

    const rr =
        parseNumber(
            document.getElementById(
                "capitalRRInput"
            )?.value
        );


    if (!name) {
        alert("Veuillez entrer un nom de capital.");
        return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
        alert("Le capital initial doit être supérieur à 0.");
        return;
    }

    if (!Number.isFinite(risk) || risk <= 0) {
        alert("Le risque par trade doit être supérieur à 0.");
        return;
    }

    if (!Number.isFinite(rr) || rr < MIN_RR) {
        alert("Le RR cible doit être au minimum de 2.00.");
        return;
    }


    if (
        currentCapitalModalMode === "edit" &&
        activeCapital
    ) {

        activeCapital.name = name;
        activeCapital.initialCapital = amount;
        activeCapital.riskReference = risk;
        activeCapital.rrTarget = rr;

    } else {

        activeCapital = {

            id: generateId(),

            name,

            initialCapital: amount,

            riskReference: risk,

            rrTarget: rr,

            createdAt:
                new Date().toISOString()
        };
    }


    saveActiveCapital();

    closeCapitalModal();

    renderAll();
}


/* ============================================================
   ARCHIVES
   ============================================================ */

function archiveCurrentCapital() {

    if (!activeCapital) {
        alert("Aucun capital actif à archiver.");
        return;
    }


    const capitalTrades =
        getActiveCapitalTrades();


    const confirmed =
        confirm(
            `Archiver "${activeCapital.name}" ?`
        );


    if (!confirmed) {
        return;
    }


    const archive = {

        id: generateId(),

        name:
            activeCapital.name,

        initialCapital:
            Number(
                activeCapital.initialCapital
            ) || 0,

        riskReference:
            getCapitalRisk(activeCapital),

        rrTarget:
            getCapitalRR(activeCapital),

        createdAt:
            activeCapital.createdAt,

        archivedAt:
            new Date().toISOString(),

        trades:
            [...capitalTrades]
    };


    archives.unshift(archive);


    trades =
        trades.filter(
            trade =>
                trade.capitalId !==
                activeCapital.id
        );


    activeCapital = null;


    saveArchives();
    saveTrades();
    saveActiveCapital();


    renderAll();
}


function deleteArchive(id) {

    const archive =
        archives.find(
            item => item.id === id
        );

    if (!archive) {
        return;
    }


    if (
        !confirm(
            `Supprimer définitivement l'archive "${archive.name}" ?`
        )
    ) {
        return;
    }


    archives =
        archives.filter(
            item => item.id !== id
        );


    saveArchives();

    renderArchives();
}


function openArchiveChart(id) {

    const archive =
        archives.find(
            item => item.id === id
        );

    if (!archive) {
        return;
    }


    const modal =
        document.getElementById(
            "archiveChartModal"
        );

    if (!modal) {
        return;
    }


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
        Array.isArray(archive.trades)
            ? archive.trades
            : [];


    const totalProfit =
        calculateProfit(
            archiveTrades
        );


    const finalBalance =
        Number(
            archive.initialCapital
        ) + totalProfit;


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
            formatMoney(
                archive.initialCapital
            );
    }

    if (final) {
        final.textContent =
            formatMoney(finalBalance);
    }

    if (profit) {
        profit.textContent =
            formatMoney(totalProfit);
    }


    modal.classList.add("show");

    modal.setAttribute(
        "aria-hidden",
        "false"
    );


    setTimeout(
        () =>
            drawArchiveChart(
                archive
            ),
        20
    );
}


function closeArchiveChartModal() {

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
}


/* ============================================================
   PÉRIODES
   ============================================================ */

function getTradeDate(trade) {

    return (
        trade.date ||
        trade.tradeDate ||
        ""
    );
}


function getTradeDateObject(trade) {

    const date =
        getTradeDate(trade);

    if (!date) {
        return null;
    }

    const parsed =
        new Date(
            `${date}T12:00:00`
        );

    return Number.isNaN(
        parsed.getTime()
    )
        ? null
        : parsed;
}


function isToday(trade) {

    return (
        getTradeDate(trade) ===
        getTodayDate()
    );
}


function isThisWeek(trade) {

    const date =
        getTradeDateObject(trade);

    if (!date) {
        return false;
    }


    const now =
        new Date();

    const day =
        now.getDay();

    const diff =
        day === 0
            ? -6
            : 1 - day;


    const monday =
        new Date(now);

    monday.setHours(
        0,
        0,
        0,
        0
    );

    monday.setDate(
        now.getDate() + diff
    );


    const sunday =
        new Date(monday);

    sunday.setDate(
        monday.getDate() + 6
    );

    sunday.setHours(
        23,
        59,
        59,
        999
    );


    return (
        date >= monday &&
        date <= sunday
    );
}


function isThisMonth(trade) {

    const date =
        getTradeDateObject(trade);

    if (!date) {
        return false;
    }

    const now =
        new Date();

    return (
        date.getFullYear() ===
            now.getFullYear() &&
        date.getMonth() ===
            now.getMonth()
    );
}


function isThisYear(trade) {

    const date =
        getTradeDateObject(trade);

    if (!date) {
        return false;
    }

    return (
        date.getFullYear() ===
        new Date().getFullYear()
    );
}


function filterTradesByPeriod(
    tradeList,
    period
) {

    if (period === "all") {
        return [...tradeList];
    }


    return tradeList.filter(
        trade => {

            if (period === "today") {
                return isToday(trade);
            }

            if (period === "week") {
                return isThisWeek(trade);
            }

            if (period === "month") {
                return isThisMonth(trade);
            }

            if (period === "year") {
                return isThisYear(trade);
            }

            return true;
        }
    );
}


/* ============================================================
   CALCULS TRADE
   ============================================================ */

function getTradeRiskDistance(trade) {

    const entry =
        Number(trade.entry);

    const sl =
        Number(trade.sl);

    if (
        !Number.isFinite(entry) ||
        !Number.isFinite(sl)
    ) {
        return null;
    }

    return Math.abs(
        entry - sl
    );
}


function calculateTP(
    entry,
    sl,
    direction,
    rr
) {

    const distance =
        Math.abs(
            entry - sl
        );

    if (
        !Number.isFinite(distance) ||
        distance <= 0
    ) {
        return null;
    }


    if (direction === "BUY") {
        return entry + distance * rr;
    }

    return entry - distance * rr;
}


function getTradeTargetRR(trade) {

    const entry =
        Number(trade.entry);

    const sl =
        Number(trade.sl);

    const tp =
        Number(trade.tp);


    if (
        !Number.isFinite(entry) ||
        !Number.isFinite(sl) ||
        !Number.isFinite(tp)
    ) {
        return null;
    }


    const risk =
        Math.abs(entry - sl);

    const reward =
        Math.abs(tp - entry);


    if (risk <= 0) {
        return null;
    }


    return reward / risk;
}


function calculateRiskMoney(trade) {

    if (
        Number.isFinite(
            Number(trade.riskMoney)
        )
    ) {
        return Number(
            trade.riskMoney
        );
    }


    return getCapitalRisk(
        activeCapital
    );
}


function getCapitalForTrade(trade) {

    if (
        activeCapital &&
        trade.capitalId ===
            activeCapital.id
    ) {
        return activeCapital;
    }

    return activeCapital;
}


function calculateLotFromRisk(
    trade
) {

    const capital =
        getCapitalForTrade(trade);

    const risk =
        getCapitalRisk(capital);

    const distance =
        getTradeRiskDistance(trade);


    if (
        risk <= 0 ||
        !distance ||
        distance <= 0
    ) {
        return MIN_LOT;
    }


    /*
       Modèle simplifié interne.
       Le lot est plafonné à 2 décimales.
    */

    const lot =
        risk /
        (distance * 100);


    if (!Number.isFinite(lot)) {
        return MIN_LOT;
    }


    const rounded =
        Math.floor(
            lot / LOT_STEP
        ) * LOT_STEP;


    return Math.max(
        MIN_LOT,
        Number(
            rounded.toFixed(2)
        )
    );
}


function calculateTradeProfit(trade) {

    const risk =
        Number(
            trade.riskMoney
        ) ||
        getCapitalRisk(
            getCapitalForTrade(trade)
        );


    const result =
        String(
            trade.result || ""
        ).toUpperCase();


    if (result === "TP") {
        return risk *
            getCapitalRR(
                getCapitalForTrade(trade)
            );
    }


    if (result === "SL") {
        return -risk;
    }


    return 0;
}


function calculatePips(trade) {

    const entry =
        Number(trade.entry);

    const exit =
        trade.result === "TP"
            ? Number(trade.tp)
            : trade.result === "SL"
                ? Number(trade.sl)
                : entry;


    if (
        !Number.isFinite(entry) ||
        !Number.isFinite(exit)
    ) {
        return 0;
    }


    const asset =
        String(
            trade.asset || ""
        ).toUpperCase();


    let pipSize =
        0.0001;


    if (
        asset.includes("JPY")
    ) {
        pipSize = 0.01;
    }

    if (
        asset === "XAUUSD"
    ) {
        pipSize = 0.1;
    }

    if (
        asset === "BTCUSD"
    ) {
        pipSize = 1;
    }


    return (
        Math.abs(
            exit - entry
        ) / pipSize
    );
}


/* ============================================================
   TRADE MODAL
   ============================================================ */

function populateTradeForm() {

    const asset =
        document.getElementById(
            "tradeAsset"
        );

    const setup =
        document.getElementById(
            "tradeSetup"
        );


    if (asset) {

        asset.innerHTML =
            ASSETS.map(
                item =>
                    `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`
            ).join("");
    }


    if (setup) {

        setup.innerHTML =
            SETUPS.map(
                item =>
                    `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`
            ).join("");
    }
}


function openTradeModal() {

    if (!activeCapital) {

        alert(
            "Crée d'abord un capital actif."
        );

        openCapitalModal("new");

        return;
    }


    const modal =
        document.getElementById(
            "tradeModal"
        );

    const form =
        document.getElementById(
            "tradeForm"
        );


    if (!modal || !form) {
        return;
    }


    form.reset();


    const date =
        document.getElementById(
            "tradeDate"
        );

    if (date) {
        date.value =
            getTodayDate();
    }


    updateAutomaticTradeValues();


    modal.classList.add("show");

    modal.setAttribute(
        "aria-hidden",
        "false"
    );


    document.body.classList.add(
        "trade-modal-open"
    );


    setTimeout(
        () =>
            document
                .getElementById(
                    "tradeAsset"
                )
                ?.focus(),
        50
    );
}


function closeTradeModal() {

    const modal =
        document.getElementById(
            "tradeModal"
        );

    if (!modal) {
        return;
    }

    modal.classList.remove("show");

    modal.setAttribute(
        "aria-hidden",
        "true"
    );

    document.body.classList.remove(
        "trade-modal-open"
    );
}


function updateAutomaticTradeValues() {

    const entry =
        parseNumber(
            document.getElementById(
                "tradeEntry"
            )?.value
        );

    const sl =
        parseNumber(
            document.getElementById(
                "tradeSL"
            )?.value
        );

    const direction =
        document.getElementById(
            "tradeDirection"
        )?.value ||
        "BUY";


    const rr =
        getCapitalRR(
            activeCapital
        );


    const tp =
        calculateTP(
            entry,
            sl,
            direction,
            rr
        );


    const tpInput =
        document.getElementById(
            "tradeTP"
        );

    const rrInput =
        document.getElementById(
            "calculatedRR"
        );

    const lotInput =
        document.getElementById(
            "tradeLot"
        );

    const profit =
        document.getElementById(
            "tradeProfit"
        );

    const info =
        document.getElementById(
            "tradeMMInfo"
        );


    if (tpInput) {

        tpInput.value =
            Number.isFinite(tp)
                ? tp.toFixed(5)
                : "";
    }


    if (
        rrInput
    ) {

        rrInput.value =
            Number.isFinite(tp)
                ? rr.toFixed(2)
                : "";
    }


    const temporaryTrade = {

        entry,
        sl
    };


    const lot =
        calculateLotFromRisk(
            temporaryTrade
        );


    if (lotInput) {
        lotInput.value =
            lot.toFixed(2);
    }


    const result =
        document.querySelector(
            'input[name="tradeResult"]:checked'
        )?.value ||
        "TP";


    const estimatedProfit =
        result === "TP"
            ? getCapitalRisk(activeCapital) *
              rr
            : result === "SL"
                ? -getCapitalRisk(activeCapital)
                : 0;


    if (profit) {
        profit.textContent =
            formatMoney(
                estimatedProfit
            );
    }


    if (info) {

        info.textContent =
            `Risque : ${formatMoney(
                getCapitalRisk(activeCapital)
            )} · RR cible : ${rr.toFixed(2)} · Lot indicatif : ${lot.toFixed(2)}`;
    }
}


function saveTrade(event) {

    event.preventDefault();


    if (!activeCapital) {

        alert(
            "Aucun capital actif."
        );

        return;
    }


    const asset =
        document.getElementById(
            "tradeAsset"
        )?.value;

    const date =
        document.getElementById(
            "tradeDate"
        )?.value;

    const direction =
        document.getElementById(
            "tradeDirection"
        )?.value;

    const orderType =
        document.getElementById(
            "tradeOrderType"
        )?.value;

    const entry =
        parseNumber(
            document.getElementById(
                "tradeEntry"
            )?.value
        );

    const sl =
        parseNumber(
            document.getElementById(
                "tradeSL"
            )?.value
        );

    const tp =
        parseNumber(
            document.getElementById(
                "tradeTP"
            )?.value
        );

    const setup =
        document.getElementById(
            "tradeSetup"
        )?.value;

    const result =
        document.querySelector(
            'input[name="tradeResult"]:checked'
        )?.value;

    const comment =
        document.getElementById(
            "tradeComment"
        )?.value.trim();


    if (
        !asset ||
        !date ||
        !direction ||
        !Number.isFinite(entry) ||
        !Number.isFinite(sl) ||
        !Number.isFinite(tp) ||
        !result
    ) {

        alert(
            "Veuillez remplir correctement tous les champs obligatoires."
        );

        return;
    }


    const risk =
        getCapitalRisk(
            activeCapital
        );


    const rr =
        getCapitalRR(
            activeCapital
        );


    const lot =
        calculateLotFromRisk({
            entry,
            sl
        });


    const trade = {

        id: generateId(),

        capitalId:
            activeCapital.id,

        asset,

        date,

        recordedAt:
            new Date().toISOString(),

        direction,

        orderType,

        lot,

        entry,

        sl,

        tp,

        rr,

        pips: 0,

        setup,

        result,

        riskMoney:
            risk,

        pnl:
            result === "TP"
                ? risk * rr
                : result === "SL"
                    ? -risk
                    : 0,

        comment
    };


    trade.pips =
        calculatePips(trade);


    trades.unshift(
        trade
    );


    saveTrades();

    closeTradeModal();

    renderAll();
}


/* ============================================================
   STATISTIQUES
   ============================================================ */

function calculateAdvancedStats(
    tradeList
) {

    const list =
        Array.isArray(tradeList)
            ? tradeList
            : [];


    const total =
        list.length;


    const wins =
        list.filter(
            t =>
                String(t.result)
                    .toUpperCase() === "TP"
        ).length;


    const losses =
        list.filter(
            t =>
                String(t.result)
                    .toUpperCase() === "SL"
        ).length;


    const be =
        list.filter(
            t =>
                String(t.result)
                    .toUpperCase() === "BE"
        ).length;


    const profit =
        calculateProfit(list);


    const winrate =
        total > 0
            ? wins / total * 100
            : 0;


    const winningTrades =
        list.filter(
            t =>
                Number(t.pnl) > 0
        );


    const losingTrades =
        list.filter(
            t =>
                Number(t.pnl) < 0
        );


    const grossProfit =
        winningTrades.reduce(
            (sum, t) =>
                sum + Number(t.pnl),
            0
        );


    const grossLoss =
        Math.abs(
            losingTrades.reduce(
                (sum, t) =>
                    sum + Number(t.pnl),
                0
            )
        );


    const profitFactor =
        grossLoss > 0
            ? grossProfit / grossLoss
            : null;


    const averageTrade =
        total > 0
            ? profit / total
            : 0;


    const averageWin =
        winningTrades.length > 0
            ? grossProfit /
              winningTrades.length
            : 0;


    const averageLoss =
        losingTrades.length > 0
            ? -grossLoss /
              losingTrades.length
            : 0;


    let currentWinStreak = 0;
    let currentLossStreak = 0;

    let maxWinStreak = 0;
    let maxLossStreak = 0;


    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0;


    const sorted =
        [...list].sort(
            (a, b) =>
                new Date(
                    a.recordedAt ||
                    a.date
                ) -
                new Date(
                    b.recordedAt ||
                    b.date
                )
        );


    sorted.forEach(
        trade => {

            const pnl =
                Number(trade.pnl) || 0;


            equity += pnl;


            if (equity > peak) {
                peak = equity;
            }


            const drawdown =
                equity - peak;


            if (
                drawdown <
                maxDrawdown
            ) {
                maxDrawdown =
                    drawdown;
            }


            if (pnl > 0) {

                currentWinStreak++;
                currentLossStreak = 0;

            } else if (pnl < 0) {

                currentLossStreak++;
                currentWinStreak = 0;

            } else {

                currentWinStreak = 0;
                currentLossStreak = 0;
            }


            maxWinStreak =
                Math.max(
                    maxWinStreak,
                    currentWinStreak
                );


            maxLossStreak =
                Math.max(
                    maxLossStreak,
                    currentLossStreak
                );
        }
    );


    const rrValues =
        list
            .map(
                trade =>
                    getTradeTargetRR(trade)
            )
            .filter(
                value =>
                    Number.isFinite(value)
            );


    const averageRR =
        rrValues.length > 0
            ? rrValues.reduce(
                (sum, value) =>
                    sum + value,
                0
            ) /
              rrValues.length
            : null;


    return {

        total,
        wins,
        losses,
        be,

        profit,

        winrate,

        profitFactor,

        averageTrade,

        averageWin,

        averageLoss,

        maxWinStreak,

        maxLossStreak,

        maxDrawdown,

        averageRR
    };
}


function calculateRiskStats(
    filteredTrades
) {

    const values = [];


    filteredTrades.forEach(
        trade => {

            const risk =
                Number(
                    trade.riskMoney
                );


            if (
                Number.isFinite(risk) &&
                risk > 0
            ) {
                values.push(risk);
            }
        }
    );


    const reference =
        getCapitalRisk(
            activeCapital
        );


    if (
        values.length === 0
    ) {

        return {

            averageRisk: null,
            minimumRisk: null,
            maximumRisk: null,
            referenceRisk:
                reference || null,

            averageDeviation: null,

            riskRegularity: null,

            compliantTrades: 0,

            nonCompliantTrades: 0
        };
    }


    const average =
        values.reduce(
            (sum, value) =>
                sum + value,
            0
        ) /
        values.length;


    const minimum =
        Math.min(...values);

    const maximum =
        Math.max(...values);


    let deviationTotal = 0;

    let compliant = 0;

    let nonCompliant = 0;


    values.forEach(
        value => {

            if (reference > 0) {

                const deviation =
                    Math.abs(
                        value - reference
                    ) /
                    reference;

                deviationTotal +=
                    deviation;

                if (
                    deviation <=
                    RISK_TOLERANCE
                ) {
                    compliant++;
                } else {
                    nonCompliant++;
                }
            }
        }
    );


    const averageDeviation =
        reference > 0
            ? deviationTotal /
              values.length *
              100
            : null;


    const regularity =
        reference > 0
            ? compliant /
              values.length *
              100
            : null;


    return {

        averageRisk:
            average,

        minimumRisk:
            minimum,

        maximumRisk:
            maximum,

        referenceRisk:
            reference || null,

        averageDeviation,

        riskRegularity:
            regularity,

        compliantTrades:
            compliant,

        nonCompliantTrades:
            nonCompliant
    };
}


/* ============================================================
   PERFORMANCE
   ============================================================ */

function renderPerformance() {

    const list =
        filterTradesByPeriod(
            getActiveCapitalTrades(),
            currentPerformancePeriod
        );


    const stats =
        calculateAdvancedStats(list);


    setText(
        "statBalance",
        formatMoney(
            calculateCurrentBalance()
        )
    );


    setText(
        "statProfit",
        formatMoney(
            stats.profit
        )
    );


    setText(
        "statWinrate",
        stats.winrate.toFixed(1) + "%"
    );


    setText(
        "statAverageRR",
        stats.averageRR !== null
            ? stats.averageRR.toFixed(2)
            : "-"
    );


    setText(
        "statTrades",
        String(stats.total)
    );


    const setupRows =
        buildSetupStats(list);


    setText(
        "statBestSetup",
        setupRows.length > 0
            ? setupRows[0].setup
            : "-"
    );


    setText(
        "statLastTrade",
        list.length > 0
            ? getTradeDate(
                list[0]
            )
            : "-"
    );


    setText(
        "statProfitFactor",
        stats.profitFactor !== null
            ? stats.profitFactor.toFixed(2)
            : "-"
    );


    setText(
        "statAverageTrade",
        formatMoney(
            stats.averageTrade
        )
    );


    setText(
        "statAverageWin",
        formatMoney(
            stats.averageWin
        )
    );


    setText(
        "statAverageLoss",
        formatMoney(
            stats.averageLoss
        )
    );


    setText(
        "statBestTrade",
        formatMoney(
            list.length
                ? Math.max(
                    ...list.map(
                        t =>
                            Number(t.pnl) || 0
                    )
                )
                : 0
        )
    );


    setText(
        "statWorstTrade",
        formatMoney(
            list.length
                ? Math.min(
                    ...list.map(
                        t =>
                            Number(t.pnl) || 0
                    )
                )
                : 0
        )
    );


    setText(
        "statMaxWinStreak",
        String(
            stats.maxWinStreak
        )
    );


    setText(
        "statMaxLossStreak",
        String(
            stats.maxLossStreak
        )
    );


    setText(
        "statMaxDrawdown",
        formatMoney(
            stats.maxDrawdown
        )
    );


    renderHistory();

    colorStatValues();
}


function buildSetupStats(
    tradeList
) {

    const map = {};


    tradeList.forEach(
        trade => {

            const setup =
                String(
                    trade.setup ||
                    "Sans setup"
                ).trim() ||
                "Sans setup";


            if (!map[setup]) {

                map[setup] = {

                    setup,

                    trades: 0,

                    wins: 0,

                    losses: 0,

                    be: 0,

                    profit: 0
                };
            }


            map[setup].trades++;


            const result =
                String(
                    trade.result ||
                    ""
                ).toUpperCase();


            if (result === "TP") {
                map[setup].wins++;
            }

            if (result === "SL") {
                map[setup].losses++;
            }

            if (result === "BE") {
                map[setup].be++;
            }


            map[setup].profit +=
                Number(trade.pnl) || 0;
        }
    );


    return Object.values(map)
        .sort(
            (a, b) =>
                b.profit -
                a.profit
        );
}


function buildAssetStats(
    tradeList
) {

    const map = {};


    tradeList.forEach(
        trade => {

            const asset =
                String(
                    trade.asset ||
                    "Sans actif"
                ).trim() ||
                "Sans actif";


            if (!map[asset]) {

                map[asset] = {

                    asset,

                    trades: 0,

                    wins: 0,

                    losses: 0,

                    be: 0,

                    profit: 0
                };
            }


            map[asset].trades++;


            const result =
                String(
                    trade.result ||
                    ""
                ).toUpperCase();


            if (result === "TP") {
                map[asset].wins++;
            }

            if (result === "SL") {
                map[asset].losses++;
            }

            if (result === "BE") {
                map[asset].be++;
            }


            map[asset].profit +=
                Number(trade.pnl) || 0;
        }
    );


    return Object.values(map)
        .sort(
            (a, b) =>
                b.profit -
                a.profit
        );
}


function renderHistory() {

    const tbody =
        document.getElementById(
            "historyBody"
        );


    if (!tbody) {
        return;
    }


    const list =
        [...getActiveCapitalTrades()]
            .sort(
                (a, b) =>
                    new Date(
                        b.recordedAt ||
                        b.date
                    ) -
                    new Date(
                        a.recordedAt ||
                        a.date
                    )
            );


    if (list.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td
                    colspan="14"
                    class="empty-state"
                >
                    Aucun trade enregistré.
                </td>
            </tr>
        `;

        return;
    }


    tbody.innerHTML =
        list.map(
            trade => {

                const pnl =
                    Number(trade.pnl) || 0;


                const result =
                    String(
                        trade.result || ""
                    ).toUpperCase();


                return `

                    <tr>

                        <td>
                            ${escapeHtml(
                                getTradeDate(trade)
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                formatStoredDateTime(
                                    trade.recordedAt
                                )
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                trade.asset
                            )}
                        </td>

                        <td>
                            <span class="${
                                trade.direction === "BUY"
                                    ? "text-green"
                                    : "text-red"
                            }">
                                ${escapeHtml(
                                    trade.direction
                                )}
                            </span>
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
                                5
                            )}
                        </td>

                        <td>
                            ${formatNumber(
                                trade.sl,
                                5
                            )}
                        </td>

                        <td>
                            ${formatNumber(
                                trade.tp,
                                5
                            )}
                        </td>

                        <td>
                            ${formatNumber(
                                getTradeTargetRR(
                                    trade
                                ),
                                2
                            )}
                        </td>

                        <td>
                            ${formatNumber(
                                trade.pips,
                                1
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                trade.setup
                            )}
                        </td>

                        <td>
                            <span class="result-badge ${
                                result === "TP"
                                    ? "win"
                                    : result === "SL"
                                        ? "loss"
                                        : "neutral"
                            }">
                                ${escapeHtml(
                                    result
                                )}
                            </span>
                        </td>

                        <td class="${
                            pnl > 0
                                ? "positive"
                                : pnl < 0
                                    ? "negative"
                                    : ""
                        }">
                            ${formatMoney(pnl)}
                        </td>

                        <td>
                            <button
                                class="delete-btn"
                                type="button"
                                data-delete-trade="${
                                    escapeHtml(
                                        trade.id
                                    )
                                }"
                            >
                                Supprimer
                            </button>
                        </td>

                    </tr>

                `;
            }
        ).join("");
}


function deleteTrade(id) {

    const trade =
        trades.find(
            item =>
                item.id === id
        );


    if (!trade) {
        return;
    }


    if (
        !confirm(
            "Supprimer ce trade ?"
        )
    ) {
        return;
    }


    trades =
        trades.filter(
            item =>
                item.id !== id
        );


    saveTrades();

    renderAll();
}


/* ============================================================
   DASHBOARD
   ============================================================ */

function renderDashboard() {

    const name =
        document.getElementById(
            "activeCapitalName"
        );

    const created =
        document.getElementById(
            "activeCapitalCreatedAt"
        );


    if (!activeCapital) {

        if (name) {
            name.textContent =
                "Aucun capital";
        }

        if (created) {
            created.textContent =
                "Crée un capital pour commencer.";
        }

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
            MIN_RR.toFixed(2)
        );

        setText(
            "theoreticalObjective",
            "$0.00"
        );

        drawCapitalChart([]);

        return;
    }


    if (name) {
        name.textContent =
            activeCapital.name;
    }


    if (created) {
        created.textContent =
            `Créé le ${formatStoredDateTime(
                activeCapital.createdAt
            )}`;
    }


    const capitalTrades =
        getActiveCapitalTrades();


    const profit =
        calculateProfit(
            capitalTrades
        );


    setText(
        "initialCapital",
        formatMoney(
            activeCapital.initialCapital
        )
    );


    setText(
        "currentBalance",
        formatMoney(
            calculateCurrentBalance()
        )
    );


    setText(
        "totalProfit",
        formatMoney(profit)
    );


    setText(
        "riskReference",
        formatMoney(
            getCapitalRisk()
        )
    );


    setText(
        "rrTarget",
        getCapitalRR().toFixed(2)
    );


    setText(
        "theoreticalObjective",
        formatMoney(
            getCapitalObjective()
        )
    );


    drawCapitalChart(
        capitalTrades
    );
}


/* ============================================================
   GRAPHIQUES NATIFS
   ============================================================ */

function prepareCanvas(
    canvas
) {

    const rect =
        canvas.getBoundingClientRect();


    const ratio =
        window.devicePixelRatio ||
        1;


    canvas.width =
        Math.max(
            1,
            rect.width * ratio
        );

    canvas.height =
        Math.max(
            1,
            rect.height * ratio
        );


    const ctx =
        canvas.getContext("2d");


    ctx.setTransform(
        ratio,
        0,
        0,
        ratio,
        0,
        0
    );


    return {
        ctx,
        width: rect.width,
        height: rect.height
    };
}


function drawLineChart(
    canvas,
    values
) {

    if (!canvas) {
        return;
    }


    const {

        ctx,

        width,

        height

    } = prepareCanvas(canvas);


    ctx.clearRect(
        0,
        0,
        width,
        height
    );


    if (
        values.length === 0
    ) {
        return;
    }


    const padding = 35;


    const min =
        Math.min(...values);

    const max =
        Math.max(...values);


    const range =
        max - min || 1;


    ctx.beginPath();


    values.forEach(
        (value, index) => {

            const x =
                padding +
                (
                    width -
                    padding * 2
                ) *
                (
                    index /
                    Math.max(
                        values.length - 1,
                        1
                    )
                );


            const y =
                height -
                padding -
                (
                    (
                        value - min
                    ) /
                    range
                ) *
                (
                    height -
                    padding * 2
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
        "#38bdf8";

    ctx.lineWidth = 2;

    ctx.stroke();


    ctx.fillStyle =
        "#38bdf8";


    values.forEach(
        (value, index) => {

            const x =
                padding +
                (
                    width -
                    padding * 2
                ) *
                (
                    index /
                    Math.max(
                        values.length - 1,
                        1
                    )
                );


            const y =
                height -
                padding -
                (
                    (
                        value - min
                    ) /
                    range
                ) *
                (
                    height -
                    padding * 2
                );


            ctx.beginPath();

            ctx.arc(
                x,
                y,
                3,
                0,
                Math.PI * 2
            );

            ctx.fill();
        }
    );
}


function drawCapitalChart(
    capitalTrades
) {

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


    const sorted =
        [...capitalTrades]
            .sort(
                (a, b) =>
                    new Date(
                        a.recordedAt ||
                        a.date
                    ) -
                    new Date(
                        b.recordedAt ||
                        b.date
                    )
            );


    if (
        !activeCapital ||
        sorted.length === 0
    ) {

        if (empty) {
            empty.style.display =
                "flex";
        }

        prepareCanvas(canvas);

        return;
    }


    if (empty) {
        empty.style.display =
            "none";
    }


    let balance =
        Number(
            activeCapital.initialCapital
        ) || 0;


    const values =
        [balance];


    sorted.forEach(
        trade => {

            balance +=
                Number(
                    trade.pnl
                ) || 0;

            values.push(balance);
        }
    );


    drawLineChart(
        canvas,
        values
    );
}


function drawArchiveChart(
    archive
) {

    const canvas =
        document.getElementById(
            "archiveChart"
        );


    if (!canvas) {
        return;
    }


    let balance =
        Number(
            archive.initialCapital
        ) || 0;


    const values =
        [balance];


    const sorted =
        [...(
            Array.isArray(
                archive.trades
            )
                ? archive.trades
                : []
        )]
        .sort(
            (a, b) =>
                new Date(
                    a.recordedAt ||
                    a.date
                ) -
                new Date(
                    b.recordedAt ||
                    b.date
                )
        );


    sorted.forEach(
        trade => {

            balance +=
                Number(
                    trade.pnl
                ) || 0;

            values.push(balance);
        }
    );


    drawLineChart(
        canvas,
        values
    );
}


/* ============================================================
   ARCHIVES — AFFICHAGE
   ============================================================ */

function renderArchives() {

    const container =
        document.getElementById(
            "archivesList"
        );


    if (!container) {
        return;
    }


    if (archives.length === 0) {

        container.innerHTML = `
            <div class="empty-state">
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


                const profit =
                    calculateProfit(
                        archiveTrades
                    );


                const finalBalance =
                    Number(
                        archive.initialCapital
                    ) +
                    profit;


                return `

                    <article class="archive-card">

                        <div class="archive-card-header">

                            <div>

                                <h3>
                                    ${escapeHtml(
                                        archive.name
                                    )}
                                </h3>

                                <p>
                                    Archivé le
                                    ${escapeHtml(
                                        formatStoredDateTime(
                                            archive.archivedAt
                                        )
                                    )}
                                </p>

                            </div>

                        </div>


                        <div class="archive-stats">

                            <div class="archive-stat">

                                <span>
                                    Capital initial
                                </span>

                                <strong>
                                    ${formatMoney(
                                        archive.initialCapital
                                    )}
                                </strong>

                            </div>


                            <div class="archive-stat">

                                <span>
                                    Capital final
                                </span>

                                <strong class="${
                                    profit >= 0
                                        ? "text-green"
                                        : "text-red"
                                }">
                                    ${formatMoney(
                                        finalBalance
                                    )}
                                </strong>

                            </div>


                            <div class="archive-stat">

                                <span>
                                    Profit
                                </span>

                                <strong class="${
                                    profit >= 0
                                        ? "text-green"
                                        : "text-red"
                                }">
                                    ${formatMoney(
                                        profit
                                    )}
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

                        </div>


                        <div class="archive-actions">

                            <button
                                class="archive-view-btn"
                                type="button"
                                data-view-archive="${
                                    escapeHtml(
                                        archive.id
                                    )
                                }"
                            >
                                Voir
                            </button>

                            <button
                                class="archive-delete-btn"
                                type="button"
                                data-delete-archive="${
                                    escapeHtml(
                                        archive.id
                                    )
                                }"
                            >
                                Supprimer
                            </button>

                        </div>

                    </article>

                `;
            }
        ).join("");
}


/* ============================================================
   NAVIGATION
   ============================================================ */

function showPage(
    pageId
) {

    const pages =
        document.querySelectorAll(
            ".page-section"
        );


    pages.forEach(
        page => {

            page.classList.toggle(
                "active",
                page.id === pageId
            );
        }
    );


    const links =
        document.querySelectorAll(
            ".app-nav-link"
        );


    links.forEach(
        link => {

            link.classList.toggle(
                "active",
                link.dataset.page ===
                pageId
            );
        }
    );


    if (
        pageId ===
        "analysisPage"
    ) {
        renderAnalysis();
    }


    if (
        pageId ===
        "performancePage"
    ) {
        renderPerformance();
    }


    if (
        pageId ===
        "archivesPage"
    ) {
        renderArchives();
    }


    if (
        pageId ===
        "dashboardPage"
    ) {
        renderDashboard();
    }
}


function isAnalysisPage() {

    return (
        document
            .getElementById(
                "analysisPage"
            )
            ?.classList.contains(
                "active"
            ) || false
    );
}


/* ============================================================
   ANALYSE
   ============================================================ */

function renderAnalysis() {

    const filtered =
        filterTradesByPeriod(
            getActiveCapitalTrades(),
            currentAnalysisPeriod
        );


    if (
        typeof displayRiskStats ===
        "function"
    ) {
        displayRiskStats(
            filtered
        );
    }


    if (
        typeof displayRRStats ===
        "function"
    ) {
        displayRRStats(
            filtered
        );
    }


    if (
        typeof renderSetupPerformance ===
        "function"
    ) {
        renderSetupPerformance(
            filtered
        );
    }


    if (
        typeof renderAssetPerformance ===
        "function"
    ) {
        renderAssetPerformance(
            filtered
        );
    }


    if (
        typeof renderSetupRanking ===
        "function"
    ) {
        renderSetupRanking(
            filtered
        );
    }


    if (
        typeof renderRecommendations ===
        "function"
    ) {
        renderRecommendations(
            filtered
        );
    }


    if (
        typeof renderCalendar ===
        "function"
    ) {
        renderCalendar(
            filtered
        );
    }
}


/* ============================================================
   THÈME
   ============================================================ */

function initializeTheme() {

    const saved =
        localStorage.getItem(
            THEME_KEY
        );


    if (
        saved ===
        "light"
    ) {

        document.body.classList.add(
            "light"
        );

    } else {

        document.body.classList.remove(
            "light"
        );
    }


    const button =
        document.getElementById(
            "themeToggle"
        );


    if (!button) {
        return;
    }


    button.textContent =
        document.body.classList.contains(
            "light"
        )
            ? "☀"
            : "◐";
}


function toggleTheme() {

    document.body.classList.toggle(
        "light"
    );


    const light =
        document.body.classList.contains(
            "light"
        );


    localStorage.setItem(
        THEME_KEY,
        light
            ? "light"
            : "dark"
    );


    const button =
        document.getElementById(
            "themeToggle"
        );


    if (button) {
        button.textContent =
            light
                ? "☀"
                : "◐";
    }


    renderAll();
}


/* ============================================================
   PÉRIODE
   ============================================================ */

function updatePeriodButtons() {

    document
        .querySelectorAll(
            "[data-period]"
        )
        .forEach(
            button => {

                button.classList.toggle(
                    "active",
                    button.dataset.period ===
                    currentAnalysisPeriod
                );
            }
        );


    document
        .querySelectorAll(
            "[data-performance-period]"
        )
        .forEach(
            button => {

                button.classList.toggle(
                    "active",
                    button.dataset.performancePeriod ===
                    currentPerformancePeriod
                );
            }
        );
}


/* ============================================================
   OUTILS DOM
   ============================================================ */

function setText(
    id,
    value
) {

    const element =
        document.getElementById(id);


    if (element) {
        element.textContent =
            value;
    }
}


function colorStatValues() {

    document
        .querySelectorAll(
            ".stat-box strong"
        )
        .forEach(
            element => {

                const text =
                    element.textContent;

                element.classList.remove(
                    "positive",
                    "negative"
                );


                if (
                    text.startsWith("$-") ||
                    text.startsWith("-$")
                ) {
                    element.classList.add(
                        "negative"
                    );
                }


                if (
                    text.startsWith("$") &&
                    !text.startsWith("$-")
                ) {
                    element.classList.add(
                        "positive"
                    );
                }
            }
        );
}


/* ============================================================
   ÉVÉNEMENTS
   ============================================================ */

function initializeEvents() {

    document
        .querySelectorAll(
            ".app-nav-link"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () =>
                        showPage(
                            button.dataset.page
                        )
                );
            }
        );


    document
        .getElementById(
            "themeToggle"
        )
        ?.addEventListener(
            "click",
            toggleTheme
        );


    document
        .getElementById(
            "newCapitalBtn"
        )
        ?.addEventListener(
            "click",
            () =>
                openCapitalModal("new")
        );


    document
        .getElementById(
            "changeCapitalBtn"
        )
        ?.addEventListener(
            "click",
            () =>
                activeCapital
                    ? openCapitalModal("edit")
                    : openCapitalModal("new")
        );


    document
        .getElementById(
            "archiveCapitalBtn"
        )
        ?.addEventListener(
            "click",
            archiveCurrentCapital
        );


    document
        .getElementById(
            "capitalForm"
        )
        ?.addEventListener(
            "submit",
            saveCapitalFromForm
        );


    [
        "capitalAmountInput",
        "capitalRiskInput",
        "capitalRRInput"
    ].forEach(
        id => {

            document
                .getElementById(id)
                ?.addEventListener(
                    "input",
                    updateCapitalPreview
                );
        }
    );


    document
        .getElementById(
            "cancelCapitalBtn"
        )
        ?.addEventListener(
            "click",
            closeCapitalModal
        );


    document
        .getElementById(
            "closeCapitalModalBtn"
        )
        ?.addEventListener(
            "click",
            closeCapitalModal
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
            "cancelTradeBtn"
        )
        ?.addEventListener(
            "click",
            closeTradeModal
        );


    document
        .getElementById(
            "closeTradeModalBtn"
        )
        ?.addEventListener(
            "click",
            closeTradeModal
        );


    document
        .getElementById(
            "tradeForm"
        )
        ?.addEventListener(
            "submit",
            saveTrade
        );


    [
        "tradeEntry",
        "tradeSL",
        "tradeDirection"
    ].forEach(
        id => {

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
        }
    );


    document
        .querySelectorAll(
            'input[name="tradeResult"]'
        )
        .forEach(
            radio => {

                radio.addEventListener(
                    "change",
                    updateAutomaticTradeValues
                );
            }
        );


    document
        .querySelectorAll(
            "[data-period]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        currentAnalysisPeriod =
                            button.dataset.period;

                        updatePeriodButtons();

                        renderAnalysis();
                    }
                );
            }
        );


    document
        .querySelectorAll(
            "[data-performance-period]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        currentPerformancePeriod =
                            button.dataset
                                .performancePeriod;

                        updatePeriodButtons();

                        renderPerformance();
                    }
                );
            }
        );


    document.addEventListener(
        "click",
        event => {

            const deleteTradeButton =
                event.target.closest(
                    "[data-delete-trade]"
                );


            if (deleteTradeButton) {

                deleteTrade(
                    deleteTradeButton.dataset
                        .deleteTrade
                );

                return;
            }


            const viewArchiveButton =
                event.target.closest(
                    "[data-view-archive]"
                );


            if (viewArchiveButton) {

                openArchiveChart(
                    viewArchiveButton.dataset
                        .viewArchive
                );

                return;
            }


            const deleteArchiveButton =
                event.target.closest(
                    "[data-delete-archive]"
                );


            if (deleteArchiveButton) {

                deleteArchive(
                    deleteArchiveButton.dataset
                        .deleteArchive
                );
            }
        }
    );


    document
        .getElementById(
            "clearBtn"
        )
        ?.addEventListener(
            "click",
            () => {

                if (
                    getActiveCapitalTrades()
                        .length === 0
                ) {
                    return;
                }


                if (
                    !confirm(
                        "Supprimer tous les trades du capital actif ?"
                    )
                ) {
                    return;
                }


                trades =
                    trades.filter(
                        trade =>
                            trade.capitalId !==
                            activeCapital?.id
                    );


                saveTrades();

                renderAll();
            }
        );


    document
        .getElementById(
            "closeArchiveChartModalBtn"
        )
        ?.addEventListener(
            "click",
            closeArchiveChartModal
        );


    document
        .querySelectorAll(
            ".modal"
        )
        .forEach(
            modal => {

                modal.addEventListener(
                    "click",
                    event => {

                        if (
                            event.target ===
                            modal
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
            }
        );


    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key !==
                "Escape"
            ) {
                return;
            }

            closeTradeModal();
            closeCapitalModal();
            closeArchiveChartModal();
        }
    );


    window.addEventListener(
        "resize",
        () => {

            renderDashboard();

            const visibleArchive =
                document.querySelector(
                    "#archiveChartModal.show"
                );

            if (visibleArchive) {
                /*
                   Le graphique d'archive est
                   redessiné à la prochaine ouverture.
                */
            }
        }
    );
}


/* ============================================================
   INITIALISATION
   ============================================================ */

function renderAll() {

    renderDashboard();

    renderArchives();

    renderPerformance();

    if (isAnalysisPage()) {
        renderAnalysis();
    }

    updatePeriodButtons();
}


function initializeApp() {

    loadData();

    populateTradeForm();

    initializeTheme();

    initializeEvents();

    /*
       Si aucun capital n'existe,
       on garde l'application utilisable
       sans ouvrir automatiquement la modal.
    */

    renderAll();
}


document.addEventListener(
    "DOMContentLoaded",
    initializeApp
);
