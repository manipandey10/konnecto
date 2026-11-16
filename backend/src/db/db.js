const mongoose = require("mongoose");
async function connectDatabase() {
    if (!process.env.MONGODB_URL) {
        throw new Error("MONGODB_URL environment variable is required");
    }

    await mongoose.connect(process.env.MONGODB_URL);
    console.log("Database is connected now!");
}
module.exports = connectDatabase;