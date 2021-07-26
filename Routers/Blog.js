// Required
const express = require("express")
const { v4: uuidv4 } = require("uuid")
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
const CLEANUP_DELAY = 5 // Minutes
const BLOG_REQUEST_TIMEOUT = 60 // Minutes

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
                    request_token: token,
                    date_created: Date.now()
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
        const fields = queries["fields"] || ""

        const blog = await Blog.findOne({ _id: ObjectId(uid) }, fields.split('+').join(' '))

        if (!blog)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        if (blog["visibility"] == "private")
            return res.status(403).send({
                "error": "403-cannotGetPrivateBlog"
            })

        return res.status(200).send({
            "error": null,
            "result": blog
        })
    } catch (e) {
        console.error(e)
        return res.status(500).send(e)
    }
})

router.post("/blog", User_Auth, async (req, res, next) => {
    try {
        const queries = req.query
        const fields = queries["fields"] || ""

        const body = req.body
        const uid = body["uid"]
        const blogUid = body["blogUid"]

        const blog = await Blog.findOne({ _id: ObjectId(blogUid) }, fields.split('+').join(' '))

        if (!blog)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        if (blog["visibility"] == "private" && blog["author"] != ObjectId(uid))
            return res.status(403).send({
                "error": "403-cannotGetPrivateBlog"
            })

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
        const uid = queries["uid"] || ""
        const fields = queries["fields"] || ""
        const count = queries["count"] == undefined ? null : parseInt(queries["count"])
        const timestamp = queries["timestamp"]
        const ts_type = parseInt(queries["ts_type"] || -1)
        const ts_sort = parseInt(queries["ts_sort"] || -1)

        if (uid) {
            const user = await User.findOne({ _id: ObjectId(uid) }).sort({ timestamp: -1 })

            if (!user)
                return res.status(404).send({
                    "error": "404-uidNotFound"
                })
        }

        var allBlogs = null

        if (count)
            if (timestamp)
                if (ts_type == 1)
                    allBlogs = await Blog.find(uid ? { author: ObjectId(uid), visibility: "public" } : { visibility: "public" }, fields.split('+').join(' ')).sort({ timestamp: ts_sort }).limit(count).where('timestamp').gt(timestamp.toString())
                else
                    allBlogs = await Blog.find(uid ? { author: ObjectId(uid), visibility: "public" } : { visibility: "public" }, fields.split('+').join(' ')).sort({ timestamp: ts_sort }).limit(count).where('timestamp').lt(timestamp.toString())
            else
                allBlogs = await Blog.find(uid ? { author: ObjectId(uid), visibility: "public" } : { visibility: "public" }, fields.split('+').join(' ')).sort({ timestamp: ts_sort }).limit(count)
        else
            if (timestamp)
                if (ts_type == 1)
                    allBlogs = await Blog.find(uid ? { author: ObjectId(uid), visibility: "public" } : { visibility: "public" }, fields.split('+').join(' ')).sort({ timestamp: ts_sort }).where('timestamp').gt(timestamp.toString())
                else
                    allBlogs = await Blog.find(uid ? { author: ObjectId(uid), visibility: "public" } : { visibility: "public" }, fields.split('+').join(' ')).sort({ timestamp: ts_sort }).where('timestamp').lt(timestamp.toString())
            else
                allBlogs = await Blog.find(uid ? { author: ObjectId(uid), visibility: "public" } : { visibility: "public" }, fields.split('+').join(' ')).sort({ timestamp: ts_sort })

        return res.status(200).send({
            "error": null,
            "result": allBlogs
        })
    } catch (e) {
        console.error(e)
        return res.status(500).send(e)
    }
})

router.post("/blogs", User_Auth, async (req, res, next) => {
    try {
        const queries = req.query
        const fields = queries["fields"] || ""
        const count = queries["count"] == undefined ? null : parseInt(queries["count"])
        const timestamp = queries["timestamp"]
        const ts_type = parseInt(queries["ts_type"] || -1)
        const ts_sort = parseInt(queries["ts_sort"] || -1)

        const body = req.body
        const uid = body["uid"]

        const user = await User.findOne({ _id: ObjectId(uid) })

        if (!user)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        var allBlogs = null

        if (count)
            if (timestamp)
                if (ts_type == 1)
                    allBlogs = await Blog.find((uid.toString() == req.user["_id"].toString() ? { author: ObjectId(uid) } : { author: ObjectId(uid), author: "public" }), fields.split('+').join(' ')).sort({ timestamp: ts_sort }).limit(count).where('timestamp').gt(timestamp.toString())
                else
                    allBlogs = await Blog.find((uid.toString() == req.user["_id"].toString() ? { author: ObjectId(uid) } : { author: ObjectId(uid), author: "public" }), fields.split('+').join(' ')).sort({ timestamp: ts_sort }).limit(count).where('timestamp').lt(timestamp.toString())
            else
                allBlogs = await Blog.find((uid.toString() == req.user["_id"].toString() ? { author: ObjectId(uid) } : { author: ObjectId(uid), author: "public" }), fields.split('+').join(' ')).sort({ timestamp: ts_sort }).limit(count)
        else
            if (timestamp)
                if (ts_type == 1)
                    allBlogs = await Blog.find((uid.toString() == req.user["_id"].toString() ? { author: ObjectId(uid) } : { author: ObjectId(uid), author: "public" }), fields.split('+').join(' ')).sort({ timestamp: ts_sort }).where('timestamp').gt(timestamp.toString())
                else
                    allBlogs = await Blog.find((uid.toString() == req.user["_id"].toString() ? { author: ObjectId(uid) } : { author: ObjectId(uid), author: "public" }), fields.split('+').join(' ')).sort({ timestamp: ts_sort }).where('timestamp').lt(timestamp.toString())
            else
                allBlogs = await Blog.find((uid.toString() == req.user["_id"].toString() ? { author: ObjectId(uid) } : { author: ObjectId(uid), author: "public" }), fields.split('+').join(' ')).sort({ timestamp: ts_sort })

        return res.status(200).send({
            "error": null,
            "result": allBlogs
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.post("/blog/request", User_Auth, blogUploads.single("image"), async (req, res, next) => {
    try {
        const image = req.file

        const queries = req.query
        const request_token = queries["token"]

        const blogRequest = await BlogObjectRequest.findOne({ request_token: request_token, requester: req.user["_id"] })

        if (!blogRequest)
            return res.status(404).send({
                "error": "404-requestNotFoundOrExpired"
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

            fs.unlink("blog_contents/" + image.filename, () => { })
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

router.post("/blog/cover/remove", User_Auth, async (req, res, next) => {
    try {
        const body = req.body
        const blogUid = body["blogUid"]

        var blog = await Blog.findOne({ _id: ObjectId(blogUid), author: req.user["_id"] })

        if (!blog)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        const cover_image = blog["cover_image"]

        if (!cover_image)
            return res.status(200).send({
                "error": null
            })

        db.filesDelete({ path: "/blogs/covers/" + cover_image })
            .then(result => {
                blog["cover_image"] = ""
                blog.save()

                res.status(200).send({
                    "error": null
                })
            })
            .catch(err => {
                res.status(500).send(err)
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

        var blog = await Blog.findOne({ _id: ObjectId(uid), author: req.user["_id"] })

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

            fs.unlink("blog_contents/" + cover.filename, () => { })
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
                        request_token: token,
                        date_created: Date.now()
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
        return res.status(500).send(e)
    }
})

router.post("/blog/remove", User_Auth, async (req, res, next) => {
    try {
        const body = req.body
        const blogUid = body["blogUid"]

        const blog = await Blog.findOne({ _id: ObjectId(blogUid), author: req.user["_id"] })

        if (!blog)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        blog.remove()

        req.user["blogs_posted"] = req.user["blogs_posted"].filter(item => {
            return item.toString() != blogUid.toString()
        })
        req.user.save()

        return res.status(200).send({
            "error": null
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.post("/blog/react/like", User_Auth, async (req, res, next) => {
    try {
        const body = req.body
        const blogUid = body["blogUid"]

        const queries = req.query
        const toggle = queries["toggle"] || "false"

        var blog = await Blog.findOne({ _id: ObjectId(blogUid) })

        if (!blog)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        if (blog["author"] == req.user["_id"])
            return res.status(403).send({
                "error": "403-notAllowed"
            })

        if (!blog["reactions"]["likes"].includes(req.user["_id"])) {
            blog["reactions"]["like_count"] = blog["reactions"]["like_count"] + 1
            blog["reactions"]["likes"].push(req.user["_id"])

            if (blog["reactions"]["dislikes"].includes(req.user["_id"])) {
                blog["reactions"]["dislike_count"] = blog["reactions"]["dislike_count"] - 1
                blog["reactions"]["dislikes"] = blog["reactions"]["dislikes"].filter(item => {
                    return item.toString() != req.user["_id"].toString()
                })
            }
        } else if (toggle.toString() == "true")
            if (!blog["reactions"]["dislikes"].includes(req.user["_id"])) {
                blog["reactions"]["like_count"] = blog["reactions"]["like_count"] - 1
                blog["reactions"]["likes"] = blog["reactions"]["likes"].filter(item => {
                    return item.toString() != req.user["_id"].toString()
                })
            }

        blog.save()

        return res.status(200).send({
            "error": null,
            "result": blog
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.post("/blog/react/dislike", User_Auth, async (req, res, next) => {
    try {
        const body = req.body
        const blogUid = body["blogUid"]

        const queries = req.query
        const toggle = queries["toggle"] || "false"

        var blog = await Blog.findOne({ _id: ObjectId(blogUid) })

        if (!blog)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        if (blog["author"] == req.user["_id"])
            return res.status(403).send({
                "error": "403-notAllowed"
            })

        if (!blog["reactions"]["dislikes"].includes(req.user["_id"])) {
            blog["reactions"]["dislike_count"] = blog["reactions"]["dislike_count"] + 1
            blog["reactions"]["dislikes"].push(req.user["_id"])

            if (blog["reactions"]["likes"].includes(req.user["_id"])) {
                blog["reactions"]["like_count"] = blog["reactions"]["like_count"] - 1
                blog["reactions"]["likes"] = blog["reactions"]["likes"].filter(item => {
                    return item.toString() != req.user["_id"].toString()
                })
            }
        } else if (toggle.toString() == "true")
            if (!blog["reactions"]["likes"].includes(req.user["_id"])) {
                blog["reactions"]["dislike_count"] = blog["reactions"]["dislike_count"] - 1
                blog["reactions"]["dislikes"] = blog["reactions"]["dislikes"].filter(item => {
                    return item.toString() != req.user["_id"].toString()
                })
            }

        blog.save()

        return res.status(200).send({
            "error": null,
            "result": blog
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.get("/blog/react/comments", async (req, res, next) => {
    try {
        const queries = req.query
        const blogUid = queries["blogUid"]
        const sortBy = queries["sortBy"]
        const reversed = queries["rev"] == "true" ? "true" : "false"
        const timestamp = queries["timestamp"]
        const ts_type = parseInt(queries["ts_type"] || -1)
        const count = queries["count"]

        const blog = await Blog.findOne({ _id: ObjectId(blogUid) })

        if (!blog)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        var sorted = sortBy ? blog["comments"].sort((a, b) => {
            var ts1 = 0
            var ts2 = 0

            if (sortBy == "likes") {
                ts1 = a["comment"]["reactions"]["like_count"]
                ts2 = b["comment"]["reactions"]["like_count"]
            } else if (sortBy == "dislikes") {
                ts1 = a["comment"]["reactions"]["dislike_count"]
                ts2 = b["comment"]["reactions"]["dislike_count"]
            } else if (sortBy == "timestamp") {
                ts1 = a["comment"]["timestamp"]
                ts2 = b["comment"]["timestamp"]
            }

            const return_val = ts2 - ts1

            return return_val || -1
        }) : blog["comments"]

        if (reversed == "true")
            sorted.reverse()

        if (timestamp)
            sorted = sorted.filter(item => {
                if (ts_type == 1)
                    return item["comment"]["timestamp"] > timestamp
                else
                    return item["comment"]["timestamp"] < timestamp
            })

        if (count)
            if (count > 0)
                sorted.splice(count, sorted.length - count <= 0 ? sorted.length : sorted.length - count)

        return res.status(200).send({
            "error": null,
            "result": sorted
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.get("/blog/react/comment", async (req, res, next) => {
    try {
        const queries = req.query
        const blogUid = queries["blog_id"]
        const commentUid = queries["comment_id"]

        const blog = await Blog.findOne({ _id: ObjectId(blogUid) })

        if (!blog)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        var comment = blog["comments"].filter(item => {
            return item["_id"].toString() == commentUid.toString()
        })

        if (comment.length > 0)
            comment = comment[0]["comment"]
        else
            return res.status(404).send({
                "error": "404-commentNotFound"
            })

        return res.status(200).send({
            "error": null,
            "result": comment
        })
    } catch (e) {
        console.error(e)
        return res.status(500).send(e)
    }
})

router.post("/blog/react/comment", User_Auth, async (req, res, next) => {
    try {
        const body = req.body
        const blogUid = body["blogUid"]
        const comment = body["comment"].toString()

        var blog = await Blog.findOne({ _id: ObjectId(blogUid) })

        if (!blog)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        blog["comments"].push({
            comment: {
                author: req.user["_id"],
                content: comment,
                timestamp: Date.now()
            }
        })

        blog.save()

        return res.status(200).send({
            "error": null
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.post("/blog/react/comment/remove", User_Auth, async (req, res, next) => {
    try {
        const body = req.body
        const blogUid = body["blogUid"]
        const commentUid = body["commentUid"]

        const blog = await Blog.findOne({ _id: ObjectId(blogUid) })

        if (!blog)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        blog["comments"] = blog["comments"].filter(item => {
            return !((item["_id"].toString() == commentUid.toString()) && item["comment"]["author"]["_id"].toString() == req.user["_id"].toString())
        })

        blog.save()

        return res.status(200).send({
            "error": null
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.post("/blog/react/comment/like", User_Auth, async (req, res, next) => {
    try {
        const body = req.body
        const blogUid = body["blogUid"]
        const commentUid = body["commentUid"]

        const queries = req.query
        const toggle = queries["toggle"] || "false"

        var blog = await Blog.findOne({ _id: ObjectId(blogUid) })

        if (!blog)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        var index = -1
        for (var i = 0; i < blog["comments"].length; i++)
            if (blog["comments"][i]["_id"].toString() == commentUid.toString()) {
                index = i
                break
            }

        if (index == -1)
            return res.status(404).send({
                "error": "404-commentNotFound"
            })

        if (blog["comments"][index]["comment"]["author"] == req.user["_id"])
            return res.status(403).send({
                "error": "403-notAllowed"
            })

        if (!blog["comments"][index]["comment"]["reactions"]["likes"].includes(req.user["_id"])) {
            blog["comments"][index]["comment"]["reactions"]["like_count"] = blog["comments"][index]["comment"]["reactions"]["like_count"] + 1
            blog["comments"][index]["comment"]["reactions"]["likes"].push(req.user["_id"])

            if (blog["comments"][index]["comment"]["reactions"]["dislikes"].includes(req.user["_id"])) {
                blog["comments"][index]["comment"]["reactions"]["dislike_count"] = blog["comments"][index]["comment"]["reactions"]["dislike_count"] - 1
                blog["comments"][index]["comment"]["reactions"]["dislikes"] = blog["comments"][index]["comment"]["reactions"]["dislikes"].filter(item => {
                    return item.toString() != req.user["_id"].toString()
                })
            }
        } else if (toggle.toString() == "true")
            if (!blog["comments"][index]["comment"]["reactions"]["dislikes"].includes(req.user["_id"])) {
                blog["comments"][index]["comment"]["reactions"]["like_count"] = blog["comments"][index]["comment"]["reactions"]["like_count"] - 1
                blog["comments"][index]["comment"]["reactions"]["likes"] = blog["comments"][index]["comment"]["reactions"]["likes"].filter(item => {
                    return item.toString() != req.user["_id"].toString()
                })
            }

        blog.save()

        return res.status(200).send({
            "error": null,
            "result": blog
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.post("/blog/react/comment/dislike", User_Auth, async (req, res, next) => {
    try {
        const body = req.body
        const blogUid = body["blogUid"]
        const commentUid = body["commentUid"]

        const queries = req.query
        const toggle = queries["toggle"] || "false"

        var blog = await Blog.findOne({ _id: ObjectId(blogUid) })

        if (!blog)
            return res.status(404).send({
                "error": "404-uidNotFound"
            })

        var index = -1
        for (var i = 0; i < blog["comments"].length; i++)
            if (blog["comments"][i]["_id"].toString() == commentUid.toString()) {
                index = i
                break
            }

        if (index == -1)
            return res.status(404).send({
                "error": "404-commentNotFound"
            })

        if (blog["comments"][index]["comment"]["author"] == req.user["_id"])
            return res.status(403).send({
                "error": "403-notAllowed"
            })

        if (!blog["comments"][index]["comment"]["reactions"]["dislikes"].includes(req.user["_id"])) {
            blog["comments"][index]["comment"]["reactions"]["dislike_count"] = blog["comments"][index]["comment"]["reactions"]["dislike_count"] + 1
            blog["comments"][index]["comment"]["reactions"]["dislikes"].push(req.user["_id"])

            if (blog["comments"][index]["comment"]["reactions"]["likes"].includes(req.user["_id"])) {
                blog["comments"][index]["comment"]["reactions"]["like_count"] = blog["comments"][index]["comment"]["reactions"]["like_count"] - 1
                blog["comments"][index]["comment"]["reactions"]["likes"] = blog["comments"][index]["comment"]["reactions"]["likes"].filter(item => {
                    return item.toString() != req.user["_id"].toString()
                })
            }
        } else if (toggle.toString() == "true")
            if (!blog["comments"][index]["comment"]["reactions"]["likes"].includes(req.user["_id"])) {
                blog["comments"][index]["comment"]["reactions"]["dislike_count"] = blog["comments"][index]["comment"]["reactions"]["dislike_count"] - 1
                blog["comments"][index]["comment"]["reactions"]["dislikes"] = blog["comments"][index]["comment"]["reactions"]["dislikes"].filter(item => {
                    return item.toString() != req.user["_id"].toString()
                })
            }

        blog.save()

        return res.status(200).send({
            "error": null,
            "result": blog
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.get("/blog/search/title", async (req, res, next) => {
    try {
        const queries = req.query
        const regex = queries["regex"]
        const options = queries["options"] || ""
        const fields = queries["fields"] || ""
        const timestamp = queries["timestamp"]
        const ts_type = parseInt(queries["ts_type"] || -1)
        const ts_sort = parseInt(queries["ts_sort"] || -1)
        const count = parseInt(queries["count"])

        var blogs = null

        if (timestamp)
            if (count)
                if (ts_type == 1)
                    blogs = await Blog.find({ visibility: "public", title: { $regex: regex, $options: options } }, fields.split('+').join(' ')).sort({ timestamp: ts_sort }).limit(count).where('timestamp').gt(timestamp.toString())
                else
                    blogs = await Blog.find({ visibility: "public", title: { $regex: regex, $options: options } }, fields.split('+').join(' ')).sort({ timestamp: ts_sort }).limit(count).where('timestamp').lt(timestamp.toString())
            else
                if (ts_type == 1)
                    blogs = await Blog.find({ visibility: "public", title: { $regex: regex, $options: options } }, fields.split('+').join(' ')).sort({ timestamp: ts_sort }).where('timestamp').gt(timestamp.toString())
                else
                    blogs = await Blog.find({ visibility: "public", title: { $regex: regex, $options: options } }, fields.split('+').join(' ')).sort({ timestamp: ts_sort }).where('timestamp').lt(timestamp.toString())
        else
            if (count)
                blogs = await Blog.find({ visibility: "public", title: { $regex: regex, $options: options } }, fields.split('+').join(' ')).sort({ timestamp: ts_sort }).limit(count)
            else
                blogs = await Blog.find({ visibility: "public", title: { $regex: regex, $options: options } }, fields.split('+').join(' ')).sort({ timestamp: ts_sort })

        return res.status(200).send({
            "error": null,
            "result": blogs
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.post("/blog/search/title", User_Auth, async (req, res, next) => {
    try {
        const queries = req.query
        const regex = queries["regex"]
        const options = queries["options"] || ""
        const fields = queries["fields"] || ""
        const timestamp = queries["timestamp"]
        const ts_type = parseInt(queries["ts_type"] || -1)
        const ts_sort = parseInt(queries["ts_sort"] || -1)
        const count = parseInt(queries["count"])

        var blogs = null

        if (timestamp)
            if (count)
                if (ts_type == 1)
                    blogs = await Blog.find({ $or: [{ visibility: "public" }, { author: req.user["_id"] }], title: { $regex: regex, $options: options } }, fields.split('+').join(' ')).sort({ timestamp: ts_sort }).limit(count).where('timestamp').gt(timestamp.toString())
                else
                    blogs = await Blog.find({ $or: [{ visibility: "public" }, { author: req.user["_id"] }], title: { $regex: regex, $options: options } }, fields.split('+').join(' ')).sort({ timestamp: ts_sort }).limit(count).where('timestamp').lt(timestamp.toString())
            else
                if (ts_type == 1)
                    blogs = await Blog.find({ $or: [{ visibility: "public" }, { author: req.user["_id"] }], title: { $regex: regex, $options: options } }, fields.split('+').join(' ')).sort({ timestamp: ts_sort }).where('timestamp').gt(timestamp.toString())
                else
                    blogs = await Blog.find({ $or: [{ visibility: "public" }, { author: req.user["_id"] }], title: { $regex: regex, $options: options } }, fields.split('+').join(' ')).sort({ timestamp: ts_sort }).where('timestamp').lt(timestamp.toString())
        else
            if (count)
                blogs = await Blog.find({ $or: [{ visibility: "public" }, { author: req.user["_id"] }], title: { $regex: regex, $options: options } }, fields.split('+').join(' ')).sort({ timestamp: ts_sort }).limit(count)
            else
                blogs = await Blog.find({ $or: [{ visibility: "public" }, { author: req.user["_id"] }], title: { $regex: regex, $options: options } }, fields.split('+').join(' ')).sort({ timestamp: ts_sort })

        return res.status(200).send({
            "error": null,
            "result": blogs
        })
    } catch (e) {
        return res.status(500).send(e)
    }
})

router.get("/blogs/:mode/likes", async (req, res, next) => {
    try {
        const queries = req.query
        const uid = queries["uid"]
        const fields = queries["fields"] || ""
        const count = queries["count"] == undefined ? null : parseInt(queries["count"])
        const timestamp = queries["timestamp"]
        const ts_type = parseInt(queries["ts_type"] || -1)

        const mode = req.params.mode

        if (uid) {
            const user = await User.findOne({ _id: ObjectId(uid) })

            if (!user)
                return res.status(404).send({
                    "error": "404-uidNotFound"
                })
        }

        var allBlogs = null

        if (count)
            if (timestamp)
                if (ts_type == 1)
                    allBlogs = await Blog.find(uid ? { author: ObjectId(uid), visibility: "public" } : { visibility: "public" }, fields.split('+').join(' ')).sort({ "reactions.like_count": mode == "asc" ? 1 : -1 }).limit(count).where('timestamp').gt(timestamp.toString())
                else
                    allBlogs = await Blog.find(uid ? { author: ObjectId(uid), visibility: "public" } : { visibility: "public" }, fields.split('+').join(' ')).sort({ "reactions.like_count": mode == "asc" ? 1 : -1 }).limit(count).where('timestamp').lt(timestamp.toString())
            else
                allBlogs = await Blog.find(uid ? { author: ObjectId(uid), visibility: "public" } : { visibility: "public" }, fields.split('+').join(' ')).sort({ "reactions.like_count": mode == "asc" ? 1 : -1 }).limit(count)
        else
            if (timestamp)
                if (ts_type == 1)
                    allBlogs = await Blog.find(uid ? { author: ObjectId(uid), visibility: "public" } : { visibility: "public" }, fields.split('+').join(' ')).sort({ "reactions.like_count": mode == "asc" ? 1 : -1 }).where('timestamp').gt(timestamp.toString())
                else
                    allBlogs = await Blog.find(uid ? { author: ObjectId(uid), visibility: "public" } : { visibility: "public" }, fields.split('+').join(' ')).sort({ "reactions.like_count": mode == "asc" ? 1 : -1 }).where('timestamp').lt(timestamp.toString())
            else
                allBlogs = await Blog.find(uid ? { author: ObjectId(uid), visibility: "public" } : { visibility: "public" }, fields.split('+').join(' ')).sort({ "reactions.like_count": mode == "asc" ? 1 : -1 })

        return res.status(200).send({
            "error": null,
            "result": allBlogs
        })
    } catch (e) {
        console.error(e)
        return res.status(500).send(e)
    }
})

router.post("/blogs/:mode/likes", User_Auth, async (req, res, next) => {
    try {
        const queries = req.query
        const fields = queries["fields"] || ""
        const count = queries["count"] == undefined ? null : parseInt(queries["count"])
        const timestamp = queries["timestamp"]
        const ts_type = parseInt(queries["ts_type"] || -1)

        const body = req.body
        const uid = body["uid"]

        const mode = req.params.mode

        var allBlogs = null

        if (count)
            if (timestamp)
                if (ts_type == 1)
                    allBlogs = await Blog.find({ $or: [{ author: ObjectId(uid) }, { $and: [{ author: { $ne: ObjectId(uid) } }, { visibility: "public" }] }] }, fields.split('+').join(' ')).sort({ "reactions.like_count": mode == "asc" ? 1 : -1 }).limit(count).where('timestamp').gt(timestamp.toString())
                else
                    allBlogs = await Blog.find({ $or: [{ author: ObjectId(uid) }, { $and: [{ author: { $ne: ObjectId(uid) } }, { visibility: "public" }] }] }, fields.split('+').join(' ')).sort({ "reactions.like_count": mode == "asc" ? 1 : -1 }).limit(count).where('timestamp').lt(timestamp.toString())
            else
                allBlogs = await Blog.find({ $or: [{ author: ObjectId(uid) }, { $and: [{ author: { $ne: ObjectId(uid) } }, { visibility: "public" }] }] }, fields.split('+').join(' ')).sort({ "reactions.like_count": mode == "asc" ? 1 : -1 }).limit(count)
        else
            if (timestamp)
                if (ts_type == 1)
                    allBlogs = await Blog.find({ $or: [{ author: ObjectId(uid) }, { $and: [{ author: { $ne: ObjectId(uid) } }, { visibility: "public" }] }] }, fields.split('+').join(' ')).sort({ "reactions.like_count": mode == "asc" ? 1 : -1 }).where('timestamp').gt(timestamp.toString())
                else
                    allBlogs = await Blog.find({ $or: [{ author: ObjectId(uid) }, { $and: [{ author: { $ne: ObjectId(uid) } }, { visibility: "public" }] }] }, fields.split('+').join(' ')).sort({ "reactions.like_count": mode == "asc" ? 1 : -1 }).where('timestamp').lt(timestamp.toString())
            else
                allBlogs = await Blog.find({ $or: [{ author: ObjectId(uid) }, { $and: [{ author: { $ne: ObjectId(uid) } }, { visibility: "public" }] }] }, fields.split('+').join(' ')).sort({ "reactions.like_count": mode == "asc" ? 1 : -1 })

        return res.status(200).send({
            "error": null,
            "result": allBlogs
        })
    } catch (e) {
        console.error(e)
        return res.status(500).send(e)
    }
})

router.get("/blogs/:mode/dislikes", async (req, res, next) => {
    try {
        const queries = req.query
        const uid = queries["uid"]
        const fields = queries["fields"] || ""
        const count = queries["count"] == undefined ? null : parseInt(queries["count"])
        const timestamp = queries["timestamp"]
        const ts_type = parseInt(queries["ts_type"] || -1)

        const mode = req.params.mode

        if (uid) {
            const user = await User.findOne({ _id: ObjectId(uid) })

            if (!user)
                return res.status(404).send({
                    "error": "404-uidNotFound"
                })
        }

        var allBlogs = null

        if (count)
            if (timestamp)
                if (ts_type == 1)
                    allBlogs = await Blog.find(uid ? { author: ObjectId(uid), visibility: "public" } : { visibility: "public" }, fields.split('+').join(' ')).sort({ "reactions.dislike_count": mode == "asc" ? 1 : -1 }).limit(count).where('timestamp').gt(timestamp.toString())
                else
                    allBlogs = await Blog.find(uid ? { author: ObjectId(uid), visibility: "public" } : { visibility: "public" }, fields.split('+').join(' ')).sort({ "reactions.dislike_count": mode == "asc" ? 1 : -1 }).limit(count).where('timestamp').lt(timestamp.toString())
            else
                allBlogs = await Blog.find(uid ? { author: ObjectId(uid), visibility: "public" } : { visibility: "public" }, fields.split('+').join(' ')).sort({ "reactions.dislike_count": mode == "asc" ? 1 : -1 }).limit(count)
        else
            if (timestamp)
                if (ts_type == 1)
                    allBlogs = await Blog.find(uid ? { author: ObjectId(uid), visibility: "public" } : { visibility: "public" }, fields.split('+').join(' ')).sort({ "reactions.dislike_count": mode == "asc" ? 1 : -1 }).where('timestamp').gt(timestamp.toString())
                else
                    allBlogs = await Blog.find(uid ? { author: ObjectId(uid), visibility: "public" } : { visibility: "public" }, fields.split('+').join(' ')).sort({ "reactions.dislike_count": mode == "asc" ? 1 : -1 }).where('timestamp').lt(timestamp.toString())
            else
                allBlogs = await Blog.find(uid ? { author: ObjectId(uid), visibility: "public" } : { visibility: "public" }, fields.split('+').join(' ')).sort({ "reactions.dislike_count": mode == "asc" ? 1 : -1 })

        return res.status(200).send({
            "error": null,
            "result": allBlogs
        })
    } catch (e) {
        console.error(e)
        return res.status(500).send(e)
    }
})

router.post("/blogs/:mode/dislikes", User_Auth, async (req, res, next) => {
    try {
        const queries = req.query
        const fields = queries["fields"] || ""
        const count = queries["count"] == undefined ? null : parseInt(queries["count"])
        const timestamp = queries["timestamp"]
        const ts_type = parseInt(queries["ts_type"] || -1)

        const body = req.body
        const uid = body["uid"]

        const mode = req.params.mode

        var allBlogs = null

        if (count)
            if (timestamp)
                if (ts_type == 1)
                    allBlogs = await Blog.find({ $or: [{ author: ObjectId(uid) }, { $and: [{ author: { $ne: ObjectId(uid) } }, { visibility: "public" }] }] }, fields.split('+').join(' ')).sort({ "reactions.dislike_count": mode == "asc" ? 1 : -1 }).limit(count).where('timestamp').gt(timestamp.toString())
                else
                    allBlogs = await Blog.find({ $or: [{ author: ObjectId(uid) }, { $and: [{ author: { $ne: ObjectId(uid) } }, { visibility: "public" }] }] }, fields.split('+').join(' ')).sort({ "reactions.dislike_count": mode == "asc" ? 1 : -1 }).limit(count).where('timestamp').lt(timestamp.toString())
            else
                allBlogs = await Blog.find({ $or: [{ author: ObjectId(uid) }, { $and: [{ author: { $ne: ObjectId(uid) } }, { visibility: "public" }] }] }, fields.split('+').join(' ')).sort({ "reactions.dislike_count": mode == "asc" ? 1 : -1 }).limit(count)
        else
            if (timestamp)
                if (ts_type == 1)
                    allBlogs = await Blog.find({ $or: [{ author: ObjectId(uid) }, { $and: [{ author: { $ne: ObjectId(uid) } }, { visibility: "public" }] }] }, fields.split('+').join(' ')).sort({ "reactions.dislike_count": mode == "asc" ? 1 : -1 }).where('timestamp').gt(timestamp.toString())
                else
                    allBlogs = await Blog.find({ $or: [{ author: ObjectId(uid) }, { $and: [{ author: { $ne: ObjectId(uid) } }, { visibility: "public" }] }] }, fields.split('+').join(' ')).sort({ "reactions.dislike_count": mode == "asc" ? 1 : -1 }).where('timestamp').lt(timestamp.toString())
            else
                allBlogs = await Blog.find({ $or: [{ author: ObjectId(uid) }, { $and: [{ author: { $ne: ObjectId(uid) } }, { visibility: "public" }] }] }, fields.split('+').join(' ')).sort({ "reactions.dislike_count": mode == "asc" ? 1 : -1 })

        return res.status(200).send({
            "error": null,
            "result": allBlogs
        })
    } catch (e) {
        console.error(e)
        return res.status(500).send(e)
    }
})

module.exports.router = function (_db) {
    db = _db

    // Cleanup service
    const cleaner = async () => {
        var docs = await BlogObjectRequest.find({}).where('date_created').gt(Date.now() + (BLOG_REQUEST_TIMEOUT * 60 * 1000))

        if (docs.length > 0)
            console.log("Cleaning up", docs.length, "incomplete blog requests...")

        docs.forEach(item => item.remove())
    }
    cleaner() // Call at first once
    setInterval(cleaner, CLEANUP_DELAY * 60 * 1000)

    return router
}