
var mongoose = require('mongoose');

var MessageSchema = mongoose.Schema({
  created: Date,
  content: String,
  room: String,
  from_id: Number,
  is_read: Boolean,
  conversation_id:String
});

var ConversationSchema = mongoose.Schema({
  users: [Number],
  messages: [{ type: String, ref: 'Message' }],
  users_refs: [{ type: Number, ref: 'User' }]
});

var UserSchema = mongoose.Schema({
  _id: Number,
  userID: Number,
  first_name: String,
  last_name: String,
  is_ios: Boolean,
  push_key: String,
  thumb_url: String,
  token: String
});

var User = mongoose.model('User',UserSchema);
var Message = mongoose.model('Message', MessageSchema);
var Conversation = mongoose.model('Conversation',ConversationSchema);


module.exports.Message = Message;
module.exports.Conversation = Conversation;
module.exports.User = User;