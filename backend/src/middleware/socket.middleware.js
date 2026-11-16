const userModel = require("../model/user.model");
const jwt = require("jsonwebtoken");

async function authenticateSocket(socket, next) {
    const token = socket.handshake.auth?.token ||
        socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) {
        return next(new Error("TOKEN IS REQUIRED FOR AUTHENTICATION."));
    }
    try {
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET_KEY);
        const user = await userModel.findById(decodedToken.id);
        if (!user) {
            return next(new Error("AUTHENTICATED USER IS NOT FOUND."));
        }
        socket.user = user;
        socket.data.userId = user._id.toString();
        next();
    } catch (error) {
        return next(new Error("AUTHENTICATION TOKEN IS INVALID."));
    }
}
module.exports = authenticateSocket;