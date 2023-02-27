import * as dotenv from 'dotenv'
dotenv.config();
import fetch from "node-fetch";
import express from "express";
import cors from "cors";
import logger from "./logger.js";
import fs from "fs";

const app = express();
const port = 3001;
const FETCH_MAP_INTERVAL = 1200000;  // 20 minutes

let mapData = {};
mapData.msg = "";
let factionNameCache = new Map();
factionNameCache.set(0, { "name": "Unclaimed Territory", "tag": "0-0.png" });

app.use(
  cors({
    origin: "*",
  })
);

app.get("/map", async (req, res) => {
  res.send(JSON.stringify(mapData));
});

app.listen(port, () => {
  logger(`TornRadio server start listening on port ${port}`);
});

fetchMapToCache();
setInterval(async () => {
  fetchMapToCache();
}, FETCH_MAP_INTERVAL);

async function fetchMapToCache() {
  logger("fetchMap start");

  let mapJson = await fetchMap();
  mapJson.msg = mapData.msg;
  logger("fetchMap 1/4 fetch territory map done " + Object.keys(mapJson["territory"]).length);
  let warJson = await fetchWar();
  logger("fetchMap 2/4 fetch territory wars done " + Object.keys(warJson["territorywars"]).length);
  for (const key of Object.keys(warJson["territorywars"])) {
    let defName;
    let defTag;
    let assName;
    let assTag;
    if (factionNameCache.has(warJson["territorywars"][key]["defending_faction"])) {
      defName = factionNameCache.get(warJson["territorywars"][key]["defending_faction"])["name"];
      defTag = factionNameCache.get(warJson["territorywars"][key]["defending_faction"])["tag"];
    } else {
      let faction = await fetchFaction(warJson["territorywars"][key]["defending_faction"]);
      defName = faction["name"];
      defTag = faction["tag_image"];
      factionNameCache.set(warJson["territorywars"][key]["defending_faction"], { "name": defName, "tag": defTag });
      logger("fetchMap 3/4 cache size:" + factionNameCache.size);
    }
    if (factionNameCache.has(warJson["territorywars"][key]["assaulting_faction"])) {
      assName = factionNameCache.get(warJson["territorywars"][key]["assaulting_faction"])["name"];
      assTag = factionNameCache.get(warJson["territorywars"][key]["assaulting_faction"])["tag"];
    } else {
      let faction = await fetchFaction(warJson["territorywars"][key]["assaulting_faction"]);
      assName = faction["name"];
      assTag = faction["tag_image"];
      factionNameCache.set(warJson["territorywars"][key]["assaulting_faction"], { "name": assName, "tag": assTag });
      logger("fetchMap 3/4 cache size:" + factionNameCache.size);
    }
    mapJson["territory"][key]["assaulting_faction"] = warJson["territorywars"][key]["assaulting_faction"];
    mapJson["territory"][key]["assaulting_faction_name"] = assName;
    mapJson["territory"][key]["assaulting_faction_tag"] = assTag;
    mapJson["territory"][key]["defending_faction"] = warJson["territorywars"][key]["defending_faction"];
    mapJson["territory"][key]["defending_faction_name"] = defName;
    mapJson["territory"][key]["defending_faction_tag"] = defTag;
  }
  if (!mapData["territory"]) {
    mapData = mapJson;
  }
  logger("fetchMap 3/4 fetch warring factions details done");
  for (const key of Object.keys(mapJson["territory"])) {
    let name;
    let tag;
    if (factionNameCache.has(mapJson["territory"][key]["faction"])) {
      name = factionNameCache.get(mapJson["territory"][key]["faction"])["name"];
      tag = factionNameCache.get(mapJson["territory"][key]["faction"])["tag"];
    } else {
      let faction = await fetchFaction(mapJson["territory"][key]["faction"]);
      name = faction["name"];
      tag = faction["tag_image"];
      factionNameCache.set(mapJson["territory"][key]["faction"], { "name": name, "tag": tag });
      logger("fetchMap 4/4 cache size:" + factionNameCache.size);
    }
    mapJson["territory"][key]["name"] = name;
    mapJson["territory"][key]["tag"] = tag;

    if (mapData["territory"] && mapData["territory"][key] && mapData["territory"][key]["name"] && mapData["territory"][key]["name"] != name) {
      let string = new Date().toUTCString() + " " + key + ": from " + mapData["territory"][key]["name"] + " to " + name + "\n";
      mapJson.msg = string + mapJson.msg;
      fs.appendFile("log_change.txt", string, (err) => {
        if (err) {
          console.log(err);
        }
      });
      logger("fetchMap 4/4 found ownership change: " + string);
    }
  }
  logger("fetchMap 4/4 fetch all factions details done");
  mapData = mapJson;
}

async function fetchMap() {
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 200));
    let res = await fetch(`https://api.torn.com/torn/?selections=territory&key=${process.env.TORN_API_KEY}`);
    let mapJson = await res.json();
    if (mapJson["territory"]) {
      return mapJson;
    } else {
      logger("fetchMap 1/4 failed and retry");
    }
  }
}

async function fetchWar() {
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 200));
    let res = await fetch(`https://api.torn.com/torn/?selections=territorywars&key=${process.env.TORN_API_KEY}`);
    let warJson = await res.json();
    if (warJson["territorywars"]) {
      return warJson;
    } else {
      logger("fetchMap 2/4 failed and retry");
    }
  }
}

async function fetchFaction(fationId) {
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 200));
    let res = await fetch(`https://api.torn.com/faction/${fationId}?selections=&key=${process.env.TORN_API_KEY}`);
    let factionJson = await res.json();
    if (factionJson["name"]) {
      return factionJson;
    } else {
      logger("fetchMap fetchFaction failed and retry " + fationId);
    }
  }
}
