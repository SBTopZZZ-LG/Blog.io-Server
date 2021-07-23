const { Dropbox } = require("dropbox")
const fetch = require("node-fetch")
require("dotenv").config()

const db = new Dropbox({
    accessToken: process.env.DB_KEY,
    fetch
})

const connect = function (callback) {
    // Try listing root directory to confirm database connection
    db.filesListFolder({ path: "" })
        .then(result => {
            console.log("Dropbox connection succeeded")

            callback(null, db)
        })
        .catch(err => {
            console.error("Dropbox failure", result)

            callback(err)
        })
}

module.exports.connect = connect