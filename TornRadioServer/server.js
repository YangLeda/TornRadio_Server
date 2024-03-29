import * as dotenv from 'dotenv'
dotenv.config();
import fetch from "node-fetch";
import express from "express";
import cors from "cors";
import logger from "./logger.js";
import { createEvents, createReminderEvents } from "./events.js";
import { GoogleSpreadsheet } from "google-spreadsheet";

const app = express();
const port = 3001;
const MY_FACTION_ID = process.env.FACTION_ID;
const API_REQUEST_DELAY = 300;
const FETCH_ALL_PLAYERS_INTERVAL = 3600000;  // 1h
const FETCH_SPY_DOC_INTERVAL = 3600000;  // 1h
const FETCH_TORNSTATS_SPY_INTERVAL = 3600000;  // 1h
const FETCH_FACTION_INTERVAL = 60000;  // 1m
const FETCH_MONITOR_INTERVAL = 15000;  // 15s

let enemyFactionId = MY_FACTION_ID;
let playerCache = new Map();
let spyData = new Map();
let factionCache = "";
let monitorRawJson = "";
let monitorEventsJson = {};
monitorEventsJson["server_error"] = "Initiating";
monitorEventsJson["last_api_timestamp"] = 0;
monitorEventsJson["notifications"] = {};
monitorEventsJson["events"] = [];
monitorEventsJson["reminder_events"] = [];

app.use(
  cors({
    origin: "*",
  })
);

app.get("/faction", async (req, res) => {
  res.send(factionCache);
});

app.get("/cache", async (req, res) => {
  res.send(getCacheJson());
});

app.get("/spy", async (req, res) => {
  res.send(getSpyJson());
});

app.get("/monitor", async (req, res) => {
  res.send(getMonitorJson());
});

app.get("/monitor_raw", async (req, res) => {
  res.send(monitorRawJson);
});

app.listen(port, () => {
  logger(`TornRadio server start listening on port ${port}`);
});

fetchFaction(enemyFactionId);
setInterval(async () => {
  fetchFaction(enemyFactionId);
}, FETCH_FACTION_INTERVAL);

fetchSpyDoc();
setInterval(async () => {
  fetchSpyDoc();
}, FETCH_SPY_DOC_INTERVAL);

fetchAllPlayersToCache();
setInterval(async () => {
  fetchAllPlayersToCache();
}, FETCH_ALL_PLAYERS_INTERVAL);

fillTornStatsSpyToCache();
setInterval(async () => {
  fillTornStatsSpyToCache();
}, FETCH_TORNSTATS_SPY_INTERVAL);

handleMonitor();
setInterval(async () => {
  handleMonitor();
}, FETCH_MONITOR_INTERVAL);

async function handleMonitor() {
  const json = await fetchMonitor();
  if (!json) {
    monitorEventsJson["server_error"] = "Failed to fetch from Torn API";
    return;
  }
  monitorRawJson = json;
  monitorEventsJson["server_error"] = "";
  monitorEventsJson["last_api_timestamp"] = json["timestamp"];
  monitorEventsJson["notifications"] = json["notifications"];
  monitorEventsJson["events"] = createEvents(json);
  monitorEventsJson["reminder_events"] = createReminderEvents(json);
}

async function fetchMonitor() {
  let retryCount = 0;
  while (retryCount < 3) {
    retryCount++;
    await new Promise(resolve => setTimeout(resolve, API_REQUEST_DELAY));
    const selections = "basic,profile,bars,cooldowns,refills,missions,timestamp,notifications,icons";
    let res = await fetch(`https://api.torn.com/user/?selections=${selections}&key=${process.env.TORN_MONITOR_API_KEY}`);
    let json = await res.json();
    if (json["timestamp"]) {
      return json;
    } else {
      logger("Error: fetchMonitor failed and retry count " + retryCount);
    }
  }
  logger("Error: fetchMonitor failed");
  return null;
}

async function fetchSpyDoc() {
  const MAX_ROW_COUNT = 110;
  const doc = new GoogleSpreadsheet(process.env.SPY_DOC_ID);
  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_EMAIL,
    private_key: process.env.GOOGLE_KEY,
  });
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  await sheet.loadCells();

  // Read data
  for (let i = 1; i < MAX_ROW_COUNT; i++) {
    let cell = sheet.getCell(i, 1);
    if (cell.value) {
      let id = cell.value;
      let obj = new Object();
      obj.id = id;
      obj.str = sheet.getCell(i, 4).value == null || isNaN(sheet.getCell(i, 4).value) ? 0 : sheet.getCell(i, 4).value;
      obj.spd = sheet.getCell(i, 5).value == null || isNaN(sheet.getCell(i, 5).value) ? 0 : sheet.getCell(i, 5).value;
      obj.dex = sheet.getCell(i, 7).value == null || isNaN(sheet.getCell(i, 7).value) ? 0 : sheet.getCell(i, 7).value;
      obj.def = sheet.getCell(i, 6).value == null || isNaN(sheet.getCell(i, 6).value) ? 0 : sheet.getCell(i, 6).value;
      obj.total = sheet.getCell(i, 8).value == null || isNaN(sheet.getCell(i, 8).value) ? 0 : sheet.getCell(i, 8).value;
      obj.source = "Imported";
      spyData.set(id, obj);
    }
  }
  logger(`fetchSpyDoc done with spyData size = ${spyData.size}`);
}

async function fetchFaction(factionId) {
  while (true) {
    await new Promise(resolve => setTimeout(resolve, API_REQUEST_DELAY));
    let res = await fetch(`https://api.torn.com/faction/${factionId}?selections=&key=${process.env.TORN_API_KEY}`);
    let json = await res.json();
    if (json["members"]) {
      factionCache = json;
      return json;
    } else {
      logger("Error: fetchFaction " + factionId + " failed and retry");
    }
  }
}

async function fetchPlayer(playerId) {
  while (true) {
    await new Promise(resolve => setTimeout(resolve, API_REQUEST_DELAY));
    let res = await fetch(`https://api.torn.com/user/${playerId}?selections=basic,profile,personalstats,crimes&key=${process.env.TORN_API_KEY}`);
    let json = await res.json();
    if (json["player_id"] && json["player_id"] == playerId) {
      return json;
    } else {
      logger("Error: fetchPlayer " + playerId + " failed and retry");
    }
  }
}

async function fetchTornStatsSpy(factionId) {
  let retryCount = 0;
  while (retryCount < 2) {
    retryCount++;
    await new Promise(resolve => setTimeout(resolve, API_REQUEST_DELAY));
    let res = await fetch(`https://www.tornstats.com/api/v2/${process.env.TORNSTATS_API_KEY}/spy/faction/${factionId}`);
    let json = await res.json();
    if (json["status"] && json["status"] == true && json["faction"] && json["faction"]["members"]) {
      return json;
    } else {
      logger("Error: fetchTornStatsSpy " + factionId + " failed and retry count " + retryCount);
    }
  }
  return null;
}

async function fillTornStatsSpyToCache() {
  let temp = await getEnemyFactionId();
  if (temp != 0 && enemyFactionId != temp) {
    enemyFactionId = temp;
  }
  const json = await fetchTornStatsSpy(enemyFactionId);
  if (!json) {
    logger("Error: fillTornStatsSpyToCache failed to fetchTornStatsSpy " + enemyFactionId);
    return;
  }
  const members = json["faction"]["members"];
  const memberIds = Object.keys(members);
  for (let i = 0; i < memberIds.length; i++) {
    if ((!spyData.has(memberIds[i]) || spyData.get(memberIds[i]).source != "Imported") && (members[memberIds[i]]["spy"] && members[memberIds[i]]["spy"]["timestamp"])) {
      let obj = new Object();
      obj.id = memberIds[i];
      obj.str = members[memberIds[i]]["spy"]["strength"] ? members[memberIds[i]]["spy"]["strength"] : 0;
      obj.spd = members[memberIds[i]]["spy"]["speed"] ? members[memberIds[i]]["spy"]["speed"] : 0;
      obj.dex = members[memberIds[i]]["spy"]["dexterity"] ? members[memberIds[i]]["spy"]["dexterity"] : 0;
      obj.def = members[memberIds[i]]["spy"]["defense"] ? members[memberIds[i]]["spy"]["defense"] : 0;
      obj.total = members[memberIds[i]]["spy"]["total"] ? members[memberIds[i]]["spy"]["total"] : 0;
      obj.source = members[memberIds[i]]["spy"]["timestamp"];
      spyData.set(memberIds[i], obj);
    }
  }
  logger(`fillTornStatsSpyToCache done with spyData size = ${spyData.size}`);
}

async function getEnemyFactionId() {
  const json = await fetchFaction(MY_FACTION_ID);
  let rwJson = json["ranked_wars"];
  if (Object.keys(rwJson).length <= 0) {
    return 0;
  }
  let keys = Object.keys(rwJson[Object.keys(rwJson)[0]]["factions"]);
  let enemyFactionId = parseInt(keys[0]) == parseInt(MY_FACTION_ID) ? parseInt(keys[1]) : parseInt(keys[0]);
  return enemyFactionId;
}

async function fetchAllPlayersToCache() {
  let temp = await getEnemyFactionId();
  if (temp != 0 && enemyFactionId != temp) {
    enemyFactionId = temp;
    playerCache.clear();
    spyData.clear();
  }
  const factionJson = await fetchFaction(enemyFactionId);
  const memberIds = Object.keys(factionJson.members);
  for (let i = 0; i < memberIds.length; i++) {
    if (!playerCache.has(memberIds[i])) {
      playerCache.set(memberIds[i], await fetchPlayer(memberIds[i]));
    }
  }
  logger("fetchAllPlayersToCache done with playerCache size = " + playerCache.size);
}

function getCacheJson() {
  let obj = {};
  playerCache.forEach((value, key) => {
    obj[key] = value;
  });
  return JSON.stringify(obj);
}

function getSpyJson() {
  let obj = {};
  spyData.forEach((value, key) => {
    obj[key] = value;
  });
  return JSON.stringify(obj);
}

function getMonitorJson() {
  return JSON.stringify(monitorEventsJson);
}
