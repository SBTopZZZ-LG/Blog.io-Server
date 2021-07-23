const mongoose = require("mongoose")

const URL = "mongodb+srv://" + process.env.MDB_USER + ":" + process.env.MDB_PASS + "@main.zhfir.mongodb.net/myFirstDatabase?retryWrites=true&w=majority"

// To avoid Mongoose deprecation warnings
mongoose.set('useFindAndModify', false)

const connect = function (callback) {
    mongoose.connect(URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }, err => {
        if (err) {
            console.error("Mongodb error", err)
            callback(false)
            return
        }

        console.log("Successfully connected to Mongodb")

        callback(true)
    })
}

module.exports.connect = connect