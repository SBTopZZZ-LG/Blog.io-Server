// Required
const express = require("express")
const { v4: uuidv4 } = require("uuid")
const CryptoJS = require("crypto-js")
const User = require("../Schemas/User")
const User_Auth = require("../Middlewares/User_Auth")
const multer = require("multer")
const fs = require("fs")

const ObjectId = require("mongoose").Types.ObjectId

var db = null

var avatarUploads = multer({ dest: 'avatars/' })

// Constants
const router = new express.Router()

// Regex
const loginTokenRegex = /(?:Bearer)?[ -_]*(.+)$/
const emailRegex = /^[a-zA-Z\._0-9]+@[a-zA-Z\._0-9]+(?:\.com)$/

// Funcs
function encode(str) {
    const encodedWord = CryptoJS.enc.Utf8.parse(str);
    const encoded = CryptoJS.enc.Base64.stringify(encodedWord);
    return encoded;
}

// Router
router.post("/login", async (req, res, next) => {
    try {
        const headers = req.headers
        const loginToken = headers["authorization"] == undefined ? null : loginTokenRegex.exec(headers["authorization"])[0]

        const body = req.body
        const email = body["email"]
        if (!email.match(emailRegex))
            return res.status(403).send({
                "error": "403-malformedEmail"
            })

        const password = body["password"]

        if (loginToken != null && loginToken != undefined) {
            // Login via a token

            const user = await User.findOne({ email: email })

            if (!user)
                return res.status(404).send({
                    "error": "404-emailNotFound"
                })

            if (user["login_token"] == loginToken)
                return res.status(200).send({
                    "error": null
                })
        } else if (password) {
            // Login via credentials

            const user = await User.findOne({ email: email })

            if (!user)
                return res.status(404).send({
                    "error": "404-emailNotFound"
                })

            if (user["key"] == encode(password)) {
                const loginToken = uuidv4()

                await User.findOneAndUpdate({ _id: user["_id"] }, { login_token: loginToken })

                return res.status(200).send({
                    "error": null,
                    "result": {
                        "loginToken": loginToken
                    }
                })
            }

            return res.status(403).send({
                "error": "403-passwordMismatch"
            })
        }

        return res.status(403).send({
            "error": "403:noTokenOrPasswordProvided"
        })
    } catch (e) {
        console.error(e)
        return res.status(500).send(e)
    }
})

router.post("/signUp", async (req, res, next) => {
    try {
        const body = req.body
        const email = body["email"]
        if (!email.match(emailRegex))
            return res.status(403).send({
                "error": "403-malformedEmail"
            })

        const password = body["password"]

        if ((await User.findOne({ email: email })))
            return res.status(403).send({
                "error": "403-emailAddressAlreadyRegistered"
            })

        if (password.length < 6)
            return res.status(403).send({
                "error": "403-passwordLengthMustBeGreaterThan6"
            })

        const newUser = new User({
            email: email,
            key: encode(password)
        })
        newUser.save()

        return res.status(200).send({
            "error": null,
            "result": {
                "acc_uid": newUser["_id"]
            }
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.get("/account", async (req, res, next) => {
    try {
        const queries = req.query
        const uid = queries["uid"]
        const fields = queries["fields"]

        var user = await User.findOne({ _id: ObjectId(uid) }, "-key" + (fields ? " " + fields.split('+').join(' ') : ''))

        // Delete sensitive fields
        delete user.key

        return res.status(200).send({
            "error": null,
            "result": user
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.post("/account/update", User_Auth, async (req, res, next) => {
    try {
        const body = req.body
        const update = body["update"]

        // Remove/Overwrite sensitive fields for safety (if exists)
        delete update._id
        delete update.avatar_url
        delete update.key// = req.user["key"]
        delete update.email// = req.user["email"]
        delete update.blogs_posted
        delete update.login_token
        delete update.followers

        await User.findOneAndUpdate({ _id: req.user["_id"] }, update)

        return res.status(200).send({
            "error": null,
            "result": await User.findOne({ _id: req.user["_id"] })
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.get("/account/avatar", async (req, res, next) => {
    try {
        const queries = req.query
        const uid = queries["uid"]

        const user = await User.findOne({ _id: ObjectId(uid) })

        if (!user)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        db.filesDownload({ path: "/avatars/" + uid + "/avatar.png" })
            .then(result => {
                res.set("Content-Type", "image/jpeg");
                res.status(200).send(result["result"]["fileBinary"]);
            })
            .catch(err => {
                return res.status(403).send(err)
            })
    } catch (e) {
        console.error(e)
        return res.status(500).send(e)
    }
})

router.post("/account/avatar", User_Auth, avatarUploads.single("avatar"), async (req, res, next) => {
    try {
        const avatar = req.file

        fs.readFile("avatars/" + avatar.filename, async (err, data) => {
            db.filesUpload({ path: "/avatars/" + req.user._id.toString() + "/avatar.png", contents: data, mode: "overwrite" })
                .then(result => {
                    return res.status(200).send({
                        "error": null
                    })
                })
                .catch(err => {
                    return res.status(500).send({
                        "error": err
                    })
                })

            fs.unlinkSync("avatars/" + avatar.filename, () => { })
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.post("/follow", User_Auth, async (req, res, next) => {
    try {
        const body = req.body
        const targetUid = body["targetUid"]

        const targetUser = await User.findOne({ _id: ObjectId(targetUid) })

        if (!targetUser)
            return res.status(404).send({
                "error": "404-targetUidNotFound"
            })

        if (!targetUser["followers"].includes(req.user["_id"]))
            targetUser["followers"].push(req.user["_id"])

        if (!req.user["following"].includes(targetUid))
            req.user["following"].push(targetUid)

        targetUser.save()
        req.user.save()

        return res.status(200).send({
            "error": null
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.post("/followed", User_Auth, async (req, res, next) => {
    try {
        const body = req.body
        const uid = body["uid"]
        const targetUid = body["targetUid"]

        const targetUser = await User.findOne({ _id: ObjectId(targetUid) })

        if (!targetUser)
            return res.status(404).send({
                "error": "404-targetUidNotFound"
            })

        return res.status(200).send({
            "error": null,
            "result": targetUser["followers"].includes(uid) && req.user["following"].includes(targetUid)
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.post("/unfollow", User_Auth, async (req, res, next) => {
    try {
        const body = req.body
        const uid = body["uid"]
        const targetUid = body["targetUid"]

        var targetUser = await User.findOne({ _id: ObjectId(targetUid) })

        if (!targetUser)
            return res.status(404).send({
                "error": "404-targetUidNotFound"
            })

        targetUser["followers"] = targetUser["followers"].filter(item => {
            return item.toString() != uid.toString()
        })

        req.user["following"] = req.user["following"].filter(item => {
            return item.toString() != targetUid.toString()
        })

        targetUser.save()
        req.user.save()

        return res.status(200).send({
            "error": null
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.get("/following", async (req, res, next) => {
    try {
        const queries = req.query
        const uid = queries["uid"]

        const user = await User.findOne({ _id: ObjectId(uid) })

        if (!user)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        const following = (await User.find({ followers: ObjectId(uid) }, "_id")).map(item => {
            return item["_id"]
        })

        return res.status(200).send({
            "error": null,
            "result": following
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.post("/signOut", User_Auth, async (req, res, next) => {
    try {
        req.user["login_token"] = ""

        req.user.save()

        return res.status(200).send({
            "error": null
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

module.exports.router = function (_db) {
    db = _db
    return router
}