const express = require("express")

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000

const startServer = function (callback) {
    if (!app.listen(PORT, () => {
        console.log("Express server started on port", PORT)
        callback(app)
    }).listening)
        callback()
}

module.exports.startServer = startServer