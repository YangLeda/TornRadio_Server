import fetch from "node-fetch";
import express from "express";
import cors from "cors";
import logger from "./logger.js";
import {GoogleSpreadsheet} from "google-spreadsheet";

const app = express();
const port = 3001;
const SCHEDULE_INTERVAL = 600000;  // Fetch member details every 10 minutes
const FACTION_ID_1 = "13737";
const TORN_API_KEY = "";
const GOOGLE_API_KEY = "";
const DOC_ID = "";

// CORS
app.use(
  cors({
    origin: "*",
  })
);

const doc = new GoogleSpreadsheet(GOOGLE_API_KEY);
doc.useApiKey(DOC_ID);
await doc.loadInfo(); // loads document properties and worksheets
console.log(doc.title);

// faction API
app.get("/faction", async (req, res) => {
  logger(`faction API access ${req.ip}`);
  let factionId = req.query.id ? req.query.id : FACTION_ID_1;
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

async function fetchFaction(factionId) {
  try {
    const res = await fetch(`https://api.torn.com/faction/${factionId}?selections=&key=${TORN_API_KEY}`);
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
      const res = await fetch(`https://api.torn.com/user/${memberIds[requestCount]}?selections=basic,profile,personalstats,crimes&key=${TORN_API_KEY}`);
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
