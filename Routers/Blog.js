// Required
const express = require("express")
const { v4: uuidv4 } = require("uuid")
const CryptoJS = require("crypto-js")
const Blog = require("../Schemas/Blog")
const BlogObjectRequest = require("../Schemas/BlogObjectRequest")
const User_Auth = require("../Middlewares/User_Auth")
const multer = require("multer")
const fs = require("fs")

const ObjectId = require("mongoose").Types.ObjectId
const User = require("../Schemas/User")

var db = null

var blogUploads = multer({ dest: 'blog_contents/' })

// Constants
const router = new express.Router()

// Regex
const imageObjectRegex = /<\/Image\/>/
const imageObjectRegex_2 = /<\/(.+)\/>/

// Router
router.post("/blog/create", User_Auth, async (req, res, next) => {
    try {
        const body = req.body
        const blog = body["blog"]

        // Delete/Overwrite sensitive fields
        delete blog._id
        delete blog._v
        blog.author = req.user["_id"]
        if (!blog.content)
            blog.content = []
        delete blog.reactions
        delete blog.comments
        delete blog.cover_image

        blog.timestamp = Date.now()

        const newBlog = new Blog(blog)

        req.user["blogs_posted"].push(newBlog["_id"])
        req.user.save()

        var imagesCount = 0
        for (var i = 0; i < blog.content.length; i++) {
            const _content = blog.content[i]

            if (_content.match(imageObjectRegex))
                imagesCount++
        }

        if (imagesCount > 0) {
            var imageObjectsTokens = []

            for (var i = 0; i < imagesCount; i++) {
                const token = uuidv4()
                const newObj = new BlogObjectRequest({
                    requester: req.user["_id"],
                    request_token: token
                })
                newObj.save()
                imageObjectsTokens.push(token)
            }

            var index = 0
            for (var i = 0; i < blog.content.length; i++) {
                const _content = blog.content[i]

                if (_content.match(imageObjectRegex))
                    blog.content[i] = "</" + imageObjectsTokens[index++] + "/>"
            }

            newBlog["content"] = blog.content
            newBlog.save()

            return res.status(200).send({
                "error": "",
                "result": {
                    "blog": newBlog,
                    "request_tokens": imageObjectsTokens
                }
            })
        }

        newBlog.save()

        return res.status(200).send({
            "error": "",
            "result": newBlog
        })
    } catch (e) {
        console.error(e)
        return res.status(500).send(e)
    }
})

router.get("/blog", async (req, res, next) => {
    try {
        const queries = req.query
        const uid = queries["uid"]
        const fields = queries["fields"]

        const blog = await Blog.findOne({ _id: ObjectId(uid) }, (fields ? fields.split('+').join(' ') : ''))

        return res.status(200).send({
            "error": null,
            "result": blog
        })
    } catch (e) {
        console.error(e)
        return res.status(500).send(e)
    }
})

router.get("/blogs", async (req, res, next) => {
    try {
        const queries = req.query
        const uid = queries["uid"]
        const fields = queries["fields"]
        const count = queries["count"] == undefined ? null : parseInt(queries["count"])
        const timestamp = queries["timestamp"]

        const user = await User.findOne({ _id: ObjectId(uid) })

        if (!user)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        var allBlogs = null

        if (count)
            if (timestamp)
                allBlogs = await Blog.find({ author: ObjectId(uid) }, (fields ? fields.split('+').join(' ') : '')).sort({ timestamp: -1 }).limit(count).where('timestamp').lt(timestamp.toString())
            else
                allBlogs = await Blog.find({ author: ObjectId(uid) }, (fields ? fields.split('+').join(' ') : '')).sort({ timestamp: -1 }).limit(count)
        else
            if (timestamp)
                allBlogs = await Blog.find({ author: ObjectId(uid) }, (fields ? fields.split('+').join(' ') : '')).sort({ timestamp: -1 }).where('timestamp').lt(timestamp.toString())
            else
                allBlogs = await Blog.find({ author: ObjectId(uid) }, (fields ? fields.split('+').join(' ') : '')).sort({ timestamp: -1 })

        return res.status(200).send({
            "error": null,
            "result": allBlogs
        })
    } catch (e) {
        console.error(e)
        return res.status(500).send(e)
    }
})

router.post("/blog/request", User_Auth, blogUploads.single("image"), async (req, res, next) => {
    try {
        const image = req.file

        const queries = req.query
        const request_token = queries["token"]

        const blogRequest = await BlogObjectRequest.findOne({ request_token: request_token })

        if (!blogRequest)
            return res.status(404).send({
                "error": "404-requestNotFoundOrExpired"
            })

        if (blogRequest["requester"].toString() != req.user["_id"].toString())
            return res.status(403).send({
                "error": "403-forbidden"
            })

        fs.readFile("blog_contents/" + image.filename, async (err, data) => {
            db.filesUpload({ path: "/blogs/" + request_token + "/image.png", contents: data, mode: "overwrite" })
                .then(result => {
                    blogRequest.remove()

                    return res.status(200).send({
                        "error": null
                    })
                })
                .catch(err => {
                    return res.status(500).send({
                        "error": err
                    })
                })

            fs.unlinkSync("blog_contents/" + image.filename, () => { })
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.get("/blog/request", async (req, res, next) => {
    try {
        const queries = req.query
        const uid = queries["token"]

        db.filesDownload({ path: "/blogs/" + uid + "/image.png" })
            .then(result => {
                res.set("Content-Type", "image/jpeg");
                res.status(200).send(result["result"]["fileBinary"]);
            })
            .catch(err => {
                return res.status(403).send(err)
            })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.post("/blog/cover", User_Auth, blogUploads.single("cover"), async (req, res, next) => {
    try {
        const cover = req.file

        const queries = req.query
        const uid = queries["uid"]

        var blog = await Blog.findOne({ _id: ObjectId(uid) })

        if (!blog)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        fs.readFile("blog_contents/" + cover.filename, async (err, data) => {
            const cover_token = uuidv4()
            db.filesUpload({ path: "/blogs/covers/" + cover_token + "/cover.png", contents: data, mode: "overwrite" })
                .then(result => {
                    blog["cover_image"] = cover_token
                    blog.save()

                    return res.status(200).send({
                        "error": null,
                        "result": {
                            "cover_token": cover_token
                        }
                    })
                })
                .catch(err => {
                    return res.status(500).send({
                        "error": err
                    })
                })

            fs.unlinkSync("blog_contents/" + cover.filename, () => { })
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.get("/blog/cover", async (req, res, next) => {
    try {
        const queries = req.query
        const token = queries["token"]

        db.filesDownload({ path: "/blogs/covers/" + token + "/cover.png" })
            .then(result => {
                res.set("Content-Type", "image/jpeg");
                res.status(200).send(result["result"]["fileBinary"]);
            })
            .catch(err => {
                return res.status(403).send(err)
            })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.post("/blog/update", User_Auth, async (req, res, next) => {
    try {
        const body = req.body
        const blogUid = body["blogUid"]
        var newBlog = body["blog"]

        // Delete/Overwrite sensitive fields (if any)
        delete newBlog._id
        delete newBlog._v
        newBlog.author = req.user["_id"]
        delete newBlog.reactions
        delete newBlog.comments
        delete newBlog.cover_image

        var blog = await Blog.findOne({ _id: ObjectId(blogUid), author: req.user["_id"] })

        if (!blog)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        if (newBlog["content"]) {
            const oldObjects = blog["content"].filter(item => {
                return item.match(imageObjectRegex_2)
            })
            const newObjects = newBlog["content"].filter(item => {
                return item.match(imageObjectRegex_2)
            })

            for (var i = 0; i < oldObjects.length; i++) {
                const obj = oldObjects[i]

                if (!newObjects.includes(obj)) {
                    // Delete image object from dropbox
                    db.filesDelete({ path: "/blogs/" + imageObjectRegex_2.exec(obj.toString())[1] })
                        .then(result => { /* Do nothing */ })
                        .catch(err => {
                            console.error(err)
                        })
                }
            }

            var imagesCount = 0
            for (var i = 0; i < newBlog["content"].length; i++) {
                const _content = newBlog["content"][i]

                if (_content.match(imageObjectRegex))
                    imagesCount++
            }

            if (imagesCount > 0) {
                var imageObjectsTokens = []

                for (var i = 0; i < imagesCount; i++) {
                    const token = uuidv4()
                    const newObj = new BlogObjectRequest({
                        requester: req.user["_id"],
                        request_token: token
                    })
                    newObj.save()
                    imageObjectsTokens.push(token)
                }

                var index = 0
                for (var i = 0; i < newBlog["content"].length; i++) {
                    const _content = newBlog["content"][i]

                    if (_content.match(imageObjectRegex))
                        newBlog.content[i] = "</" + imageObjectsTokens[index++] + "/>"
                }

                await Blog.findOneAndUpdate({ _id: ObjectId(blogUid), author: ObjectId(req.user["_id"]) }, newBlog)

                return res.status(200).send({
                    "error": "",
                    "result": {
                        "blog": newBlog,
                        "request_tokens": imageObjectsTokens
                    }
                })
            }
        }

        await Blog.findOneAndUpdate({ _id: ObjectId(blogUid), author: ObjectId(req.user["_id"]) }, newBlog)

        return res.status(200).send({
            "error": null,
            "result": await Blog.findOne({ _id: ObjectId(blogUid), author: ObjectId(req.user["_id"]) })
        })
    } catch (e) {
        console.error(e)
        return res.status(500).send(e)
    }
})

module.exports.router = function (_db) {
    db = _db
    return router
}