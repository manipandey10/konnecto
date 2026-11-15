const express = require("express")
const authrouter = require("../src/route/auth.route")
const meetingrouter = require("../src/route/meeting.route")
const cookieparser = require("cookie-parser");
const cors = require("cors")
const helmet = require("helmet");
const path = require("node:path")
const frontendBuild = path.join(__dirname, "../../frontend/dist")
const backendPublic = path.join(__dirname, "../public")


const app = express()
app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
}));
app.use(express.json());
app.use(cookieparser());



app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        upgradeInsecureRequests: null,
      },
    },
    hsts: false,
  })
);
app.use(express.static(frontendBuild));
app.use(express.static(backendPublic));
app.use("/api/user",authrouter)
app.use("/api/meeting",meetingrouter)
module.exports = app;