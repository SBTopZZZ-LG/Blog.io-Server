const mongoose = require("mongoose")
const Schema = mongoose.Schema

const schema = new Schema({
    cover_image: {
        type: String
    },
    author: {
        type: String,
        required: true
    },
    visibility: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    content: {
        type: Array,
        default: []
    },
    reactions: {
        like_count: {
            type: Number,
            default: 0
        },
        likes: {
            type: Array,
            default: []
        },
        dislike_count: {
            type: Number,
            default: 0
        },
        dislikes: {
            type: Array,
            default: []
        }
    },
    comments: [{
        comment: {
            author: {
                type: mongoose.Types.ObjectId,
                required: true
            },
            content: {
                type: String,
                required: true
            },
            reactions: {
                like_count: {
                    type: Number,
                    default: 0
                },
                likes: {
                    type: Array,
                    default: []
                },
                dislike_count: {
                    type: Number,
                    default: 0
                },
                dislikes: {
                    type: Array,
                    default: []
                }
            },
            timestamp: {
                type: Number,
                required: true
            }
        }
    }],
    timestamp: {
        type: Number,
        default: Date.now()
    }
})

module.exports = mongoose.model("Blogs", schema)