const mongoose = require("mongoose");
const userschema = new mongoose.Schema({
    name:{
        type:String,
        required:[true,"name is required for create a account"],
        trim:true,

    },
    email:{
        type:String,
        required:[true,"email is required for create a new account"],
        unique:true,
        regex : [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,"pls write valid format of Email."],
        trim:true,

        
    },
    password:{
        type:String,
        required:[true,"password is required"],
        unique:true,
        trim:true,

    },
},{
    timestamps:true    
})
const usermodel = mongoose.model("user",userschema)
module.exports = usermodel;