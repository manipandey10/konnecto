const mongoose = require("mongoose");
async function connectdb(){
    try{
       await mongoose.connect(process.env.MONGODB_URL)
       console.log("Database is connected now!")
    }catch(err){
        console.error("Something Went wrong",err)

    }

}
module.exports = connectdb