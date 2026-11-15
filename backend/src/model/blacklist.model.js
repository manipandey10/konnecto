const mongoose = require("mongoose");
const blacklistedschema = new mongoose.Schema({
    token:{
        type:String,
        required:[true,"token is required for blacklisted."]
    }

})
const blacklistedmodel = mongoose.model("blacklisted",blacklistedschema);
module.exports = blacklistedmodel;