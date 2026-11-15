const dns = require("node:dns")
dns.setServers(["8.8.8.8", "8.8.4.4"]);
require("dotenv").config();
const app = require("./src/app")
const connectdb = require("./src/db/db")

const http = require("http")
const { Server} = require("socket.io")
const server = http.createServer(app)
const socketauth = require("./src/middleware/socket.middleware")
const meetingsocket = require("./src/socket/socket")


const io = new Server(server, {
    cors: {
        origin: app.get("frontendOrigin"),
        methods: ["GET", "POST"],
        credentials: true
    }
});
app.set("io", io);
io.use(socketauth);

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    meetingsocket(io,socket);

    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
    });
});


async function startServer() {
    if (!process.env.JWT_SECRET_KEY) {
        throw new Error("JWT_SECRET_KEY environment variable is required");
    }

    await connectdb();
    const port = process.env.PORT || 3000;
    server.listen(port, "0.0.0.0", () => {
        console.log(`Server is listening on port ${port}`);
    });
}

startServer().catch((error) => {
    console.error("Server startup failed:", error);
    process.exitCode = 1;
});