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

    resultEvents.push("event 1");
}

function checkBars(json, resultEvents) {
    
    resultEvents.push("event 2");
}

function checkTravel(json, resultEvents) {
    
    resultEvents.push("event 3");
}

function checkHospital(json, resultEvents) {
    
    resultEvents.push("event 4");
}

function checkEducation(json, resultEvents) {
    
    resultEvents.push("event 5");
}

function checkRacing(json, resultEvents) {
    
    resultEvents.push("event 6");
}

export default createEvents;
