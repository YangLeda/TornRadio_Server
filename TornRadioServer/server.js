import * as dotenv from 'dotenv'
dotenv.config();
import fetch from "node-fetch";
import express from "express";
import cors from "cors";
import logger from "./logger.js";
import { GoogleSpreadsheet } from "google-spreadsheet";

const app = express();
const port = 3001;
const FETCH_MEMBER_DETAILS_INTERVAL = 300000;  // 5 minutes
const FETCH_SPY_DOC_INTERVAL = 300000;  // 5 minutes

let playerCache = new Map();
let spyData = new Map();

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

// spy API
app.get("/spy", async (req, res) => {
  logger(`spy API access ${req.ip}`);
  res.send(getSpyJson());
});

app.listen(port, () => {
  logger(`TornRadio server start listening on port ${port}`);
});

async function fetchSpyDoc() {
  logger("fetchSpyDoc start");
  const MAX_ROW_COUNT = 200;
  const doc = new GoogleSpreadsheet(process.env.SPY_DOC_ID);
  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_EMAIL,
    private_key: process.env.GOOGLE_KEY,
  });
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  logger(`fetchSpyDoc ${doc.title} ${sheet.title} ${sheet.rowCount}`);
  await sheet.loadCells();

  // Clear colomn "I".
  for (let i = 0; i < MAX_ROW_COUNT; i++) {  // each row
    let cell = sheet.getCell(i, 0);
    if (typeof (cell.value) === "string" && cell.value.indexOf("[") > 0 && cell.value.indexOf("]") > 0 && !isNaN(cell.value.substring(cell.value.indexOf("[") + 1, cell.value.indexOf("]")))) {
      sheet.getCell(i, 8).value = "";
    }
  }
  await sheet.saveUpdatedCells();
  await sheet.loadCells();

  // Read multi-line raw string at "J1". Fill column "I". Log failure at "K1".
  const rawStr = sheet.getCellByA1("J1").value;
  logger("Raw str lines: " + rawStr.split("\n").length);
  let failedListStr = "Failed raw strings: \n";
  rawStr.split("\n").forEach((line) => {
    let isFound = -1;
    let words = line.split(" ");
    for (let i = 0; i < words.length && isFound < 0; i++) {  // each word in raw string line
      for (let j = 0; j < MAX_ROW_COUNT; j++) {  // each row
        let cell = sheet.getCell(j, 0);
        if (typeof (cell.value) === "string" && cell.value.indexOf("[") > 0 && cell.value.indexOf("]") > 0 && !isNaN(cell.value.substring(cell.value.indexOf("[") + 1, cell.value.indexOf("]")))) {
          if (cell.value.substring(0, cell.value.indexOf("[")) == words[i]) {
            logger("Found name: " + words[i]);
            sheet.getCell(j, 8).value = line;
            isFound = j;
          }
        }
      }
    }
    if (isFound < 0) {
      failedListStr += line + "\n";
    }
  });
  sheet.getCellByA1("K1").value = failedListStr;
  await sheet.saveUpdatedCells();
  await sheet.loadCells();

  // Parse numbers and fill cells
  for (let i = 0; i < MAX_ROW_COUNT; i++) {  // each row
    let cellId = sheet.getCell(i, 0);
    let cellParsedLine = sheet.getCell(i, 8);
    if (typeof (cellParsedLine.value) == "string" && cellParsedLine.value != "" && typeof (cellId.value) === "string" && cellId.value.indexOf("[") > 0 && cellId.value.indexOf("]") > 0 && !isNaN(cellId.value.substring(cellId.value.indexOf("[") + 1, cellId.value.indexOf("]")))) {
      // logger("line: " + line);
      // logger(typeof line);
      // const searchRegExp = /,/g;
      let line = cellParsedLine.value.replace(/,/g, "");
      let matches = line.match("/\d+/g");
      if (matches.length >= 4 && matches.length <= 5) {
        for (let j = 0; j < matches.length; j++) {
          sheet.getCell(isFound, j + 2).value = matches[i];
          sheet.getCell(isFound, j + 2).textFormat = { bold: true };
        }
      } else {
        logger("too little or too many numbers muched for line: " + line);
      }
    }
  }
  await sheet.saveUpdatedCells();
  await sheet.loadCells();

  // Read data
  for (let i = 0; i < MAX_ROW_COUNT; i++) {  // each row
    let cell = sheet.getCell(i, 0);
    if (typeof (cell.value) === "string" && cell.value.indexOf("[") > 0 && cell.value.indexOf("]") > 0 && !isNaN(cell.value.substring(cell.value.indexOf("[") + 1, cell.value.indexOf("]")))) {
      let id = cell.value.substring(cell.value.indexOf("[") + 1, cell.value.indexOf("]"));
      let obj = new Object();
      obj.id = id;
      obj.str = sheet.getCell(i, 2).value == null || isNaN(sheet.getCell(i, 2).value) ? 0 : sheet.getCell(i, 2).value;
      obj.spd = sheet.getCell(i, 3).value == null || isNaN(sheet.getCell(i, 3).value) ? 0 : sheet.getCell(i, 3).value;
      obj.dex = sheet.getCell(i, 4).value == null || isNaN(sheet.getCell(i, 4).value) ? 0 : sheet.getCell(i, 4).value;
      obj.def = sheet.getCell(i, 5).value == null || isNaN(sheet.getCell(i, 5).value) ? 0 : sheet.getCell(i, 5).value;
      obj.total = sheet.getCell(i, 6).value == null || isNaN(sheet.getCell(i, 6).value) ? 0 : sheet.getCell(i, 6).value;
      spyData.set(id, obj);
    }
  }
  logger(`fetchSpyDoc done with spyData size = ${spyData.size}`);
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

  const MAX_REQUEST_NUM = 150;
  const API_REQUEST_DELAY = 1500;
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
  if (data["player_id"] == undefined) {
    logger("cachePlayer error: possible API server error" + id);
    return;
  }
  if (data["player_id"] != id) {
    logger("cachePlayer error: missmatched id, possible API server error" + id);
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

function getSpyJson() {
  let obj = {};
  spyData.forEach((value, key) => {
    obj[key] = value;
  });
  return JSON.stringify(obj);
}