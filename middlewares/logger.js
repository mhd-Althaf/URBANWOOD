const morgan = require("morgan");
const fs = require("fs");
const path = require("path");

const logDirectory = path.join(__dirname, "../logs");

if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
}

const logStream = fs.createWriteStream(path.join(logDirectory, "access.log"), { flags: "a" });

const logger = morgan("combined", { stream: logStream });

module.exports = logger;