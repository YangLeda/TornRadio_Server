function createEvents(json) {
    let resultEvents = [];
    checkCooldowns(json, resultEvents);
    checkBars(json, resultEvents);
    checkTravel(json, resultEvents);
    checkHospital(json, resultEvents);
    checkRacing(json, resultEvents);
    checkEducation(json, resultEvents);
    checkStock(json, resultEvents);
    checkBank(json, resultEvents);
    checkRehab(json, resultEvents);
    return resultEvents;
}

function createReminderEvents(json) {
    let reminderEvents = [];
    checkRemindOC(json, reminderEvents);
    checkRemindRefill(json, reminderEvents);
    checkRemindRehab(json, reminderEvents);
    checkRemindMission(json, reminderEvents);
    return reminderEvents;
}

function checkCooldowns(json, resultEvents) {
    if (json["cooldowns"]["drug"] <= 30) {  // 30s
        resultEvents.push("No drug cooldown");
    }
    if (json["cooldowns"]["medical"] <= 3600) {  // 1h
        resultEvents.push("No medical cooldown");
    }
    if (json["cooldowns"]["booster"] <= 36000) {  // 10h
        resultEvents.push("No booster cooldown");
    }
}

function checkBars(json, resultEvents) {
    if (json["energy"]["fulltime"] <= 1800) {  // 30m
        resultEvents.push("Full energy bar");
    }
    if (json["nerve"]["fulltime"] <= 1800) {  // 30m
        resultEvents.push("Full nerve bar");
    }
}

function checkTravel(json, resultEvents) {
    if (json["status"]["state"] == "Abroad") {
        resultEvents.push("Landed abroad");
    }
}

function checkHospital(json, resultEvents) {
    if (json["states"]["hospital_timestamp"] - json["timestamp"] > 0 && json["states"]["hospital_timestamp"] - json["timestamp"] <= 300) {
        resultEvents.push("Out of hosp in 5 min");
    }
}

function checkRacing(json, resultEvents) {
    if (Object.keys(json["icons"]).includes("icon17")) {
        return;
    }
    if (json["status"]["state"] != "Okay") {
        return;
    }
    for (let log of Object.values(json["log"])) {
        if (Math.floor(Date.now() / 1000) - log["timestamp"] > 900) {
            resultEvents.push("Racing ready");
            return;
        }
        if (log["title"] == "Racing leave official race") {
            return;
        }
    }
}

function checkEducation(json, resultEvents) {
    if (!Object.keys(json["icons"]).includes("icon19")) {
        resultEvents.push("Education done");
    }
}

function checkStock(json, resultEvents) {
    if (Object.keys(json["icons"]).includes("icon84")) {
        resultEvents.push("Stock dividend");
    }
}

function checkBank(json, resultEvents) {
    if (Object.keys(json["icons"]).includes("icon30")) {
        resultEvents.push("Bank done");
    }
}

function checkRehab(json, resultEvents) {
    if (json["happy"]["current"] < 4000 || Object.keys(json["icons"]).includes("icon58") || Object.keys(json["icons"]).includes("icon59")) {
        resultEvents.push("Go rehab");
    }
}

function checkRemindRefill(json, reminderEvents) {
    if (json["refills"]["energy_refill_used"] == false || json["refills"]["nerve_refill_used"] == false || json["refills"]["token_refill_used"] == false || json["refills"]["special_refills_available"] > 0) {
        reminderEvents.push("Refill");
    }
}

function checkRemindRehab(json, reminderEvents) {
    if (Object.keys(json["icons"]).includes("icon57")) {
        reminderEvents.push("Rehab");
    }
}

function checkRemindMission(json, reminderEvents) {
    for (let mission of json["missions"]["Duke"]) {
        if (mission.status != "failed" && mission.status != "completed") {
            reminderEvents.push("Mission");
            return;
        }
    }
}

function checkRemindOC(json, reminderEvents) {
    if (Object.keys(json["icons"]).includes("icon86")) {
        reminderEvents.push("OC");
    }
}

export { createEvents, createReminderEvents };
