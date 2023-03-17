function createEvents(json) {
    let resultEvents = [];
    checkCooldowns(json, resultEvents);
    checkBars(json, resultEvents);
    checkTravel(json, resultEvents);
    checkHospital(json, resultEvents);
    checkEducation(json, resultEvents);
    checkRacing(json, resultEvents);
    return resultEvents;
}

function checkCooldowns(json, resultEvents) {
    if (json["cooldowns"]["drug"] <= 0) {
        resultEvents.push("No drug cooldown");
    }
    if (json["cooldowns"]["medical"] <= 0) {
        resultEvents.push("No medical cooldown");
    }
    if (json["cooldowns"]["booster"] <= 0) {
        resultEvents.push("No booster cooldown");
    }
}

function checkBars(json, resultEvents) {
    if (json["energy"]["fulltime"] <= 10) {
        resultEvents.push("Full energy bar");
    }
    if (json["nerve"]["fulltime"] <= 10) {
        resultEvents.push("Full nerve bar");
    }
}

function checkTravel(json, resultEvents) {
    if (json["status"]["state"] == "Abroad") {
        resultEvents.push("Landed abroad");
    }
}

function checkHospital(json, resultEvents) {
    if (json["states"]["hospital_timestamp"] >0 && json["states"]["hospital_timestamp"] <= 600) {
        resultEvents.push("Out of hosipital in under 10 minutes");
    }
}

function checkEducation(json, resultEvents) {
    if (json["education_timeleft"] <= 10) {
        resultEvents.push("Education done");
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

export default createEvents;
