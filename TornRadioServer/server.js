import * as dotenv from 'dotenv'
dotenv.config();
import fetch from "node-fetch";
import express from "express";
import cors from "cors";
import logger from "./logger.js";
import { GoogleSpreadsheet } from "google-spreadsheet";

const app = express();
const port = 3001;
const MY_FACTION_ID = process.env.FACTION_ID;
const API_REQUEST_DELAY = 200;
const FETCH_ALL_PLAYERS_INTERVAL = 3600000;  // 1 hour
const FETCH_SPY_DOC_INTERVAL = 180000;  // 3 minutes

let enemyFactionId = MY_FACTION_ID;
let playerCache = new Map();
let spyData = new Map();

logger("start");

app.use(
  cors({
    origin: "*",
  })
);

app.get("/faction", async (req, res) => {
  res.send(await fetchFaction(enemyFactionId));
});

app.get("/cache", async (req, res) => {
  logger(`cache API access ${req.ip}`);
  res.send(getCacheJson());
});

app.get("/spy", async (req, res) => {
  res.send(getSpyJson());
});

app.listen(port, () => {
  logger(`TornRadio server start listening on port ${port}`);
});

fetchSpyDoc();
setInterval(async () => {
  fetchSpyDoc();
}, FETCH_SPY_DOC_INTERVAL);

fetchAllPlayersToCache();
setInterval(async () => {
  fetchAllPlayersToCache();
}, FETCH_ALL_PLAYERS_INTERVAL);

async function fetchSpyDoc() {
  logger("fetchSpyDoc start");
  const MAX_ROW_COUNT = 110;
  const doc = new GoogleSpreadsheet(process.env.SPY_DOC_ID);
  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_EMAIL,
    private_key: process.env.GOOGLE_KEY,
  });
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  logger(`fetchSpyDoc from ${doc.title} | ${sheet.title} | ${sheet.rowCount}`);
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
      return json;
    } else {
      logger("fetchFaction " + factionId + " failed and retry");
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
      logger("fetchPlayer " + playerId + " failed and retry");
    }
  }
}

async function getEnemyFactionId() {
  const json = await fetchFaction(MY_FACTION_ID);
  let rwJson = json["ranked_wars"];
  if (Object.keys(rwJson).length <= 0) {
    logger("getEnemyFactionId no current RW");
    return 0;
  }
  let keys = Object.keys(rwJson[Object.keys(rwJson)[0]]["factions"]);
  let enemyFactionId = parseInt(keys[0]) == parseInt(MY_FACTION_ID) ? parseInt(keys[1]) : parseInt(keys[0]);
  return enemyFactionId;
}

async function fetchAllPlayersToCache() {
  logger("fetchAllPlayersToCache() start");
  let temp = await getEnemyFactionId();
  if (temp != 0 && enemyFactionId != temp) {
    enemyFactionId = temp;
    playerCache.clear();
    logger("fetchAllPlayersToCache enemy faction ID changed, clear playerCache map");
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
