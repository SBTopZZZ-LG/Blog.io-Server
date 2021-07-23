console.clear()

const Dropbox = require("./libs/dropbox")
const Express = require("./libs/express")
const Mongodb = require("./libs/mongodb")

Dropbox.connect((err, db) => {
    if (err) {
        console.log("Process ended due to error")
        process.kill(process.pid)

        return; // Failsafe
    }

    Mongodb.connect(success => {
        if (!success) {
            console.log("Process ended due to error")
            process.kill(process.pid)

            return; // Failsafe
        }

        Express.startServer((app) => {
            if (!app) {
                console.log("Process ended due to error")
                process.kill(process.pid)

                return; // Failsafe
            }

            setupEndpoints(app, db)
        })
    })
})

// Routers
const UserRouter = require("./Routers/User")

const setupEndpoints = function (app, db) {
    // Initial setup
    UserRouter.provideDbObject(db)

    // Use routers
    app.use(UserRouter.router)
}