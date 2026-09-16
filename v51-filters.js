"use strict";

/* ============================================================
   ARCH TRADING PLAN
   V51-FILTERS.JS
   ANALYSE / RISQUE / SETUPS / ACTIFS / CALENDRIER
   ============================================================ */


/* ============================================================
   RISQUE
   ============================================================ */

function displayRiskStats(
    filteredTrades
) {

    if (!isAnalysisPage()) {
        return;
    }


    const stats =
        calculateRiskStats(
            filteredTrades
        );


    setText(
        "v51AverageRisk",
        stats.averageRisk !== null
            ? formatMoney(
                stats.averageRisk
            )
            : "-"
    );


    setText(
        "v51MinimumRisk",
        stats.minimumRisk !== null
            ? formatMoney(
                stats.minimumRisk
            )
            : "-"
    );


    setText(
        "v51MaximumRisk",
        stats.maximumRisk !== null
            ? formatMoney(
                stats.maximumRisk
            )
            : "-"
    );


    setText(
        "v51ReferenceRisk",
        stats.referenceRisk !== null
            ? formatMoney(
                stats.referenceRisk
            )
            : "-"
    );


    setText(
        "v51AverageDeviation",
        stats.averageDeviation !== null
            ? stats.averageDeviation.toFixed(1) + "%"
            : "-"
    );


    setText(
        "v51RiskRegularity",
        stats.riskRegularity !== null
            ? stats.riskRegularity.toFixed(1) + "%"
            : "-"
    );


    setText(
        "v51CompliantTrades",
        String(
            stats.compliantTrades
        )
    );


    setText(
        "v51NonCompliantTrades",
        String(
            stats.nonCompliantTrades
        )
    );
}


/* ============================================================
   RR
   ============================================================ */

function calculateRRStats(
    filteredTrades
) {

    const records = [];


    filteredTrades.forEach(
        trade => {

            const rr =
                getTradeTargetRR(
                    trade
                );


            if (
                rr !== null &&
                Number.isFinite(rr)
            ) {
                records.push(rr);
            }
        }
    );


    if (
        records.length === 0
    ) {

        return {

            averageRR: null,

            minimumRR: null,

            maximumRR: null
        };
    }


    return {

        averageRR:
            records.reduce(
                (sum, value) =>
                    sum + value,
                0
            ) /
            records.length,

        minimumRR:
            Math.min(...records),

        maximumRR:
            Math.max(...records)
    };
}


function displayRRStats(
    filteredTrades
) {

    if (!isAnalysisPage()) {
        return;
    }


    const stats =
        calculateRRStats(
            filteredTrades
        );


    setText(
        "v51AverageTargetRR",
        stats.averageRR !== null
            ? stats.averageRR.toFixed(2)
            : "-"
    );


    setText(
        "v51MinimumTargetRR",
        stats.minimumRR !== null
            ? stats.minimumRR.toFixed(2)
            : "-"
    );


    setText(
        "v51MaximumTargetRR",
        stats.maximumRR !== null
            ? stats.maximumRR.toFixed(2)
            : "-"
    );
}


/* ============================================================
   SETUPS
   ============================================================ */

function buildSetupStats(
    filteredTrades
) {

    const map = {};


    filteredTrades.forEach(
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
                Number(
                    trade.pnl
                ) || 0;
        }
    );


    return Object.values(map)
        .sort(
            (a, b) =>
                b.profit -
                a.profit
        );
}


function renderSetupPerformance(
    filteredTrades
) {

    if (!isAnalysisPage()) {
        return;
    }


    const rows =
        buildSetupStats(
            filteredTrades
        );


    const tbody =
        document.getElementById(
            "v51SetupPerformanceBody"
        );


    if (!tbody) {
        return;
    }


    if (rows.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td
                    colspan="7"
                    class="empty-state"
                >
                    Aucun trade pour cette période.
                </td>
            </tr>
        `;

        return;
    }


    tbody.innerHTML =
        rows.map(
            item => {

                const winrate =
                    item.trades > 0
                        ? (
                            item.wins /
                            item.trades
                        ) *
                        100
                        : 0;


                return `

                    <tr>

                        <td>
                            ${escapeValue(
                                item.setup
                            )}
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
                            ${winrate.toFixed(1)}%
                        </td>

                        <td>
                            ${item.be}
                        </td>

                        <td class="${
                            item.profit > 0
                                ? "positive"
                                : item.profit < 0
                                    ? "negative"
                                    : ""
                        }">
                            ${formatMoney(
                                item.profit
                            )}
                        </td>

                    </tr>

                `;
            }
        ).join("");
}


/* ============================================================
   ACTIFS
   ============================================================ */

function buildAssetStats(
    filteredTrades
) {

    const map = {};


    filteredTrades.forEach(
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
                Number(
                    trade.pnl
                ) || 0;
        }
    );


    return Object.values(map)
        .sort(
            (a, b) =>
                b.profit -
                a.profit
        );
}


function renderAssetPerformance(
    filteredTrades
) {

    if (!isAnalysisPage()) {
        return;
    }


    const rows =
        buildAssetStats(
            filteredTrades
        );


    const tbody =
        document.getElementById(
            "v51AssetPerformanceBody"
        );


    if (!tbody) {
        return;
    }


    if (rows.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td
                    colspan="7"
                    class="empty-state"
                >
                    Aucun trade pour cette période.
                </td>
            </tr>
        `;

        return;
    }


    tbody.innerHTML =
        rows.map(
            item => {

                const winrate =
                    item.trades > 0
                        ? (
                            item.wins /
                            item.trades
                        ) *
                        100
                        : 0;


                return `

                    <tr>

                        <td>
                            ${escapeValue(
                                item.asset
                            )}
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
                            ${winrate.toFixed(1)}%
                        </td>

                        <td>
                            ${item.be}
                        </td>

                        <td class="${
                            item.profit > 0
                                ? "positive"
                                : item.profit < 0
                                    ? "negative"
                                    : ""
                        }">
                            ${formatMoney(
                                item.profit
                            )}
                        </td>

                    </tr>

                `;
            }
        ).join("");
}


/* ============================================================
   RANKING SETUPS
   ============================================================ */

function calculateSetupRanking(
    filteredTrades
) {

    return buildSetupStats(
        filteredTrades
    )
        .map(
            item => ({

                setup:
                    item.setup,

                trades:
                    item.trades,

                winrate:
                    item.trades > 0
                        ? (
                            item.wins /
                            item.trades
                        ) *
                        100
                        : 0,

                profit:
                    item.profit
            })
        )
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


function renderSetupRanking(
    filteredTrades
) {

    if (!isAnalysisPage()) {
        return;
    }


    const rows =
        calculateSetupRanking(
            filteredTrades
        );


    const container =
        document.getElementById(
            "v51SetupRanking"
        );


    if (!container) {
        return;
    }


    if (rows.length === 0) {

        container.innerHTML = `
            <div class="empty-state">
                Aucun setup disponible.
            </div>
        `;

        return;
    }


    container.innerHTML =
        rows.map(
            (item, index) => `

                <div class="v51-ranking-row">

                    <div class="v51-ranking-position">
                        #${index + 1}
                    </div>

                    <div class="v51-ranking-main">

                        <strong>
                            ${escapeValue(
                                item.setup
                            )}
                        </strong>

                        <span>
                            ${item.trades}
                            trade${item.trades > 1 ? "s" : ""}
                            ·
                            ${item.winrate.toFixed(1)}%
                        </span>

                    </div>

                    <div class="${
                        item.profit > 0
                            ? "profit-positive"
                            : item.profit < 0
                                ? "profit-negative"
                                : ""
                    }">

                        ${formatMoney(
                            item.profit
                        )}

                    </div>

                </div>

            `
        ).join("");
}


/* ============================================================
   RECOMMANDATIONS
   ============================================================ */

function generateRecommendations(
    filteredTrades
) {

    const recommendations = [];


    if (
        !filteredTrades ||
        filteredTrades.length === 0
    ) {

        recommendations.push(
            "Pas encore assez de trades pour générer des observations."
        );

        return recommendations;
    }


    const stats =
        calculateAdvancedStats(
            filteredTrades
        );


    const ranking =
        calculateSetupRanking(
            filteredTrades
        );


    if (stats.winrate < 40) {

        recommendations.push(
            "La winrate observée est inférieure à 40 %. Vérifie les confirmations et les conditions d'entrée."
        );

    } else if (
        stats.winrate >= 60
    ) {

        recommendations.push(
            "La winrate observée est supérieure ou égale à 60 % sur cette période."
        );
    }


    if (
        stats.maxLossStreak >= 3
    ) {

        recommendations.push(
            "Une série d'au moins 3 pertes a été observée. Vérifie la discipline du risque après les pertes."
        );
    }


    if (
        stats.maxDrawdown < 0
    ) {

        recommendations.push(
            `Drawdown maximal observé : ${formatMoney(
                stats.maxDrawdown
            )}.`
        );
    }


    const riskStats =
        calculateRiskStats(
            filteredTrades
        );


    if (
        riskStats.averageDeviation !== null &&
        riskStats.averageDeviation >
            RISK_TOLERANCE * 100
    ) {

        recommendations.push(
            `L'écart moyen du risque dépasse la tolérance de ${(RISK_TOLERANCE * 100).toFixed(0)} %.`
        );

    } else {

        recommendations.push(
            "Le risque observé reste globalement proche du risque de référence."
        );
    }


    if (
        ranking.length > 0
    ) {

        const best =
            ranking[0];


        recommendations.push(
            `Le setup ayant le plus grand résultat cumulé sur cette période est ${best.setup} avec ${formatMoney(
                best.profit
            )}.`
        );
    }


    return recommendations;
}


function renderRecommendations(
    filteredTrades
) {

    const container =
        document.getElementById(
            "v51Recommendations"
        );


    if (!container) {
        return;
    }


    const recommendations =
        generateRecommendations(
            filteredTrades
        );


    container.innerHTML =
        recommendations
            .map(
                text => `
                    <div class="recommendation-item">
                        ${escapeValue(text)}
                    </div>
                `
            )
            .join("");
}


/* ============================================================
   CALENDRIER
   ============================================================ */

function getCalendarTrades(
    filteredTrades
) {

    const map = {};


    filteredTrades.forEach(
        trade => {

            const date =
                getTradeDate(trade);


            if (!date) {
                return;
            }


            if (!map[date]) {

                map[date] = {

                    count: 0,

                    profit: 0
                };
            }


            map[date].count++;

            map[date].profit +=
                Number(
                    trade.pnl
                ) || 0;
        }
    );


    return map;
}


function renderCalendar(
    filteredTrades
) {

    if (!isAnalysisPage()) {
        return;
    }


    const container =
        document.getElementById(
            "v51Calendar"
        );


    if (!container) {
        return;
    }


    const map =
        getCalendarTrades(
            filteredTrades
        );


    const first =
        new Date(
            calendarYear,
            calendarMonth,
            1
        );


    const last =
        new Date(
            calendarYear,
            calendarMonth + 1,
            0
        );


    let startDay =
        first.getDay();


    /*
       Dimanche = 0.
       On transforme en lundi = 0.
    */

    startDay =
        startDay === 0
            ? 6
            : startDay - 1;


    const days =
        last.getDate();


    const monthName =
        new Intl.DateTimeFormat(
            "fr-FR",
            {
                month: "long"
            }
        ).format(first);


    let html = `

        <div class="calendar-header">

            <button
                id="v51CalendarPrev"
                type="button"
            >
                ‹
            </button>

            <strong>
                ${monthName}
                ${calendarYear}
            </strong>

            <button
                id="v51CalendarNext"
                type="button"
            >
                ›
            </button>

        </div>


        <div class="calendar-grid">

            ${[
                "Lun",
                "Mar",
                "Mer",
                "Jeu",
                "Ven",
                "Sam",
                "Dim"
            ]
                .map(
                    day =>
                        `<div class="calendar-weekday">${day}</div>`
                )
                .join("")}

    `;


    for (
        let i = 0;
        i < startDay;
        i++
    ) {

        html += `
            <div class="calendar-day empty"></div>
        `;
    }


    for (
        let day = 1;
        day <= days;
        day++
    ) {

        const key =
            `${calendarYear}-${String(
                calendarMonth + 1
            ).padStart(2, "0")}-${String(
                day
            ).padStart(2, "0")}`;


        const item =
            map[key];


        let className =
            "calendar-day";


        if (item) {

            if (
                item.profit > 0
            ) {
                className +=
                    " profit";
            }

            else if (
                item.profit < 0
            ) {
                className +=
                    " loss";
            }

            else {
                className +=
                    " neutral";
            }
        }


        html += `

            <div
                class="${className}"
                title="${
                    item
                        ? `${item.count} trade(s) · ${formatMoney(item.profit)}`
                        : "Aucun trade"
                }"
            >

                <div class="calendar-day-number">
                    ${day}
                </div>

                ${
                    item
                        ? `
                            <div class="calendar-day-info">
                                ${item.count} trade${item.count > 1 ? "s" : ""}
                                <br>
                                ${formatMoney(item.profit)}
                            </div>
                          `
                        : ""
                }

            </div>

        `;
    }


    html += `
        </div>
    `;


    container.innerHTML =
        html;


    document
        .getElementById(
            "v51CalendarPrev"
        )
        ?.addEventListener(
            "click",
            () => {

                calendarMonth--;

                if (
                    calendarMonth < 0
                ) {

                    calendarMonth = 11;

                    calendarYear--;
                }

                renderCalendar(
                    filteredTrades
                );
            }
        );


    document
        .getElementById(
            "v51CalendarNext"
        )
        ?.addEventListener(
            "click",
            () => {

                calendarMonth++;

                if (
                    calendarMonth > 11
                ) {

                    calendarMonth = 0;

                    calendarYear++;
                }

                renderCalendar(
                    filteredTrades
                );
            }
        );
}
