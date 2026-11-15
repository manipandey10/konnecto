const usermodel = require("../model/user.model")
const emailservice = require("../service/email.service")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")
const blacklistedmodel = require("../model/blacklist.model")
const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
};

async function userregister(req,res){
    const{name,email,password} = req.body
    if(!name || !email || !password){
        return res.status(400).json({
            message:"FOR CREATE A NEW ACCOUNT ALL THE INFORMATION IS REQUIRED.",
        })
    }
    const isUseralreadyexist = await usermodel.findOne({
        $or:[
            {email},
            {name}
        ]
    })
    if(isUseralreadyexist){
        return res.status(400).json({
            message:"User Already exist. PLS CREATE NEW ACCOUNT."
        })
    }
    const hashpassword = await bcrypt.hash(password,10)
    const user = await usermodel.create({
        name,
        email,
        password:hashpassword,

    })
    const token = jwt.sign({
        id:user._id,

    },process.env.JWT_SECRET_KEY )

    res.cookie("token", token, cookieOptions)
    return res.status(201).json({
        message:"User Created Scessfully",
        token,
        user:{
            name:user.name,
            email:user.email,

        }
    })


    await emailservice.sendregisterationemail(user.email,user.name);
    
}


async function userlogin(req,res){
    const{email,name,password}= req.body;
    const user = await usermodel.findOne(
       email ? { email } : { name }
    )
    if(!user){
        return res.status(401).json({
            message:"INVALID USER AND PASSWORD"
        })
    }
    const newpassword = await bcrypt.compare(password,user.password);
    if(!newpassword){
        return res.status(401).json({
            message:"INVALID USER AND PASSWORD"
        })
    }
    const token = jwt.sign({
        id:user._id,
    },process.env.JWT_SECRET_KEY
    );

    res.cookie("token", token, cookieOptions)
    return res.status(200).json({
        message:"USER LOGIN SUCESSFULLY",
        token,
        user:{
            name:user.name,
            email:user.email,
        }

    })
    await emailservice.sendregisterationemail(user.email,user.name);
}

async function userlogout(req,res){
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
    const token = bearerToken || req.cookies?.token;
    if(token){
        await blacklistedmodel.create({ token });
    }

    res.clearCookie("token", cookieOptions)
    return res.status(200).json({
        message:"USER LOGOUT SUCESSFULLY."
    })



}

async function usergetme(req,res){

    
    return res.status(200).json({
        message:"THE ACTIVE USER IS FETCHED",
        user:{
            id:req.user._id,
            name:req.user.name,
            email:req.user.email,
        }
    })

}


module.exports = {userregister,userlogin,userlogout,usergetme}