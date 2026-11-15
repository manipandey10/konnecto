const mongoose = require("mongoose");
const meetingschema = new mongoose.Schema({
    //meeting join karne ka unique code
    code:{
        type:String,
        required:[true,"Code is Mandatory for meeting."],
        unique:true,
        uppercase:true,
        trim:true,

    },
    //meeting create karne wala user
    host:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"user",
        required:true,

    },
    //meeting mein joined hone wala user
    participants:[{
        type:mongoose.Schema.Types.ObjectId,
        ref :"user",
        required:true,

    }],
    //video call active ya ended.
    status:{
        type:String,
        enum:["Active","Ended"],
        default:"Active"
        

    },
},{
    timestamps:true,    
})
const meetingmodel = mongoose.model("meeting",meetingschema);
module.exports = meetingmodel