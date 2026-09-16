/* ============================================================
   ARCH TRADING PLAN — APP.JS
   Moteur principal
   ============================================================ */

"use strict";

/* ============================================================
   CONFIGURATION
   ============================================================ */

const STORAGE_KEYS = {
    trades: "tradingTrades",
    activeCapital: "tradingActiveCapital",
    archives: "tradingCapitalArchives",
    theme: "tradingDashboardTheme"
};

const MIN_RR = 2.00;
const MIN_LOT = 0.01;
const LOT_STEP = 0.01;
const RISK_TOLERANCE = 0.10;

const ACCOUNT_CURRENCY = "USD";

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

let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();

let currentAnalysisTrades = [];
let capitalChartInstance = null;
let archiveChartInstance = null;


/* ============================================================
   UTILITAIRES
   ============================================================ */

function $(id) {
    return document.getElementById(id);
}

function escapeValue(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function round(value, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function roundToStep(value, step = LOT_STEP) {
    if (!Number.isFinite(Number(value))) return 0;

    return Math.floor(
        (Number(value) + Number.EPSILON) / step
    ) * step;
}

function formatMoney(value) {
    const number = Number(value) || 0;

    return new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(number) + " $";
}

function formatNumber(value, decimals = 2) {
    const number = Number(value);

    if (!Number.isFinite(number)) return "—";

    return new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(number);
}

function formatPercent(value, decimals = 1) {
    const number = Number(value);

    if (!Number.isFinite(number)) return "—";

    return number.toFixed(decimals) + " %";
}

function getTodayDate() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getNowISO() {
    return new Date().toISOString();
}

function isFiniteNumber(value) {
    return Number.isFinite(Number(value));
}


/* ============================================================
   STOCKAGE LOCAL
   ============================================================ */

function loadTrades() {
    try {
        const data = JSON.parse(
            localStorage.getItem(STORAGE_KEYS.trades) || "[]"
        );

        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Erreur chargement trades :", error);
        return [];
    }
}

function saveTrades(trades) {
    localStorage.setItem(
        STORAGE_KEYS.trades,
        JSON.stringify(trades)
    );
}

function loadActiveCapital() {
    try {
        return JSON.parse(
            localStorage.getItem(STORAGE_KEYS.activeCapital) || "null"
        );
    } catch (error) {
        console.error("Erreur capital actif :", error);
        return null;
    }
}

function saveActiveCapital(capital) {
    localStorage.setItem(
        STORAGE_KEYS.activeCapital,
        JSON.stringify(capital)
    );
}

function loadArchives() {
    try {
        const data = JSON.parse(
            localStorage.getItem(STORAGE_KEYS.archives) || "[]"
        );

        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Erreur archives :", error);
        return [];
    }
}

function saveArchives(archives) {
    localStorage.setItem(
        STORAGE_KEYS.archives,
        JSON.stringify(archives)
    );
}


/* ============================================================
   MOTEUR DES SYMBOLES
   ============================================================ */

/*
    Important :

    Forex classique :
        1 pip = 0.0001

    JPY :
        1 pip = 0.01

    XAUUSD :
        contrat standard = 100 oz
        mouvement de prix = directement en USD

    BTCUSD :
        contrat simplifié pour le journal :
        1 unité de BTC par 1 lot

    Le moteur pourra être adapté si le broker utilise
    une taille de contrat différente.
*/

function getSymbolSpecs(asset) {

    const symbol = String(asset || "").toUpperCase();

    if (symbol === "XAUUSD") {
        return {
            type: "gold",
            pipSize: 0.01,
            contractSize: 100,
            quoteCurrency: "USD"
        };
    }

    if (symbol === "BTCUSD") {
        return {
            type: "crypto",
            pipSize: 0.01,
            contractSize: 1,
            quoteCurrency: "USD"
        };
    }

    if (symbol.endsWith("/JPY") || symbol === "USDJPY") {
        return {
            type: "forex-jpy",
            pipSize: 0.01,
            contractSize: 100000,
            quoteCurrency: "JPY"
        };
    }

    return {
        type: "forex",
        pipSize: 0.0001,
        contractSize: 100000,
        quoteCurrency: "USD"
    };
}


/* ============================================================
   DIRECTION
   ============================================================ */

function getDirectionMultiplier(direction) {
    return String(direction).toUpperCase() === "SELL"
        ? -1
        : 1;
}


/* ============================================================
   DISTANCE SL
   ============================================================ */

function getTradeRiskDistance(trade) {

    const entry = Number(trade.entry);
    const sl = Number(trade.sl);

    if (!Number.isFinite(entry) || !Number.isFinite(sl)) {
        return null;
    }

    return Math.abs(entry - sl);
}


/* ============================================================
   PIPS
   ============================================================ */

function calculatePipsFromDistance(distance, asset) {

    const specs = getSymbolSpecs(asset);

    if (!Number.isFinite(Number(distance)) || distance < 0) {
        return null;
    }

    return Number(distance) / specs.pipSize;
}

function calculatePips(entry, exit, asset) {

    const e = Number(entry);
    const x = Number(exit);

    if (!Number.isFinite(e) || !Number.isFinite(x)) {
        return null;
    }

    return calculatePipsFromDistance(
        Math.abs(e - x),
        asset
    );
}


/* ============================================================
   TAUX DE CONVERSION POUR LES PAIRES JPY
   ============================================================ */

/*
    Pour USDJPY avec compte USD :

    pipValue = (pipSize / USDJPY) × contractSize

    Exemple :
    USDJPY = 150
    pipSize = 0.01
    contract = 100000

    = (0.01 / 150) × 100000
    = 6.6667 USD/pip/lot
*/

function getConversionRateForPip(asset, entryPrice) {

    const symbol = String(asset || "").toUpperCase();

    /*
        USDJPY :
        le prix lui-même est USDJPY.
    */
    if (symbol === "USD/JPY" || symbol === "USDJPY") {
        return Number(entryPrice);
    }

    /*
        Pour les futures paires JPY comme EURJPY ou GBPJPY,
        le calcul exact en USD nécessite le taux de conversion
        de la devise de base vers USD.

        Pour notre liste actuelle, USDJPY est la seule paire JPY.
    */

    return Number(entryPrice);
}


/* ============================================================
   VALEUR DU PIP
   ============================================================ */

function calculatePipValuePerLot(asset, price) {

    const specs = getSymbolSpecs(asset);

    const currentPrice = Number(price);

    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        return null;
    }

    /*
        FOREX CLASSIQUE

        Pour les paires où la devise cotée est USD :

        1 pip × 100000 unités
        = 10 USD
    */

    if (specs.type === "forex") {

        return specs.pipSize * specs.contractSize;
    }

    /*
        USDJPY

        Valeur pip en USD :
        pipSize / USDJPY × contractSize
    */

    if (specs.type === "forex-jpy") {

        const conversionRate =
            getConversionRateForPip(asset, currentPrice);

        if (
            !Number.isFinite(conversionRate) ||
            conversionRate <= 0
        ) {
            return null;
        }

        return (
            specs.pipSize *
            specs.contractSize /
            conversionRate
        );
    }

    /*
        XAUUSD

        0.01 USD × 100 oz
        = 1 USD par pip à 1 lot
    */

    if (specs.type === "gold") {

        return specs.pipSize * specs.contractSize;
    }

    /*
        BTCUSD

        0.01 × 1 unité
        = 0.01 USD par "pip" à 1 lot
    */

    if (specs.type === "crypto") {

        return specs.pipSize * specs.contractSize;
    }

    return null;
}


/* ============================================================
   PERTE AU SL POUR 1 LOT
   ============================================================ */

function calculateLossAtSLForOneLot(
    asset,
    entry,
    sl
) {

    const distance = Math.abs(
        Number(entry) - Number(sl)
    );

    if (!Number.isFinite(distance)) {
        return null;
    }

    const specs = getSymbolSpecs(asset);

    /*
        XAUUSD :

        distance × lot × contractSize
    */

    if (specs.type === "gold") {

        return distance * specs.contractSize;
    }

    /*
        BTCUSD
    */

    if (specs.type === "crypto") {

        return distance * specs.contractSize;
    }

    /*
        FOREX :

        distance en pips × valeur pip
    */

    const pips = calculatePipsFromDistance(
        distance,
        asset
    );

    const pipValue = calculatePipValuePerLot(
        asset,
        entry
    );

    if (
        !Number.isFinite(pips) ||
        !Number.isFinite(pipValue)
    ) {
        return null;
    }

    return pips * pipValue;
}


/* ============================================================
   RISQUE EN ARGENT
   ============================================================ */

function calculateRiskMoney(capital, riskPercent) {

    const c = Number(capital);
    const r = Number(riskPercent);

    if (
        !Number.isFinite(c) ||
        !Number.isFinite(r) ||
        c <= 0 ||
        r < 0
    ) {
        return 0;
    }

    return c * (r / 100);
}


/* ============================================================
   LOT AUTOMATIQUE
   ============================================================ */

function calculateLotFromRisk(
    capital,
    riskPercent,
    asset,
    entry,
    sl
) {

    const riskMoney = calculateRiskMoney(
        capital,
        riskPercent
    );

    if (riskMoney <= 0) {
        return 0;
    }

    const lossAtSLForOneLot =
        calculateLossAtSLForOneLot(
            asset,
            entry,
            sl
        );

    if (
        !Number.isFinite(lossAtSLForOneLot) ||
        lossAtSLForOneLot <= 0
    ) {
        return 0;
    }

    /*
        FORMULE CENTRALE :

        Lot =
        Risque autorisé /
        Perte au SL pour 1 lot
    */

    let lot =
        riskMoney /
        lossAtSLForOneLot;

    /*
        Respect du pas de lot.
    */

    lot = roundToStep(
        lot,
        LOT_STEP
    );

    /*
        Ne jamais dépasser le risque demandé.
        On ne force donc pas 0.01 si le risque est
        inférieur à ce que représente 0.01 lot.
    */

    if (lot < MIN_LOT) {
        return 0;
    }

    return round(lot, 2);
}


/* ============================================================
   TP SELON LE RR
   ============================================================ */

function calculateTP(
    entry,
    sl,
    direction,
    rr
) {

    const e = Number(entry);
    const s = Number(sl);
    const targetRR = Number(rr);

    if (
        !Number.isFinite(e) ||
        !Number.isFinite(s) ||
        !Number.isFinite(targetRR) ||
        targetRR <= 0
    ) {
        return null;
    }

    const riskDistance = Math.abs(e - s);

    if (riskDistance <= 0) {
        return null;
    }

    const multiplier =
        getDirectionMultiplier(direction);

    /*
        BUY :
        TP = Entry + distance SL × RR

        SELL :
        TP = Entry - distance SL × RR
    */

    return e +
        (
            riskDistance *
            targetRR *
            multiplier
        );
}


/* ============================================================
   RR RÉEL D'UN TRADE
   ============================================================ */

function getTradeTargetRR(trade) {

    const entry = Number(trade.entry);
    const sl = Number(trade.sl);
    const tp = Number(trade.tp);

    if (
        !Number.isFinite(entry) ||
        !Number.isFinite(sl) ||
        !Number.isFinite(tp)
    ) {
        return null;
    }

    const riskDistance =
        Math.abs(entry - sl);

    const rewardDistance =
        Math.abs(tp - entry);

    if (riskDistance <= 0) {
        return null;
    }

    return rewardDistance / riskDistance;
}


/* ============================================================
   P/L
   ============================================================ */

function calculateTradeProfit(
    asset,
    direction,
    entry,
    exit,
    lot
) {

    const e = Number(entry);
    const x = Number(exit);
    const l = Number(lot);

    if (
        !Number.isFinite(e) ||
        !Number.isFinite(x) ||
        !Number.isFinite(l) ||
        l <= 0
    ) {
        return null;
    }

    const specs = getSymbolSpecs(asset);

    const multiplier =
        getDirectionMultiplier(direction);

    const priceMovement =
        (x - e) * multiplier;

    /*
        XAUUSD :

        P/L =
        mouvement prix × lot × 100
    */

    if (specs.type === "gold") {

        return (
            priceMovement *
            l *
            specs.contractSize
        );
    }

    /*
        BTCUSD
    */

    if (specs.type === "crypto") {

        return (
            priceMovement *
            l *
            specs.contractSize
        );
    }

    /*
        FOREX :

        mouvement en pips × valeur pip × lot
    */

    const pips =
        priceMovement /
        specs.pipSize;

    const pipValue =
        calculatePipValuePerLot(
            asset,
            e
        );

    if (!Number.isFinite(pipValue)) {
        return null;
    }

    return (
        pips *
        pipValue *
        l
    );
}


/* ============================================================
   CAPITAL ASSOCIÉ AU TRADE
   ============================================================ */

function getCapitalForTrade(trade) {

    if (
        trade &&
        Number.isFinite(Number(trade.capitalAtTrade))
    ) {
        return Number(trade.capitalAtTrade);
    }

    const capital = loadActiveCapital();

    if (!capital) {
        return 0;
    }

    return Number(capital.currentBalance) ||
        Number(capital.initialCapital) ||
        0;
}


/* ============================================================
   RÉSULTAT D'UN TRADE
   ============================================================ */

function normalizeTradeResult(result) {

    const value = String(result || "")
        .trim()
        .toUpperCase();

    if (
        value === "WIN" ||
        value === "TP" ||
        value === "GAGNANT"
    ) {
        return "WIN";
    }

    if (
        value === "LOSS" ||
        value === "SL" ||
        value === "PERDANT"
    ) {
        return "LOSS";
    }

    if (
        value === "BE" ||
        value === "BREAK EVEN"
    ) {
        return "BE";
    }

    return value;
}


/* ============================================================
   CALCUL DU TRADE COMPLET
   ============================================================ */

function calculateTradeData(data) {

    const asset = data.asset;
    const direction = data.direction;
    const entry = Number(data.entry);
    const sl = Number(data.sl);
    const rr = Number(data.rr);

    const capital = Number(
        data.capital ||
        data.capitalAtTrade ||
        0
    );

    const riskPercent = Number(
        data.riskPercent ||
        0
    );

    const lot = calculateLotFromRisk(
        capital,
        riskPercent,
        asset,
        entry,
        sl
    );

    const tp = calculateTP(
        entry,
        sl,
        direction,
        rr
    );

    const riskMoney =
        calculateRiskMoney(
            capital,
            riskPercent
        );

    let potentialProfit = null;

    if (
        Number.isFinite(tp) &&
        lot > 0
    ) {

        potentialProfit =
            calculateTradeProfit(
                asset,
                direction,
                entry,
                tp,
                lot
            );
    }

    return {
        lot,
        tp,
        riskMoney,
        potentialProfit
    };
}


/* ============================================================
   CAPITAL ACTIF
   ============================================================ */

function getCurrentBalance() {

    const capital = loadActiveCapital();

    if (!capital) {
        return 0;
    }

    return Number(
        capital.currentBalance ??
        capital.initialCapital ??
        0
    );
}

function getInitialCapital() {

    const capital = loadActiveCapital();

    if (!capital) {
        return 0;
    }

    return Number(
        capital.initialCapital || 0
    );
}

function getCapitalRiskPercent() {

    const capital = loadActiveCapital();

    if (!capital) {
        return 0;
    }

    return Number(
        capital.riskPercent || 0
    );
}

function getCapitalRR() {

    const capital = loadActiveCapital();

    if (!capital) {
        return MIN_RR;
    }

    return Number(
        capital.rrTarget || MIN_RR
    );
}


/* ============================================================
   MODAL CAPITAL
   ============================================================ */

function openCapitalModal(mode = "new") {

    const modal = $("capitalModal");

    if (!modal) return;

    const capital = loadActiveCapital();

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");

    const nameInput = $("capitalNameInput");
    const amountInput = $("capitalAmountInput");
    const riskInput = $("capitalRiskInput");
    const rrInput = $("capitalRRInput");

    if (mode === "edit" && capital) {

        if (nameInput) {
            nameInput.value =
                capital.name || "";
        }

        if (amountInput) {
            amountInput.value =
                capital.initialCapital || "";
        }

        if (riskInput) {
            riskInput.value =
                capital.riskPercent || 1;
        }

        if (rrInput) {
            rrInput.value =
                capital.rrTarget || MIN_RR;
        }

    } else {

        if (nameInput) {
            nameInput.value = "";
        }

        if (amountInput) {
            amountInput.value = "";
        }

        if (riskInput) {
            riskInput.value = 1;
        }

        if (rrInput) {
            rrInput.value = MIN_RR;
        }
    }

    updateCapitalModalPreview();
}

function closeCapitalModal() {

    const modal = $("capitalModal");

    if (!modal) return;

    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
}

function updateCapitalModalPreview() {

    const amount =
        Number($("capitalAmountInput")?.value || 0);

    const risk =
        Number($("capitalRiskInput")?.value || 0);

    const rr =
        Number($("capitalRRInput")?.value || MIN_RR);

    const riskMoney =
        calculateRiskMoney(
            amount,
            risk
        );

    const objective =
        riskMoney * rr;

    if ($("capitalModalRiskPreview")) {
        $("capitalModalRiskPreview").textContent =
            formatMoney(riskMoney);
    }

    if ($("capitalModalRR")) {
        $("capitalModalRR").textContent =
            rr.toFixed(2);
    }

    if ($("capitalModalObjective")) {
        $("capitalModalObjective").textContent =
            formatMoney(objective);
    }
}

function saveCapitalFromModal() {

    const name =
        $("capitalNameInput")?.value.trim() ||
        "Capital principal";

    const amount =
        Number($("capitalAmountInput")?.value || 0);

    const riskPercent =
        Number($("capitalRiskInput")?.value || 0);

    const rrTarget =
        Number($("capitalRRInput")?.value || MIN_RR);

    if (amount <= 0) {
        alert("Veuillez entrer un capital valide.");
        return;
    }

    if (riskPercent <= 0) {
        alert("Veuillez entrer un risque valide.");
        return;
    }

    if (rrTarget < MIN_RR) {
        alert(
            `Le RR minimum autorisé est ${MIN_RR.toFixed(2)}.`
        );
        return;
    }

    const oldCapital = loadActiveCapital();

    const capital = {
        id: oldCapital?.id ||
            `capital_${Date.now()}`,

        name,

        initialCapital:
            oldCapital?.initialCapital ??
            amount,

        currentBalance:
            oldCapital?.currentBalance ??
            amount,

        riskPercent,

        rrTarget,

        createdAt:
            oldCapital?.createdAt ||
            getNowISO(),

        updatedAt:
            getNowISO()
    };

    saveActiveCapital(capital);

    closeCapitalModal();

    renderAll();
}


/* ============================================================
   ARCHIVAGE DU CAPITAL
   ============================================================ */

function archiveActiveCapital() {

    const capital = loadActiveCapital();

    if (!capital) {
        alert("Aucun capital actif à archiver.");
        return;
    }

    const confirmation = confirm(
        `Archiver le capital "${capital.name}" ?`
    );

    if (!confirmation) return;

    const trades = loadTrades();

    const capitalTrades =
        trades.filter(
            trade =>
                trade.capitalId === capital.id
        );

    const archive = {
        ...capital,

        archivedAt: getNowISO(),

        trades: capitalTrades,

        finalBalance:
            Number(capital.currentBalance || 0),

        profit:
            Number(capital.currentBalance || 0) -
            Number(capital.initialCapital || 0)
    };

    const archives = loadArchives();

    archives.unshift(archive);

    saveArchives(archives);

    localStorage.removeItem(
        STORAGE_KEYS.activeCapital
    );

    renderAll();
}

function deleteArchive(index) {

    const archives = loadArchives();

    if (!archives[index]) return;

    if (!confirm("Supprimer cette archive ?")) {
        return;
    }

    archives.splice(index, 1);

    saveArchives(archives);

    renderArchives();
}


/* ============================================================
   TRADE MODAL
   ============================================================ */

function openTradeModal() {

    const modal = $("tradeModal");

    if (!modal) return;

    if (!loadActiveCapital()) {
        alert(
            "Créez d'abord un capital actif avant d'ajouter un trade."
        );
        return;
    }

    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");

    document.body.classList.add(
        "trade-modal-open"
    );

    if ($("tradeDate")) {
        $("tradeDate").value = getTodayDate();
    }

    updateAutomaticTradeValues();

    setTimeout(() => {
        $("tradeAsset")?.focus();
    }, 50);
}

function closeTradeModal() {

    const modal = $("tradeModal");

    if (!modal) return;

    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");

    document.body.classList.remove(
        "trade-modal-open"
    );
}


/* ============================================================
   CALCULS AUTOMATIQUES DU FORMULAIRE TRADE
   ============================================================ */

function updateAutomaticTradeValues() {

    const capital = loadActiveCapital();

    if (!capital) return;

    const asset =
        $("tradeAsset")?.value || "";

    const direction =
        $("tradeDirection")?.value || "BUY";

    const entry =
        Number($("tradeEntry")?.value || 0);

    const sl =
        Number($("tradeSL")?.value || 0);

    const rr =
        Number(
            $("tradeRR")?.value ||
            capital.rrTarget ||
            MIN_RR
        );

    if (
        !asset ||
        !entry ||
        !sl ||
        entry === sl
    ) {
        if ($("tradeLot")) {
            $("tradeLot").value = "";
        }

        if ($("tradeTP")) {
            $("tradeTP").value = "";
        }

        if ($("calculatedRR")) {
            $("calculatedRR").value = "";
        }

        return;
    }

    const calculated =
        calculateTradeData({
            asset,
            direction,
            entry,
            sl,
            rr,

            capital:
                capital.currentBalance ||
                capital.initialCapital,

            riskPercent:
                capital.riskPercent
        });

    if ($("tradeLot")) {

        $("tradeLot").value =
            calculated.lot > 0
                ? calculated.lot.toFixed(2)
                : "";
    }

    if ($("tradeTP")) {

        $("tradeTP").value =
            Number.isFinite(calculated.tp)
                ? calculated.tp.toFixed(
                    asset === "XAUUSD"
                        ? 2
                        : 5
                )
                : "";
    }

    if ($("calculatedRR")) {

        $("calculatedRR").value =
            Number.isFinite(calculated.tp)
                ? rr.toFixed(2)
                : "";
    }

    if ($("tradeMMInfo")) {

        const loss =
            calculated.riskMoney;

        const profit =
            calculated.potentialProfit;

        $("tradeMMInfo").textContent =
            `Risque : ${formatMoney(loss)} | ` +
            `Gain potentiel : ${formatMoney(profit)}`;
    }

    if ($("tradeProfit")) {

        $("tradeProfit").value =
            Number.isFinite(calculated.potentialProfit)
                ? calculated.potentialProfit.toFixed(2)
                : "";
    }
}


/* ============================================================
   ENREGISTRER UN TRADE
   ============================================================ */

function submitTrade(event) {

    if (event) {
        event.preventDefault();
    }

    const capital = loadActiveCapital();

    if (!capital) {
        alert("Aucun capital actif.");
        return;
    }

    const asset =
        $("tradeAsset")?.value || "";

    const date =
        $("tradeDate")?.value ||
        getTodayDate();

    const direction =
        $("tradeDirection")?.value ||
        "BUY";

    const orderType =
        $("tradeOrderType")?.value ||
        "Market";

    const entry =
        Number($("tradeEntry")?.value || 0);

    const sl =
        Number($("tradeSL")?.value || 0);

    const rr =
        Number(
            $("tradeRR")?.value ||
            capital.rrTarget ||
            MIN_RR
        );

    const setup =
        $("tradeSetup")?.value ||
        "";

    const result =
        normalizeTradeResult(
            $("tradeResult")?.value ||
            "BE"
        );

    const comment =
        $("tradeComment")?.value ||
        "";

    if (!asset) {
        alert("Sélectionnez un actif.");
        return;
    }

    if (
        !Number.isFinite(entry) ||
        entry <= 0
    ) {
        alert("Prix d'entrée invalide.");
        return;
    }

    if (
        !Number.isFinite(sl) ||
        sl <= 0 ||
        sl === entry
    ) {
        alert("Stop Loss invalide.");
        return;
    }

    if (rr < MIN_RR) {
        alert(
            `Le RR minimum est ${MIN_RR.toFixed(2)}.`
        );
        return;
    }

    const calculated =
        calculateTradeData({
            asset,
            direction,
            entry,
            sl,
            rr,

            capital:
                capital.currentBalance ||
                capital.initialCapital,

            riskPercent:
                capital.riskPercent
        });

    if (calculated.lot < MIN_LOT) {

        alert(
            "Le risque demandé produit un lot inférieur au minimum de 0.01."
        );

        return;
    }

    const trades = loadTrades();

    const trade = {

        id:
            `trade_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}`,

        capitalId:
            capital.id,

        capitalAtTrade:
            Number(
                capital.currentBalance ||
                capital.initialCapital
            ),

        riskPercent:
            Number(capital.riskPercent),

        asset,

        date,

        recordedAt:
            getNowISO(),

        direction,

        orderType,

        entry,

        sl,

        tp:
            calculated.tp,

        rr,

        lot:
            calculated.lot,

        setup,

        result,

        comment,

        riskMoney:
            calculated.riskMoney,

        profit:
            0,

        pips:
            0
    };

    /*
        Le P/L est calculé selon le résultat.
    */

    let exit = null;

    if (result === "WIN") {
        exit = calculated.tp;
    }

    if (result === "LOSS") {
        exit = sl;
    }

    if (result === "BE") {
        exit = entry;
    }

    if (Number.isFinite(exit)) {

        trade.profit =
            calculateTradeProfit(
                asset,
                direction,
                entry,
                exit,
                calculated.lot
            ) || 0;

        trade.pips =
            calculatePips(
                entry,
                exit,
                asset
            ) || 0;
    }

    trades.push(trade);

    saveTrades(trades);

    /*
        Mise à jour du capital.
    */

    capital.currentBalance =
        Number(
            capital.currentBalance ||
            capital.initialCapital
        ) +
        Number(trade.profit || 0);

    capital.updatedAt =
        getNowISO();

    saveActiveCapital(capital);

    closeTradeModal();

    $("tradeForm")?.reset();

    renderAll();
}


/* ============================================================
   SUPPRESSION D'UN TRADE
   ============================================================ */

function deleteTrade(tradeId) {

    const trades = loadTrades();

    const index =
        trades.findIndex(
            trade =>
                trade.id === tradeId
        );

    if (index === -1) return;

    if (!confirm("Supprimer ce trade ?")) {
        return;
    }

    const trade = trades[index];

    trades.splice(index, 1);

    saveTrades(trades);

    const capital = loadActiveCapital();

    if (
        capital &&
        trade.capitalId === capital.id
    ) {

        capital.currentBalance =
            Number(capital.currentBalance) -
            Number(trade.profit || 0);

        saveActiveCapital(capital);
    }

    renderAll();
}


/* ============================================================
   STATISTIQUES AVANCÉES
   ============================================================ */

function calculateAdvancedStats(trades) {

    const list =
        Array.isArray(trades)
            ? trades
            : [];

    const profits =
        list.map(
            trade =>
                Number(trade.profit || 0)
        );

    const wins =
        list.filter(
            trade =>
                normalizeTradeResult(
                    trade.result
                ) === "WIN"
        );

    const losses =
        list.filter(
            trade =>
                normalizeTradeResult(
                    trade.result
                ) === "LOSS"
        );

    const breakevens =
        list.filter(
            trade =>
                normalizeTradeResult(
                    trade.result
                ) === "BE"
        );

    const totalProfit =
        profits.reduce(
            (sum, value) =>
                sum + value,
            0
        );

    const winrate =
        list.length
            ? wins.length / list.length * 100
            : 0;

    const averageTrade =
        list.length
            ? totalProfit / list.length
            : 0;

    const winningProfits =
        wins.map(
            trade =>
                Number(trade.profit || 0)
        );

    const losingProfits =
        losses.map(
            trade =>
                Number(trade.profit || 0)
        );

    const averageWin =
        winningProfits.length
            ? winningProfits.reduce(
                (a, b) => a + b,
                0
            ) / winningProfits.length
            : 0;

    const averageLoss =
        losingProfits.length
            ? losingProfits.reduce(
                (a, b) => a + b,
                0
            ) / losingProfits.length
            : 0;

    const grossProfit =
        winningProfits.reduce(
            (a, b) => a + b,
            0
        );

    const grossLoss =
        Math.abs(
            losingProfits.reduce(
                (a, b) => a + b,
                0
            )
        );

    const profitFactor =
        grossLoss > 0
            ? grossProfit / grossLoss
            : grossProfit > 0
                ? Infinity
                : 0;

    let maxWinStreak = 0;
    let maxLossStreak = 0;

    let currentWinStreak = 0;
    let currentLossStreak = 0;

    list.forEach(trade => {

        const result =
            normalizeTradeResult(
                trade.result
            );

        if (result === "WIN") {

            currentWinStreak++;
            currentLossStreak = 0;

            maxWinStreak =
                Math.max(
                    maxWinStreak,
                    currentWinStreak
                );

        } else if (result === "LOSS") {

            currentLossStreak++;
            currentWinStreak = 0;

            maxLossStreak =
                Math.max(
                    maxLossStreak,
                    currentLossStreak
                );

        }
    });

    /*
        Drawdown sur la courbe cumulée.
    */

    let balance = 0;
    let peak = 0;
    let maxDrawdown = 0;

    list.forEach(trade => {

        balance +=
            Number(trade.profit || 0);

        peak =
            Math.max(
                peak,
                balance
            );

        const drawdown =
            balance - peak;

        maxDrawdown =
            Math.min(
                maxDrawdown,
                drawdown
            );
    });

    const averageRRValues =
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
        averageRRValues.length
            ? averageRRValues.reduce(
                (a, b) => a + b,
                0
            ) /
            averageRRValues.length
            : 0;

    const bestTrade =
        profits.length
            ? Math.max(...profits)
            : 0;

    const worstTrade =
        profits.length
            ? Math.min(...profits)
            : 0;

    return {

        trades: list.length,

        wins: wins.length,

        losses: losses.length,

        breakevens:
            breakevens.length,

        totalProfit,

        winrate,

        averageTrade,

        averageWin,

        averageLoss,

        grossProfit,

        grossLoss,

        profitFactor,

        maxWinStreak,

        maxLossStreak,

        maxDrawdown,

        averageRR,

        bestTrade,

        worstTrade
    };
}


/* ============================================================
   STATISTIQUES RISQUE — V51
   ============================================================ */

function calculateRiskStats(trades) {

    const list =
        Array.isArray(trades)
            ? trades
            : [];

    const risks =
        list
            .map(
                trade =>
                    Number(
                        trade.riskPercent
                    )
            )
            .filter(
                value =>
                    Number.isFinite(value)
            );

    if (!risks.length) {

        return {
            averageRisk: 0,
            minimumRisk: 0,
            maximumRisk: 0,
            referenceRisk:
                getCapitalRiskPercent(),
            averageDeviation: 0,
            regularity: 0,
            compliantTrades: 0,
            nonCompliantTrades: 0
        };
    }

    const referenceRisk =
        getCapitalRiskPercent();

    const averageRisk =
        risks.reduce(
            (a, b) => a + b,
            0
        ) / risks.length;

    const minimumRisk =
        Math.min(...risks);

    const maximumRisk =
        Math.max(...risks);

    const deviations =
        risks.map(
            risk =>
                Math.abs(
                    risk - referenceRisk
                )
        );

    const averageDeviation =
        deviations.reduce(
            (a, b) => a + b,
            0
        ) / deviations.length;

    const tolerance =
        referenceRisk *
        RISK_TOLERANCE;

    const compliantTrades =
        risks.filter(
            risk =>
                Math.abs(
                    risk - referenceRisk
                ) <= tolerance
        ).length;

    const nonCompliantTrades =
        risks.length -
        compliantTrades;

    const regularity =
        risks.length
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

        regularity,

        compliantTrades,

        nonCompliantTrades
    };
}


/* ============================================================
   SETUPS
   ============================================================ */

function buildSetupStats(trades) {

    const stats = {};

    trades.forEach(trade => {

        const setup =
            trade.setup ||
            "Sans setup";

        if (!stats[setup]) {

            stats[setup] = {

                setup,

                trades: 0,

                wins: 0,

                losses: 0,

                breakevens: 0,

                profit: 0
            };
        }

        const item =
            stats[setup];

        item.trades++;

        const result =
            normalizeTradeResult(
                trade.result
            );

        if (result === "WIN") {
            item.wins++;
        }

        if (result === "LOSS") {
            item.losses++;
        }

        if (result === "BE") {
            item.breakevens++;
        }

        item.profit +=
            Number(trade.profit || 0);
    });

    return Object.values(stats)
        .sort(
            (a, b) =>
                b.profit - a.profit
        );
}


/* ============================================================
   ACTIFS
   ============================================================ */

function buildAssetStats(trades) {

    const stats = {};

    trades.forEach(trade => {

        const asset =
            trade.asset ||
            "Sans actif";

        if (!stats[asset]) {

            stats[asset] = {

                asset,

                trades: 0,

                wins: 0,

                losses: 0,

                breakevens: 0,

                profit: 0
            };
        }

        const item =
            stats[asset];

        item.trades++;

        const result =
            normalizeTradeResult(
                trade.result
            );

        if (result === "WIN") {
            item.wins++;
        }

        if (result === "LOSS") {
            item.losses++;
        }

        if (result === "BE") {
            item.breakevens++;
        }

        item.profit +=
            Number(trade.profit || 0);
    });

    return Object.values(stats)
        .sort(
            (a, b) =>
                b.profit - a.profit
        );
}


/* ============================================================
   SETUP RANKING — V51
   ============================================================ */

function calculateSetupRanking(trades) {

    return buildSetupStats(trades)
        .map(item => ({

            setup:
                item.setup,

            trades:
                item.trades,

            winrate:
                item.trades
                    ? item.wins /
                        item.trades *
                        100
                    : 0,

            profit:
                item.profit
        }))
        .sort(
            (a, b) => {

                if (
                    b.profit !==
                    a.profit
                ) {
                    return (
                        b.profit -
                        a.profit
                    );
                }

                return (
                    b.winrate -
                    a.winrate
                );
            }
        );
}


/* ============================================================
   PÉRIODE
   ============================================================ */

function getDateObject(dateValue) {

    if (!dateValue) {
        return null;
    }

    const date =
        new Date(
            `${dateValue}T00:00:00`
        );

    return Number.isNaN(
        date.getTime()
    )
        ? null
        : date;
}

function filterTradesByPeriod(
    trades,
    period
) {

    const list =
        Array.isArray(trades)
            ? trades
            : [];

    if (
        !period ||
        period === "all"
    ) {
        return list;
    }

    const now = new Date();

    return list.filter(trade => {

        const date =
            getDateObject(
                trade.date
            );

        if (!date) return false;

        if (period === "today") {

            return (
                date.getFullYear() ===
                    now.getFullYear() &&

                date.getMonth() ===
                    now.getMonth() &&

                date.getDate() ===
                    now.getDate()
            );
        }

        if (period === "week") {

            const start =
                new Date(now);

            start.setDate(
                now.getDate() -
                ((now.getDay() + 6) % 7)
            );

            start.setHours(
                0, 0, 0, 0
            );

            return date >= start;
        }

        if (period === "month") {

            return (
                date.getFullYear() ===
                    now.getFullYear() &&

                date.getMonth() ===
                    now.getMonth()
            );
        }

        if (period === "year") {

            return (
                date.getFullYear() ===
                now.getFullYear()
            );
        }

        return true;
    });
}


/* ============================================================
   NAVIGATION 4 PAGES
   ============================================================ */

function isAnalysisPage() {

    const page =
        document.querySelector(
            ".page-section.active"
        );

    return Boolean(
        page &&
        page.id === "pageAnalysis"
    );
}

function showPage(pageName) {

    const pages =
        document.querySelectorAll(
            ".page-section"
        );

    pages.forEach(page => {

        page.classList.toggle(
            "active",
            page.id ===
                `page${
                    pageName.charAt(0)
                        .toUpperCase() +
                    pageName.slice(1)
                }`
        );
    });

    const navLinks =
        document.querySelectorAll(
            "[data-page]"
        );

    navLinks.forEach(link => {

        link.classList.toggle(
            "active",
            link.dataset.page ===
                pageName
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

    document
        .querySelectorAll("[data-page]")
        .forEach(link => {

            link.addEventListener(
                "click",
                event => {

                    event.preventDefault();

                    showPage(
                        link.dataset.page
                    );
                }
            );
        });
}


/* ============================================================
   THÈME
   ============================================================ */

function initializeTheme() {

    const savedTheme =
        localStorage.getItem(
            STORAGE_KEYS.theme
        ) || "dark";

    document.documentElement
        .setAttribute(
            "data-theme",
            savedTheme
        );

    const button =
        $("themeToggle");

    if (!button) return;

    button.addEventListener(
        "click",
        () => {

            const current =
                document.documentElement
                    .getAttribute(
                        "data-theme"
                    );

            const next =
                current === "dark"
                    ? "light"
                    : "dark";

            document.documentElement
                .setAttribute(
                    "data-theme",
                    next
                );

            localStorage.setItem(
                STORAGE_KEYS.theme,
                next
            );
        }
    );
}


/* ============================================================
   DASHBOARD
   ============================================================ */

function renderDashboard() {

    const capital =
        loadActiveCapital();

    const trades =
        loadTrades();

    if ($("activeCapitalName")) {

        $("activeCapitalName")
            .textContent =
            capital?.name ||
            "Aucun capital";
    }

    if ($("activeCapitalCreatedAt")) {

        $("activeCapitalCreatedAt")
            .textContent =
            capital?.createdAt
                ? new Date(
                    capital.createdAt
                ).toLocaleDateString(
                    "fr-FR"
                )
                : "—";
    }

    const initial =
        Number(
            capital?.initialCapital || 0
        );

    const current =
        Number(
            capital?.currentBalance ||
            initial
        );

    const profit =
        current - initial;

    if ($("initialCapital")) {
        $("initialCapital")
            .textContent =
            formatMoney(initial);
    }

    if ($("currentBalance")) {
        $("currentBalance")
            .textContent =
            formatMoney(current);
    }

    if ($("totalProfit")) {
        $("totalProfit")
            .textContent =
            formatMoney(profit);
    }

    if ($("riskReference")) {

        $("riskReference")
            .textContent =
            formatPercent(
                capital?.riskPercent || 0
            );
    }

    if ($("rrTarget")) {

        $("rrTarget")
            .textContent =
            Number(
                capital?.rrTarget ||
                MIN_RR
            ).toFixed(2);
    }

    if ($("theoreticalObjective")) {

        const riskMoney =
            calculateRiskMoney(
                current,
                capital?.riskPercent || 0
            );

        const objective =
            riskMoney *
            Number(
                capital?.rrTarget ||
                MIN_RR
            );

        $("theoreticalObjective")
            .textContent =
            formatMoney(objective);
    }

    renderCapitalChart(trades);
}


/* ============================================================
   GRAPHIQUE CAPITAL
   ============================================================ */

function renderCapitalChart(trades) {

    const canvas =
        $("capitalChart");

    if (!canvas) return;

    const ctx =
        canvas.getContext("2d");

    const width =
        canvas.width =
        canvas.clientWidth || 700;

    const height =
        canvas.height =
        canvas.clientHeight || 300;

    ctx.clearRect(
        0,
        0,
        width,
        height
    );

    const capital =
        loadActiveCapital();

    const initial =
        Number(
            capital?.initialCapital || 0
        );

    const capitalTrades =
        trades
            .filter(
                trade =>
                    !capital ||
                    trade.capitalId ===
                    capital.id
            )
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

    if (!capitalTrades.length) {

        if ($("emptyChartMessage")) {
            $("emptyChartMessage")
                .style.display =
                "block";
        }

        return;
    }

    if ($("emptyChartMessage")) {
        $("emptyChartMessage")
            .style.display =
            "none";
    }

    let balance = initial;

    const points = [
        {
            balance
        }
    ];

    capitalTrades.forEach(trade => {

        balance +=
            Number(
                trade.profit || 0
            );

        points.push({
            balance
        });
    });

    const values =
        points.map(
            point =>
                point.balance
        );

    const min =
        Math.min(...values);

    const max =
        Math.max(...values);

    const range =
        max - min || 1;

    const padding = 30;

    ctx.beginPath();

    points.forEach(
        (point, index) => {

            const x =
                padding +
                (
                    index /
                    Math.max(
                        points.length - 1,
                        1
                    )
                ) *
                (
                    width -
                    padding * 2
                );

            const y =
                height -
                padding -
                (
                    (
                        point.balance -
                        min
                    ) /
                    range
                ) *
                (
                    height -
                    padding * 2
                );

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
    );

    ctx.strokeStyle =
        getComputedStyle(
            document.documentElement
        ).getPropertyValue(
            "--accent"
        ) ||
        "#4f8cff";

    ctx.lineWidth = 3;

    ctx.stroke();
}


/* ============================================================
   PERFORMANCE
   ============================================================ */

function renderPerformancePage(
    period = "all"
) {

    const allTrades =
        loadTrades();

    const trades =
        filterTradesByPeriod(
            allTrades,
            period
        );

    const stats =
        calculateAdvancedStats(
            trades
        );

    setText(
        "statBalance",
        formatMoney(
            getCurrentBalance()
        )
    );

    setText(
        "statProfit",
        formatMoney(
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
            ? stats.averageRR.toFixed(2)
            : "—"
    );

    setText(
        "statTrades",
        stats.trades
    );

    const setupRanking =
        calculateSetupRanking(
            trades
        );

    setText(
        "statBestSetup",
        setupRanking.length
            ? setupRanking[0].setup
            : "—"
    );

    const lastTrade =
        trades.length
            ? trades[
                trades.length - 1
            ]
            : null;

    setText(
        "statLastTrade",
        lastTrade?.date ||
        "—"
    );

    setText(
        "statProfitFactor",
        Number.isFinite(
            stats.profitFactor
        )
            ? stats.profitFactor.toFixed(2)
            : "∞"
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
            stats.bestTrade
        )
    );

    setText(
        "statWorstTrade",
        formatMoney(
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
        formatMoney(
            stats.maxDrawdown
        )
    );

    renderPerformanceSetupTable(
        trades
    );

    renderPerformanceAssetTable(
        trades
    );

    renderHistory(
        trades
    );
}


/* ============================================================
   TABLE SETUPS PERFORMANCE
   ============================================================ */

function renderPerformanceSetupTable(
    trades
) {

    const body =
        $("setupTableBody");

    if (!body) return;

    const stats =
        buildSetupStats(
            trades
        );

    if (!stats.length) {

        body.innerHTML = `
            <tr>
                <td colspan="7">
                    Aucun trade pour cette période.
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        stats.map(item => {

            const winrate =
                item.trades
                    ? item.wins /
                        item.trades *
                        100
                    : 0;

            return `
                <tr>
                    <td>${escapeValue(
                        item.setup
                    )}</td>

                    <td>${item.trades}</td>

                    <td>${item.wins}</td>

                    <td>${item.losses}</td>

                    <td>${formatPercent(
                        winrate
                    )}</td>

                    <td>${item.breakevens}</td>

                    <td class="${
                        item.profit >= 0
                            ? "profit"
                            : "loss"
                    }">
                        ${formatMoney(
                            item.profit
                        )}
                    </td>
                </tr>
            `;
        }).join("");
}


/* ============================================================
   TABLE ACTIFS PERFORMANCE
   ============================================================ */

function renderPerformanceAssetTable(
    trades
) {

    const body =
        $("assetTableBody");

    if (!body) return;

    const stats =
        buildAssetStats(
            trades
        );

    if (!stats.length) {

        body.innerHTML = `
            <tr>
                <td colspan="10">
                    Aucun trade pour cette période.
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        stats.map(item => {

            const winrate =
                item.trades
                    ? item.wins /
                        item.trades *
                        100
                    : 0;

            const assetTrades =
                trades.filter(
                    trade =>
                        trade.asset ===
                        item.asset
                );

            const rrValues =
                assetTrades
                    .map(
                        trade =>
                            getTradeTargetRR(
                                trade
                            )
                    )
                    .filter(
                        value =>
                            Number.isFinite(
                                value
                            )
                    );

            const averageRR =
                rrValues.length
                    ? rrValues.reduce(
                        (a, b) =>
                            a + b,
                        0
                    ) /
                    rrValues.length
                    : 0;

            const profits =
                assetTrades.map(
                    trade =>
                        Number(
                            trade.profit || 0
                        )
                );

            const best =
                profits.length
                    ? Math.max(
                        ...profits
                    )
                    : 0;

            const worst =
                profits.length
                    ? Math.min(
                        ...profits
                    )
                    : 0;

            return `
                <tr>

                    <td>${escapeValue(
                        item.asset
                    )}</td>

                    <td>${item.trades}</td>

                    <td>${item.wins}</td>

                    <td>${item.losses}</td>

                    <td>${item.breakevens}</td>

                    <td>${formatPercent(
                        winrate
                    )}</td>

                    <td class="${
                        item.profit >= 0
                            ? "profit"
                            : "loss"
                    }">
                        ${formatMoney(
                            item.profit
                        )}
                    </td>

                    <td>
                        ${
                            averageRR
                                ? averageRR.toFixed(2)
                                : "—"
                        }
                    </td>

                    <td class="profit">
                        ${formatMoney(best)}
                    </td>

                    <td class="loss">
                        ${formatMoney(worst)}
                    </td>

                </tr>
            `;
        }).join("");
}


/* ============================================================
   HISTORIQUE
   ============================================================ */

function renderHistory(
    trades = loadTrades()
) {

    const body =
        $("historyBody");

    if (!body) return;

    const list =
        [...trades].sort(
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

    if (!list.length) {

        body.innerHTML = `
            <tr>
                <td colspan="14">
                    Aucun trade enregistré.
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        list.map(trade => {

            const result =
                normalizeTradeResult(
                    trade.result
                );

            return `
                <tr>

                    <td>${escapeValue(
                        trade.date
                    )}</td>

                    <td>
                        ${
                            trade.recordedAt
                                ? new Date(
                                    trade.recordedAt
                                ).toLocaleString(
                                    "fr-FR"
                                )
                                : "—"
                        }
                    </td>

                    <td>${escapeValue(
                        trade.asset
                    )}</td>

                    <td>
                        <span class="badge ${
                            trade.direction === "BUY"
                                ? "buy"
                                : "sell"
                        }">
                            ${escapeValue(
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
                        ${Number(
                            trade.rr || 0
                        ).toFixed(2)}
                    </td>

                    <td>
                        ${formatNumber(
                            trade.pips,
                            1
                        )}
                    </td>

                    <td>
                        ${escapeValue(
                            trade.setup ||
                            "—"
                        )}
                    </td>

                    <td>
                        <span class="badge result-${result.toLowerCase()}">
                            ${escapeValue(
                                result
                            )}
                        </span>
                    </td>

                    <td class="${
                        Number(
                            trade.profit || 0
                        ) >= 0
                            ? "profit"
                            : "loss"
                    }">
                        ${formatMoney(
                            trade.profit
                        )}
                    </td>

                    <td>
                        <button
                            class="danger small"
                            type="button"
                            data-delete-trade="${
                                escapeValue(
                                    trade.id
                                )
                            }"
                        >
                            Supprimer
                        </button>
                    </td>

                </tr>
            `;
        }).join("");

    body
        .querySelectorAll(
            "[data-delete-trade]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    deleteTrade(
                        button.dataset.deleteTrade
                    );
                }
            );
        });
}


/* ============================================================
   ANALYSE & RISQUE — V51
   ============================================================ */

function renderAnalysisPage(
    period = "all"
) {

    const trades =
        filterTradesByPeriod(
            loadTrades(),
            period
        );

    currentAnalysisTrades =
        trades;

    if (typeof displayRiskStats === "function") {
        displayRiskStats(trades);
    }

    if (typeof displayRRStats === "function") {
        displayRRStats(trades);
    }

    if (typeof renderSetupPerformance === "function") {
        renderSetupPerformance(trades);
    }

    if (typeof renderAssetPerformance === "function") {
        renderAssetPerformance(trades);
    }

    if (typeof renderSetupRanking === "function") {
        renderSetupRanking(trades);
    }

    if (typeof generateRecommendations === "function") {

        const recommendations =
            generateRecommendations(
                trades
            );

        const container =
            $("v51Recommendations");

        if (container) {

            if (Array.isArray(
                recommendations
            )) {

                container.innerHTML =
                    recommendations
                        .map(
                            item =>
                                `<div class="recommendation">
                                    ${escapeValue(item)}
                                </div>`
                        )
                        .join("");

            } else {

                container.innerHTML =
                    `<div class="recommendation">
                        ${escapeValue(
                            recommendations ||
                            "Aucune recommandation."
                        )}
                    </div>`;
            }
        }
    }

    if (typeof renderCalendar === "function") {
        renderCalendar(trades);
    }
}


/* ============================================================
   ARCHIVES
   ============================================================ */

function renderArchives() {

    const container =
        $("archivesList");

    if (!container) return;

    const archives =
        loadArchives();

    if (!archives.length) {

        container.innerHTML = `
            <div class="empty-state">
                Aucune archive disponible.
            </div>
        `;

        return;
    }

    container.innerHTML =
        archives.map(
            (archive, index) => {

                const initial =
                    Number(
                        archive.initialCapital ||
                        0
                    );

                const final =
                    Number(
                        archive.finalBalance ||
                        archive.currentBalance ||
                        0
                    );

                const profit =
                    final - initial;

                return `
                    <article class="archive-card">

                        <div>
                            <h3>
                                ${escapeValue(
                                    archive.name ||
                                    "Capital"
                                )}
                            </h3>

                            <p>
                                Créé le :
                                ${
                                    archive.createdAt
                                        ? new Date(
                                            archive.createdAt
                                        ).toLocaleDateString(
                                            "fr-FR"
                                        )
                                        : "—"
                                }
                            </p>

                            <p>
                                Archivé le :
                                ${
                                    archive.archivedAt
                                        ? new Date(
                                            archive.archivedAt
                                        ).toLocaleDateString(
                                            "fr-FR"
                                        )
                                        : "—"
                                }
                            </p>
                        </div>

                        <div class="archive-values">

                            <div>
                                <span>Initial</span>
                                <strong>
                                    ${formatMoney(initial)}
                                </strong>
                            </div>

                            <div>
                                <span>Final</span>
                                <strong>
                                    ${formatMoney(final)}
                                </strong>
                            </div>

                            <div>
                                <span>Résultat</span>
                                <strong class="${
                                    profit >= 0
                                        ? "profit"
                                        : "loss"
                                }">
                                    ${formatMoney(profit)}
                                </strong>
                            </div>

                        </div>

                        <div class="archive-actions">

                            <button
                                type="button"
                                class="secondary"
                                data-open-archive="${
                                    index
                                }"
                            >
                                Voir
                            </button>

                            <button
                                type="button"
                                class="danger"
                                data-delete-archive="${
                                    index
                                }"
                            >
                                Supprimer
                            </button>

                        </div>

                    </article>
                `;
            }
        ).join("");

    container
        .querySelectorAll(
            "[data-open-archive]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    openArchiveChart(
                        Number(
                            button.dataset.openArchive
                        )
                    );
                }
            );
        });

    container
        .querySelectorAll(
            "[data-delete-archive]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    deleteArchive(
                        Number(
                            button.dataset.deleteArchive
                        )
                    );
                }
            );
        });
}


/* ============================================================
   GRAPHIQUE ARCHIVE
   ============================================================ */

function openArchiveChart(index) {

    const archives =
        loadArchives();

    const archive =
        archives[index];

    if (!archive) return;

    const modal =
        $("archiveChartModal");

    if (!modal) return;

    setText(
        "archiveChartTitle",
        archive.name ||
        "Archive"
    );

    setText(
        "archiveChartSubtitle",
        archive.archivedAt
            ? new Date(
                archive.archivedAt
            ).toLocaleDateString(
                "fr-FR"
            )
            : ""
    );

    setText(
        "archiveChartInitial",
        formatMoney(
            archive.initialCapital
        )
    );

    setText(
        "archiveChartFinal",
        formatMoney(
            archive.finalBalance
        )
    );

    setText(
        "archiveChartProfit",
        formatMoney(
            archive.profit
        )
    );

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
        $("archiveChartModal");

    if (!modal) return;

    modal.classList.remove("show");

    modal.setAttribute(
        "aria-hidden",
        "true"
    );
}

function renderArchiveChart(
    archive
) {

    const canvas =
        $("archiveChart");

    if (!canvas) return;

    const ctx =
        canvas.getContext("2d");

    const trades =
        Array.isArray(
            archive.trades
        )
            ? archive.trades
            : [];

    const width =
        canvas.width =
        canvas.clientWidth || 700;

    const height =
        canvas.height =
        canvas.clientHeight || 300;

    ctx.clearRect(
        0,
        0,
        width,
        height
    );

    let balance =
        Number(
            archive.initialCapital ||
            0
        );

    const points = [
        balance
    ];

    trades.forEach(trade => {

        balance +=
            Number(
                trade.profit || 0
            );

        points.push(
            balance
        );
    });

    if (points.length < 2) {
        return;
    }

    const min =
        Math.min(...points);

    const max =
        Math.max(...points);

    const range =
        max - min || 1;

    const padding = 30;

    ctx.beginPath();

    points.forEach(
        (value, index) => {

            const x =
                padding +
                index /
                (
                    points.length - 1
                ) *
                (
                    width -
                    padding * 2
                );

            const y =
                height -
                padding -
                (
                    value - min
                ) /
                range *
                (
                    height -
                    padding * 2
                );

            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
    );

    ctx.strokeStyle =
        getComputedStyle(
            document.documentElement
        ).getPropertyValue(
            "--accent"
        ) ||
        "#4f8cff";

    ctx.lineWidth = 3;

    ctx.stroke();
}


/* ============================================================
   CALENDRIER
   ============================================================ */

function getCalendarTrades(
    trades
) {

    const result = {};

    trades.forEach(trade => {

        if (!trade.date) return;

        if (!result[trade.date]) {

            result[trade.date] = {
                count: 0,
                profit: 0
            };
        }

        result[trade.date].count++;

        result[trade.date].profit +=
            Number(
                trade.profit || 0
            );
    });

    return result;
}


/* ============================================================
   TEXTE
   ============================================================ */

function setText(id, value) {

    const element = $(id);

    if (element) {
        element.textContent =
            value ?? "—";
    }
}


/* ============================================================
   BOUTONS PÉRIODE
   ============================================================ */

function initializePeriodButtons() {

    document
        .querySelectorAll(
            "[data-period]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(
                            "[data-period]"
                        )
                        .forEach(
                            item =>
                                item.classList
                                    .remove(
                                        "active"
                                    )
                        );

                    button.classList.add(
                        "active"
                    );

                    const period =
                        button.dataset.period;

                    const page =
                        document.querySelector(
                            ".page-section.active"
                        );

                    if (
                        page?.id ===
                        "pagePerformance"
                    ) {

                        renderPerformancePage(
                            period
                        );
                    }

                    if (
                        page?.id ===
                        "pageAnalysis"
                    ) {

                        renderAnalysisPage(
                            period
                        );
                    }
                }
            );
        });
}


/* ============================================================
   INITIALISATION MODALES
   ============================================================ */

function initializeModals() {

    $("openTradeModalBtn")
        ?.addEventListener(
            "click",
            openTradeModal
        );

    $("closeTradeModal")
        ?.addEventListener(
            "click",
            closeTradeModal
        );

    $("cancelTradeBtn")
        ?.addEventListener(
            "click",
            closeTradeModal
        );

    $("tradeModal")
        ?.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    $("tradeModal")
                ) {
                    closeTradeModal();
                }
            }
        );

    $("tradeForm")
        ?.addEventListener(
            "submit",
            submitTrade
        );

    [
        "tradeAsset",
        "tradeDirection",
        "tradeEntry",
        "tradeSL",
        "tradeRR"
    ].forEach(id => {

        $(id)?.addEventListener(
            "input",
            updateAutomaticTradeValues
        );

        $(id)?.addEventListener(
            "change",
            updateAutomaticTradeValues
        );
    });


    /* Capital */

    $("newCapitalBtn")
        ?.addEventListener(
            "click",
            () =>
                openCapitalModal("new")
        );

    $("changeCapitalBtn")
        ?.addEventListener(
            "click",
            () =>
                openCapitalModal("edit")
        );

    $("archiveCapitalBtn")
        ?.addEventListener(
            "click",
            archiveActiveCapital
        );

    $("saveCapitalBtn")
        ?.addEventListener(
            "click",
            saveCapitalFromModal
        );

    $("cancelCapitalBtn")
        ?.addEventListener(
            "click",
            closeCapitalModal
        );

    $("closeCapitalModal")
        ?.addEventListener(
            "click",
            closeCapitalModal
        );

    [
        "capitalAmountInput",
        "capitalRiskInput",
        "capitalRRInput"
    ].forEach(id => {

        $(id)?.addEventListener(
            "input",
            updateCapitalModalPreview
        );
    });


    /* Archive chart */

    $("closeArchiveChartModal")
        ?.addEventListener(
            "click",
            closeArchiveChart
        );

    $("archiveChartCloseBtn")
        ?.addEventListener(
            "click",
            closeArchiveChart
        );

    $("archiveChartModal")
        ?.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    $("archiveChartModal")
                ) {
                    closeArchiveChart();
                }
            }
        );
}


/* ============================================================
   CLEAR HISTORY
   ============================================================ */

function initializeClearButton() {

    $("clearBtn")
        ?.addEventListener(
            "click",
            () => {

                const trades =
                    loadTrades();

                if (!trades.length) {
                    return;
                }

                if (
                    !confirm(
                        "Supprimer tout l'historique des trades ?"
                    )
                ) {
                    return;
                }

                /*
                    On ne supprime que les trades.
                    Le capital actif est recalculé à son
                    niveau initial.
                */

                saveTrades([]);

                const capital =
                    loadActiveCapital();

                if (capital) {

                    capital.currentBalance =
                        Number(
                            capital.initialCapital
                        );

                    saveActiveCapital(
                        capital
                    );
                }

                renderAll();
            }
        );
}


/* ============================================================
   ESCAPE / CLAVIER
   ============================================================ */

function initializeKeyboard() {

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
            closeArchiveChart();
        }
    );
}


/* ============================================================
   RENDU GLOBAL
   ============================================================ */

function renderAll() {

    renderDashboard();

    const activePage =
        document.querySelector(
            ".page-section.active"
        );

    if (
        activePage?.id ===
        "pageAnalysis"
    ) {

        renderAnalysisPage();
    }

    if (
        activePage?.id ===
        "pagePerformance"
    ) {

        renderPerformancePage();
    }

    if (
        activePage?.id ===
        "pageArchives"
    ) {

        renderArchives();
    }
}


/* ============================================================
   MIGRATION DES ANCIENS TRADES
   ============================================================ */

function migrateTrades() {

    const trades =
        loadTrades();

    let changed = false;

    const capital =
        loadActiveCapital();

    const migrated =
        trades.map(trade => {

            const result = {
                ...trade
            };

            if (!result.id) {

                result.id =
                    `trade_${Date.now()}_${Math.random()
                        .toString(36)
                        .slice(2, 8)}`;

                changed = true;
            }

            if (
                !result.recordedAt
            ) {

                result.recordedAt =
                    getNowISO();

                changed = true;
            }

            if (
                !result.capitalId &&
                capital
            ) {

                result.capitalId =
                    capital.id;

                changed = true;
            }

            if (
                !Number.isFinite(
                    Number(
                        result.profit
                    )
                )
            ) {

                result.profit = 0;

                changed = true;
            }

            /*
                Recalcul du RR si absent.
            */

            if (
                !Number.isFinite(
                    Number(result.rr)
                )
            ) {

                const rr =
                    getTradeTargetRR(
                        result
                    );

                if (
                    Number.isFinite(rr)
                ) {

                    result.rr = rr;

                    changed = true;
                }
            }

            return result;
        });

    if (changed) {
        saveTrades(migrated);
    }
}


/* ============================================================
   REDIMENSIONNEMENT
   ============================================================ */

function initializeResize() {

    window.addEventListener(
        "resize",
        () => {

            const activePage =
                document.querySelector(
                    ".page-section.active"
                );

            if (
                activePage?.id ===
                "pageDashboard"
            ) {
                renderCapitalChart(
                    loadTrades()
                );
            }

            if (
                activePage?.id ===
                "pageArchives"
            ) {
                /*
                    Le graphique archive est
                    redessiné à la prochaine ouverture.
                */
            }
        }
    );
}


/* ============================================================
   DOM READY
   ============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        try {

            migrateTrades();

            initializeTheme();

            initializeNavigation();

            initializePeriodButtons();

            initializeModals();

            initializeClearButton();

            initializeKeyboard();

            initializeResize();

            /*
                Dashboard visible par défaut.
            */

            const dashboard =
                $("pageDashboard");

            if (dashboard) {

                document
                    .querySelectorAll(
                        ".page-section"
                    )
                    .forEach(
                        page =>
                            page.classList
                                .remove(
                                    "active"
                                )
                    );

                dashboard.classList.add(
                    "active"
                );
            }

            renderAll();

        } catch (error) {

            console.error(
                "Erreur initialisation ARCH TRADING PLAN :",
                error
            );
        }
    }
);


/* ============================================================
   EXPORTS GLOBAUX
   Nécessaires pour v51-filters.js
   ============================================================ */

window.ASSETS = ASSETS;
window.SETUPS = SETUPS;

window.MIN_RR = MIN_RR;
window.MIN_LOT = MIN_LOT;
window.LOT_STEP = LOT_STEP;
window.RISK_TOLERANCE = RISK_TOLERANCE;

window.formatMoney = formatMoney;
window.formatPercent = formatPercent;
window.escapeValue = escapeValue;

window.getTradeRiskDistance =
    getTradeRiskDistance;

window.calculateTP =
    calculateTP;

window.getTradeTargetRR =
    getTradeTargetRR;

window.calculateRiskMoney =
    calculateRiskMoney;

window.calculateLotFromRisk =
    calculateLotFromRisk;

window.calculateTradeProfit =
    calculateTradeProfit;

window.calculatePips =
    calculatePips;

window.calculateAdvancedStats =
    calculateAdvancedStats;

window.calculateRiskStats =
    calculateRiskStats;

window.calculateSetupRanking =
    calculateSetupRanking;

window.isAnalysisPage =
    isAnalysisPage;

window.getCalendarTrades =
    getCalendarTrades;

window.calendarMonth =
    calendarMonth;

window.calendarYear =
    calendarYear;
