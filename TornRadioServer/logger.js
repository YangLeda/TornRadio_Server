import moment from "moment-timezone";

function logger(string) {
  console.log(moment().tz("Asia/Shanghai").format("YYYY-MM-DD HH:mm:ss") + " " + string);
}

export default logger;
