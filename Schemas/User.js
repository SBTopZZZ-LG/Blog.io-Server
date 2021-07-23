const mongoose = require("mongoose")
const Schema = mongoose.Schema

const schema = new Schema({
    name: {
        type: String
    },
    email: {
        type: String,
        required: true
    },
    avatar_url: {
        type: String
    },
    key: {
        type: String,
        required: true
    },
    bio: {
        type: String
    },
    dob: {
        type: Date
    },
    blogs_posted: {
        type: Array,
        default: []
    },
    followers: {
        type: Array,
        default: []
    },
    login_token: {
        type: String
    }
})

module.exports = mongoose.model('Users', schema)