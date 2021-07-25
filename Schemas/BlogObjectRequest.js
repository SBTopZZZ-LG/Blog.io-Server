const mongoose = require("mongoose")
const Schema = mongoose.Schema

const schema = new Schema({
    requester: {
        type: mongoose.Types.ObjectId,
        required: true
    },
    request_token: {
        type: String,
        required: true
    },
    date_created: {
        type: Number,
        required: true
    }
})

module.exports = mongoose.model("BlogObjectRequests", schema)