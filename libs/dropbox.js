const { Dropbox } = require("dropbox")
const fetch = require("node-fetch")
require("dotenv").config()

const db = new Dropbox({
    accessToken: process.env.DB_KEY,
    fetch
})

const connect = function (callback) {
    // Try listing root directory to confirm database connection
    console.log("CONNECTING TO DROPBOX...")
    db.filesListFolder({ path: "" })
        .then(result => {
            console.log("OK!")

            callback(null, db)
        })
        .catch(err => {
            console.log("FAILURE!")
            console.error(err)

            callback(err)
        })
}

module.exports.connect = connect