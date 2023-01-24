import * as dotenv from 'dotenv'
dotenv.config()
import fetch from "node-fetch";
import express from "express";
import cors from "cors";
import logger from "./logger.js";
import {GoogleSpreadsheet} from "google-spreadsheet";

const app = express();
const port = 3001;
const FETCH_MEMBER_DETAILS_INTERVAL = 600000;  // 10 minutes
const FETCH_SPY_DOC_INTERVAL = 300000;  // 5 minutes

let playerCache = new Map();

logger("start");

fetchSpyDoc();
setInterval(async () => {
  fetchSpyDoc();
}, FETCH_SPY_DOC_INTERVAL);

fetchAllFactionMembersToCache(process.env.FACTION_ID);
setInterval(async () => {
  fetchAllFactionMembersToCache(process.env.FACTION_ID);
}, FETCH_MEMBER_DETAILS_INTERVAL);

// CORS
app.use(
  cors({
    origin: "*",
  })
);

// faction API
app.get("/faction", async (req, res) => {
  logger(`faction API access ${req.ip}`);
  let factionId = req.query.id ? req.query.id : process.env.FACTION_ID;
  res.send(await fetchFaction(factionId));
});

// cache API
app.get("/cache", async (req, res) => {
  logger(`cache API access ${req.ip}`);
  res.send(getCacheJson());
});

// player API
app.get("/player", async (req, res) => {
  logger(`player API access ${req.ip}`);
  res.send("hello world");
});

app.listen(port, () => {
  logger(`TornRadio server start listening on port ${port}`);
});

async function fetchSpyDoc() {
  logger("fetchSpyDoc start");
  const doc = new GoogleSpreadsheet(process.env.SPY_DOC_ID);
  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_EMAIL,
    private_key: process.env.GOOGLE_KEY,
  });
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  logger(`fetchSpyDoc ${doc.title} ${sheet.title} ${sheet.rowCount}`);
  await sheet.loadCells();
  for (let i = 0; i < sheet.rowCount; i++) {  // each row
    const cell = sheet.getCell(i, 0);
    console.log(cell.value);
}

async function fetchFaction(factionId) {
  try {
    const res = await fetch(`https://api.torn.com/faction/${factionId}?selections=&key=${process.env.TORN_API_KEY}`);
    const json = await res.json();
    let memberSize = Object.keys(json.members).length;
    memberSize = memberSize ? memberSize : "error";
    logger("fetchFaction done with memberSize " + memberSize);
    return json;
  } catch (err) {
    logger(err);
  }
}

async function fetchAllFactionMembersToCache(factionId) {
  logger("fetchAllFactionMembersToCache() start " + factionId);
  const factionJson = await fetchFaction(factionId);
  const memberIds = Object.keys(factionJson.members);

  const MAX_REQUEST_NUM = 100;
  const API_REQUEST_DELAY = 3000;
  let requestCount = 0;
  const timerId = setInterval(async () => {
    try {
      const res = await fetch(`https://api.torn.com/user/${memberIds[requestCount]}?selections=basic,profile,personalstats,crimes&key=${process.env.TORN_API_KEY}`);
      const json = await res.json();
      cachePlayer(memberIds[requestCount], json);
    } catch (err) {
      logger(err);
    }

    requestCount++;
    if (requestCount > MAX_REQUEST_NUM) {
      logger("fetchAllFactionMembersToCache stopped because MAX_REQUEST_NUM reached.");
      clearInterval(timerId);
    }
    if (requestCount > memberIds.length - 1) {
      logger("fetchAllFactionMembersToCache finished.");
      clearInterval(timerId);
    }
  }, API_REQUEST_DELAY);
}

function cachePlayer(id, data) {
  if (!id || !data) {
    logger("cachePlayer failed due to invalid data. Current cache length: " + playerCache.size);
    return;
  }
  if (data["level"] == undefined) {
    logger("cachePlayer error: " + id);
    return;
  }
  playerCache.set(id, data);
  logger("cachePlayer done. Current cache length: " + playerCache.size);
}

function getCacheJson() {
  let obj = {};
  playerCache.forEach((value, key) => {
    obj[key] = value;
  });
  return JSON.stringify(obj);
}
