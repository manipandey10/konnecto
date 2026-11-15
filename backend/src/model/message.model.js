const mongoose = require("mongoose");

const messageschema = new mongoose.Schema({
    //kis meeting mein message bheja gya
    meeting:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"meeting",
        required:true,
        index:true,
    },
    //message bhejne wala user
    sender:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"user",
        required:true,


    },
    //message received karne wala user
    receiver:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"user",
        required:true,
    },
    //message bhejne wala user ka naam
    sendername:{
        type:String,
        required :true,
        trim :true,
    },
    //message received karne wala user ka naam
    receivername:{
        type:String,
        required :true,
        trim:true,

    },
    //actual message between the both user
    text:{
        type:String,
        required:true,
        maxlength:2000,
        trim:true,


    },
},{
    timestamps:true,    
})
//database mein searching ko fast banane ke liye index create karte hai.
//compound index hai ye
messageschema.index({meeting:1,createdAt:1});
const messagemodel = mongoose.model("message",messageschema);
module.exports = messagemodel;