const userModel = require("../model/user.model");
const blacklistModel = require("../model/blacklist.model");
const jwt = require("jsonwebtoken");

async function requireUser(req, res, next) {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
    const token = bearerToken || req.cookies?.token;
    if (!token) {
        return res.status(401).json({
            message: "TOKEN IS REQUIRED FOR AUTHENTICATION.",
        });
    }
    try {
        const blacklistedToken = await blacklistModel.findOne({ token });
        if (blacklistedToken) {
            return res.status(401).json({
                message: "TOKEN IS BLACKLISTED. TRY AGAIN.",
            });
        }
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET_KEY);
        const user = await userModel.findById(decodedToken.id);
        if (!user) {
            return res.status(401).json({
                message: "USER IS NOT FOUND.",
            });
        }
        if (!user.isVerified) {
            return res.status(403).json({
                message: "EMAIL VERIFICATION IS REQUIRED TO ACCESS THIS RESOURCE.",
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error("AUTHENTICATION FAILED", error);
        if (["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(error.name)) {
            return res.status(401).json({
                message: "TOKEN IS INVALID. PLEASE LOGIN AGAIN.",
            });
        }
        return res.status(500).json({
            message: "FAILED TO AUTHENTICATE REQUEST.",
        });
    }
}
module.exports = { requireUser };