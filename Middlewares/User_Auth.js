const User = require("../Schemas/User")
const ObjectId = require("mongoose").Types.ObjectId

const loginTokenRegex = /(?:Bearer)*[ -_]*(.+)$/

const check = async (req, res, next) => {
    try {
        const headers = req.headers
        const loginToken = headers["authorization"] == undefined ? null : loginTokenRegex.exec(headers["authorization"].toString())[0]

        const body = req.body
        var uid = body["uid"]

        if (!uid)
            uid = headers["userid"]

        const user = await User.findOne({ _id: ObjectId(uid) })

        if (!user)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        if (user["login_token"] != loginToken)
            return res.status(403).send({
                "error": "403-invalidToken"
            })

        req.user = user

        next()
    } catch (e) {
        return res.status(500).send(e)
    }
}

module.exports = check