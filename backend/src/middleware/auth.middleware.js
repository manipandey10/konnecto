const usermodel = require("../model/user.model")
const blacklistedmodel = require("../model/blacklist.model")
const jwt = require("jsonwebtoken")

async function uservalid(req,res,next){
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
    const token = bearerToken || req.cookies?.token;
    if(!token){
        return res.status(401).json({
            message:"TOKEN IS REQUIRED FOR AUTHENTICATION."
        })
    }
    try{
        const isblacklistedtoken = await blacklistedmodel.findOne({ token });
        if(isblacklistedtoken){
            return res.status(401).json({
                message:"TOKEN IS BLACKLISTED. TRY AGAIN."
            })
        }
        const decoded = jwt.verify(token,process.env.JWT_SECRET_KEY);
        const user = await usermodel.findById(decoded.id);
        if(!user){
            return res.status(401).json({
                message :"USER IS NOT FOUND."
            })
        }

        req.user = user;
        next();
    }catch(err){
        console.error("AUTHENTICATION FAILED",err);
        if(["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(err.name)){
            return res.status(401).json({
                message:"TOKEN IS INVALID. PLEASE LOGIN AGAIN."
            })
        }
        return res.status(500).json({
            message:"FAILED TO AUTHENTICATE REQUEST."
        })
    }
}
module.exports = {uservalid} 