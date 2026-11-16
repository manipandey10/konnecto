const express = require("express");
const authRouter = require("./route/auth.route");
const meetingRouter = require("./route/meeting.route");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const path = require("node:path");
const frontendBuild = path.join(__dirname, "../../frontend/dist");
const backendPublic = path.join(__dirname, "../public");

const app = express();
const frontendOrigin = process.env.FRONTEND_URL || "http://localhost:5173";
app.set("frontendOrigin", frontendOrigin);
app.use(cors({
    origin: frontendOrigin,
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                upgradeInsecureRequests: null,
            },
        },
        hsts: false,
    }),
);
app.use(express.static(frontendBuild));
app.use(express.static(backendPublic));
app.use("/api/user", authRouter);
app.use("/api/meeting", meetingRouter);
module.exports = app;