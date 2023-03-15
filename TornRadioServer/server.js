import * as dotenv from 'dotenv'
dotenv.config();
import fetch from "node-fetch";
import express from "express";
import cors from "cors";
import logger from "./logger.js";
import { GoogleSpreadsheet } from "google-spreadsheet";

const app = express();
const port = 3001;
const MY_FACTION_ID = 41066;
const FETCH_MEMBER_DETAILS_INTERVAL = 300000;  // 5 minutes
const FETCH_SPY_DOC_INTERVAL = 180000;  // 3 minutes

let enemyFactionId = MY_FACTION_ID;
let playerCache = new Map();
let spyData = new Map();

logger("start");

fetchSpyDoc();
setInterval(async () => {
  fetchSpyDoc();
}, FETCH_SPY_DOC_INTERVAL);

fetchAllFactionMembersToCache();
setInterval(async () => {
  fetchAllFactionMembersToCache();
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
  res.send(await fetchFaction(enemyFactionId));
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
  const MAX_ROW_COUNT = 110;
  const doc = new GoogleSpreadsheet(process.env.SPY_DOC_ID);
  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_EMAIL,
    private_key: process.env.GOOGLE_KEY,
  });
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  logger(`fetchSpyDoc ${doc.title} ${sheet.title} ${sheet.rowCount}`);
  await sheet.loadCells();

  // Build name-row map from sheet. Also clear "J" and "K1".
  let nameToRowIndexMap = new Map();
  for (let i = 0; i < MAX_ROW_COUNT; i++) {
    let cell = sheet.getCell(i, 0);
    if (typeof (cell.value) === "string" && cell.value.indexOf("[") > 0 && cell.value.indexOf("]") > 0 && !isNaN(cell.value.substring(cell.value.indexOf("[") + 1, cell.value.indexOf("]")))) {
      nameToRowIndexMap.set(cell.value.substring(0, cell.value.indexOf("[")), i);
      sheet.getCell(i, 9).value = "";
    }
  }
  sheet.getCellByA1("K1").value = "";

  // Read input raw string at "I1", parse and write them back as single lines.
  let rawStr = sheet.getCellByA1("I1").value;
  if (!rawStr) {
    rawStr = "";
    sheet.getCellByA1("I1").value = "Put raw spy data string here.";
  }
  const treatedRawStr = rawStr.replace(/,/g, "").replace(/\n/g, " ").replace(/\[/g, " [");  // Treat the whole raw string with replace() here to support more formats.
  sheet.getCellByA1("K1").value = treatedRawStr;
  let words = treatedRawStr.split(" ");
  let playerRow = -1;
  let playerLine = "";
  let singleLineRowIndexes = [];
  words.forEach((word) => {
    if (nameToRowIndexMap.has(word)) {
      if (playerRow > 0) {
        sheet.getCell(playerRow, 9).value = playerLine.replace(/\s+/g, " ");
        singleLineRowIndexes.push(playerRow);
      }
      playerRow = nameToRowIndexMap.get(word);
      playerLine = word;
    } else {
      playerLine += " " + word;
    }
  });
  if (playerRow > 0) {
    sheet.getCell(playerRow, 9).value = playerLine.replace(/\s+/g, " ");
    singleLineRowIndexes.push(playerRow);
  }
  await sheet.saveUpdatedCells();
  await sheet.loadCells();
  logger(`fetchSpyDoc Filled single lines number: ${singleLineRowIndexes.length}`);

  // Parse single lines and fill cells.
  singleLineRowIndexes.forEach((rowIndex) => {
    let line = sheet.getCell(rowIndex, 9).value + " ";
    let matches = line.match(/Strength: \d+ /g);
    if (matches && matches.length == 1) {
      sheet.getCell(rowIndex, 2).value = parseInt(matches[0].substring(10, matches[0].length - 1));
      sheet.getCell(rowIndex, 2).textFormat = { bold: true };
    }
    matches = line.match(/Strength: N\/A /g);
    if (matches && matches.length == 1) {
      sheet.getCell(rowIndex, 2).value = "N/A";
      sheet.getCell(rowIndex, 2).textFormat = { bold: true };
    }
    matches = line.match(/Speed: \d+ /g);
    if (matches && matches.length == 1) {
      sheet.getCell(rowIndex, 3).value = parseInt(matches[0].substring(7, matches[0].length - 1));
      sheet.getCell(rowIndex, 3).textFormat = { bold: true };
    }
    matches = line.match(/Speed: N\/A /g);
    if (matches && matches.length == 1) {
      sheet.getCell(rowIndex, 3).value = "N/A";
      sheet.getCell(rowIndex, 3).textFormat = { bold: true };
    }
    matches = line.match(/Dexterity: \d+ /g);
    if (matches && matches.length == 1) {
      sheet.getCell(rowIndex, 4).value = parseInt(matches[0].substring(11, matches[0].length - 1));
      sheet.getCell(rowIndex, 4).textFormat = { bold: true };
    }
    matches = line.match(/Dexterity: N\/A /g);
    if (matches && matches.length == 1) {
      sheet.getCell(rowIndex, 4).value = "N/A";
      sheet.getCell(rowIndex, 4).textFormat = { bold: true };
    }
    matches = line.match(/Defense: \d+ /g);
    if (matches && matches.length == 1) {
      sheet.getCell(rowIndex, 5).value = parseInt(matches[0].substring(9, matches[0].length - 1));
      sheet.getCell(rowIndex, 5).textFormat = { bold: true };
    }
    matches = line.match(/Defense: N\/A /g);
    if (matches && matches.length == 1) {
      sheet.getCell(rowIndex, 5).value = "N/A";
      sheet.getCell(rowIndex, 5).textFormat = { bold: true };
    }
    matches = line.match(/Total: \d+ /g);
    if (matches && matches.length == 1) {
      sheet.getCell(rowIndex, 6).value = parseInt(matches[0].substring(7, matches[0].length - 1));
      sheet.getCell(rowIndex, 6).textFormat = { bold: true };
    }
    matches = line.match(/Total: N\/A /g);
    if (matches && matches.length == 1) {
      sheet.getCell(rowIndex, 6).value = "N/A";
      sheet.getCell(rowIndex, 6).textFormat = { bold: true };
    }
  });
  await sheet.saveUpdatedCells();
  await sheet.loadCells();
  logger(`fetchSpyDoc Filled table`);

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

async function fetchAllFactionMembersToCache() {
  logger("fetchAllFactionMembersToCache() start");
  let temp = await fetchEnemyFactionId();
  if (temp != -1 && enemyFactionId != temp) {
    enemyFactionId = temp;
    playerCache.clear();
    logger("fetchAllFactionMembersToCache() enemy faction ID changed, clear playerCache map");
  }
  const factionJson = await fetchFaction(enemyFactionId);
  const memberIds = Object.keys(factionJson.members);

  const MAX_REQUEST_NUM = 150;
  const API_REQUEST_DELAY = 1000;
  let requestCount = 0;
  const timerId = setInterval(async () => {
    if (!playerCache.has(memberIds[requestCount])) {
      try {
        const res = await fetch(`https://api.torn.com/user/${memberIds[requestCount]}?selections=basic,profile,personalstats,crimes&key=${process.env.TORN_API_KEY}`);
        const json = await res.json();
        cachePlayer(memberIds[requestCount], json);
      } catch (err) {
        logger(err);
      }
    } else {
      logger("Skip fetch player because already in cache " + memberIds[requestCount]);
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
    logger("cachePlayer error: possible API server error " + id);
    return;
  }
  if (data["player_id"] != id) {
    logger("cachePlayer error: missmatched id, possible API server error " + id);
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

async function fetchEnemyFactionId() {
  try {
    const res = await fetch(`https://api.torn.com/faction/${MY_FACTION_ID}?selections=basic&key=${process.env.TORN_API_KEY}`);
    const json = await res.json();
    if (!json) {
      logger("fetchEnemyFactionId Empty json");
      return -1;
    }
    if (json["ranked_wars"] == undefined) {
      logger("fetchEnemyFactionId Failed to read json");
      return -1;
    }
    let rwJson = json["ranked_wars"];
    if (Object.keys(rwJson).length <= 0 || Object.keys(rwJson)[0] == undefined) {
      logger("fetchEnemyFactionId Failed to read rwJson");
      return -1;
    }
    let keys = Object.keys(rwJson[Object.keys(rwJson)[0]]["factions"]);
    let enemyFactionId = parseInt(keys[0]) == parseInt(MY_FACTION_ID) ? parseInt(keys[1]) : parseInt(keys[0]);
    logger("fetchEnemyFactionId result = " + enemyFactionId);
    return enemyFactionId;
  } catch (err) {
    logger(err);
  }
}
