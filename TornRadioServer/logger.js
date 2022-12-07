import moment from "moment-timezone";
import fs from "fs";

function logger(string) {
  const time = moment().tz("Asia/Shanghai").format("YYYY-MM-DD HH:mm:ss");
  console.log(time + " " + string);

  fs.appendFile("log.txt", time + " " + string + "\n", (err) => {
    if (err) {
      console.log(err);
    }
  });
}

export default logger;
