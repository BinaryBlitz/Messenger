/* jshint node: true */
'use strict';

//server
var express = require('express');
var favicon = require('serve-favicon');
var mongoose = require('mongoose');
var morgan = require('morgan');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');

//config
var config = require('config');

//tokens
var crypto = require('crypto');
var base64url = require('base64url');

//push
var apn = require('apn');
var gcm = require('node-gcm');

var options = config.get('push.options');
var apnConnection = new apn.Connection(options);

//db
var User = require('./models/models').User;
var Message = require('./models/models').Message;
var Conversation = require('./models/models').Conversation;

//server
var app = express();
app.set('port', (process.env.PORT || 5000));

var server = app.listen(app.get('port'), function() {
  console.log('Express server listening on port ' + app.get('port'));
});

var messager_api_key = config.get('server.api_key');

var io = require('socket.io')(server);

app.use(favicon(__dirname + '/favicon.ico'));
app.use(morgan('combined'));
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());
app.use(methodOverride());

//Connect to mongo DB database
var uristring = config.get('dbConfig.host');

mongoose.connect(uristring, function(err, res) {
  if (err) {
    console.log('ERROR connecting to: ' + uristring + '. ' + err);
  } else {
    console.log('Succeeded connected to: ' + uristring + ' ' + res);
  }
});

var options = {
  production: false
};

var apnConnection = new apn.Connection(options);


//Allow CORS
app.all('/*', function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-type,Accept,X-Access-Token,X-Key');
  if (req.method == 'OPTIONS') {
    res.status(200).end();
  } else {
    next();
  }
});

/*||||||||||||||||||||||||||||||||||||||ROUTES||||||||||||||||||||||||||||||||||||||*/
//Route for our index file

app.post('/registration', function(req, res) {

  var messgeaApiKey = req.body.user_api_key;

  if (messgeaApiKey !== messager_api_key) {
    res.status(422).json({
      'error': 'apiKey_error'
    });
  } else {
    var usr = req.body.user;
    saveUser(usr, function(err, user) {
      console.log(user);
      if (err) {
        res.json(err);
      } else {
        res.json(user);
      }
    });
  }
});

app.get('/conversations', function(req, res) {
  console.log("query " + req.query);
  findUserWithToken(req.query.token, function(err, user) {
    if (user) {
      console.log("user " + user);
      var user_id = user.userID;
      Conversation
        .find({
          users: {
            '$in': [user_id]
          }
        })
        .populate('users_refs')
        .select({
          'messages': {
            '$slice': -20
          }
        })
        .populate('messages')
        .sort('-last_date')
        .exec(function(err, conversations) {
          console.log("convs " + conversations)
          if (err) {
            console.log("errror " + err)
            res.status(500).json(err);
          } else {
            res.json(conversations);
          }
        });
    } else {
      console.log("no user")
      res.status(401).json(err);
    }
  });
});

app.get('/conversation_between', function(req, res) {
  findUserWithToken(req.query.token, function(err, user) {
    if (user) {
      var from_id = user.userID;
      var to_id = req.query.to_id;

      findConvFor(from_id, to_id, function(error, conversation) {
        if (error) {
          res.status(500).json(error);
        } else {
          res.json(conversation);
        }
      });
    } else {
      console.log(err);
      res.status(500).json(err);
    }
  });
});

app.get('/messages', function(req, res) {
  findUserWithToken(req.query.token, function(err, user) {
    if (user) {
      var from_id = user.userID;
      var to_id = req.query.to_id;

      var count = req.query.count;
      var last_date = req.query.last_date;
      last_date = new Date(last_date);
      // from_id, to_id, count, offset, next
      findMessages(from_id, to_id, count, last_date, function(err, messages) {
        if (err) {
          console.log('messages find error');
          console.log(err);
          res.status(500).json(err);
        } else {
          console.log(messages);
          res.json(messages);
        }
      });
    } else {
      console.log('user fail');
      console.log(err);
      res.status(401).json(err);
    }
  });
});


app.post('/messages', function(req, res) {
  findUserWithToken(req.body.token, function(err, user) {

    if (user) {
      var msg_text = req.body.message;
      var to_id = req.body.to_id;
      var from_id = parseInt(user.userID);
      var message = {
        from_id: from_id,
        message: msg_text
      };
      messageWork(message, from_id, to_id, function(err, conv, msg) {
        if (err) {
          res.status(500).json(err);
        } else {
          sendPush(msg, to_id);
          io.in(to_id).emit('message_created', msg);
          res.json(msg);
        }
      });
    } else {
      res.status(500).json(err);
    }
  });
});

app.post('/read_messages', function(req, res) {
  findUserWithToken(req.body.token, function(err, user) {
    if (user) {
      var to_id = parseInt(req.body.to_id);
      var from_id = user.userID;
      console.log(user);
      readAllMessages(from_id, to_id, function(err, conversations) {
        if (!err) {
          res.json({
            "status": "done"
          });
        } else {
          console.log('conversation fail');
          console.log(err);
          res.status(500).json(err);
        }
      });
    } else {
      console.log('no user');
      console.log(err);
      res.status(500).json(err);
    }
  });
});

app.delete('/user_log_out', function(req, res) {
  console.log(req.body.token);
  findUserWithToken(req.query.token, function(err, user) {
    if (user) {
      user.push_key = null;
      user.token = null;

      user.save(function(err, user) {
        if (user) {
          res.json({
            "status": "done"
          });
          console.log(user);
        } else {
          res.status(500).json(err);
        }
      });
    } else {
      res.status(500).json(err);
    }
  });
});

/*||||||||||||||||||||||||||||||||||||||END ROUTES||||||||||||||||||||||||||||||||||||||*/

/*||||||||||||||||||||||||||||||||||||||FUNCTIONS||||||||||||||||||||||||||||||||||||||*/

var messageWork = function(message, to_id, from_id, next) {
  findConvFor(from_id, to_id, function(err, conv) {
    if (conv) {
      conv.users_refs = [to_id, from_id];
      message.conversation_id = conv._id;
      saveMessage(message, function(err, msg) {

        conv.messages.push(msg._id);
        conv.last_date = msg.created;
        conv.save(function(err, convers) {
          next(err, convers, msg);
        });
      });
    } else {
      saveMessage(message, function(err, msg) {
        conv = new Conversation({
          users: [to_id, from_id],
          last_date: msg.created,
          users_refs: [to_id, from_id],
          messages: [msg._id]
        });
        // conv.last_date = msg.created;
        conv.save(function(error, convers) {
          msg.conversation_id = convers._id;
          msg.save(function(err, msg) {});

          next(err, convers, msg);
        });
      });
    }
  });
};

var findConvFor = function(from_id, to_id, next) {
  Conversation
    .findOne({
      $or: [{
        'users': [to_id, from_id]
      }, {
        'users': [from_id, to_id]
      }]
    })
    .select({
      'messages': {
        '$slice': -20
      }
    })
    .populate('users_refs messages')
    .exec(function(err, conv) {
      next(err, conv);
    });
};


var findMessages = function(from_id, to_id, count, last_date, next) {
  findConvFor(from_id, to_id, function(error, conversation) {
    if (conversation) {
      Message
        .find({
          conversation_id: conversation._id,
          created: {
            $lt: last_date
          }
        })
        .sort('-created')
        .limit(count)
        .exec(function(err, messages) {
          if (messages) {
            messages = messages.reverse();
          }
          next(err, messages);

        });
    } else {
      var arr = [];
      next(error, arr);
    }
  });
};

var saveMessage = function(data, next) {
  console.log(data);
  var newMsg = new Message({
    content: data.message,
    created: new Date(),
    from_id: data.from_id,
    is_read: false,
    conversation_id: data.conversation_id
  });
  newMsg.save(function(err, msg) {
    next(err, msg);
  });
};

function randomStringAsBase64Url(size) {
  return base64url(crypto.randomBytes(size));
}

var saveUser = function(data, next) {
  var user_id = parseInt(data.user_id);
  User.findOne({
    userID: user_id
  }, function(err, user) {
    if (!user) {
      user = new User({
        userID: user_id,
        _id: user_id
      });
    }
    var is_ios = data.is_ios;
    var first_name = data.first_name;
    var last_name = data.last_name;
    var thumb_url = data.thumb_url;
    var push_key = data.push_key;
    var user_api_key = randomStringAsBase64Url(16);

    user.is_ios = is_ios;
    user.first_name = first_name;
    user.last_name = last_name;
    user.thumb_url = thumb_url;
    user.token = user_api_key;
    user.push_key = push_key;

    user.save(function(err) {
      next(err, user);
    });
  });
};

var findUserWithToken = function(token, next) {
  User.findOne({
    token: token
  }, function(err, user) {
    next(err, user);
  });
};

var sendPush = function(message, to_id) {
  User.findOne({
    userID: message.from_id
  }, function(err, sender) {
    User.findOne({
      userID: to_id
    }, function(err, receiver) {
      console.log(receiver);
      if (sender && receiver && receiver.push_key) {
        if (receiver.is_ios) {
          sendPushIOS(sender, receiver, message);
        } else {
          sendPushAndroid(sender, receiver, message);
        }
      }
    });
  });
};

var sendPushIOS = function(sender, receiver, message) {
  var myDevice = new apn.Device(receiver.push_key);
  var note = new apn.Notification();
  note.expiry = Math.floor(Date.now() / 1000) + 3600 * 6;
  note.sound = 'ping.aiff';
  note.alert = sender.first_name + ' ' + sender.last_name + ': ' + message.content;
  note.payload = {
    'messageFrom': sender.userID,
    'action': 'MESSAGE'
  };
  apnConnection.pushNotification(note, myDevice);
};

var sendPushAndroid = function(sender, receiver, message) {
  var gcmessage = new gcm.Message();

  gcmessage.addData('action', 'MESSAGE');
  gcmessage.addNotification({
    title: 'Mates',
    body: sender.first_name + ' ' + sender.last_name+': '+message.content,
    icon: 'ic_launcher'
  });

  // gcmessage.addData({
  //   'action': 'MESSAGE',
  //   'messageFrom': sender.userID
  // });

  console.log(gcmessage);
  var receiver_token = receiver.push_key;
  var regTokens = [receiver_token];

  var android_api_key = config.get('push.android_api_key');
  var gcmsender = new gcm.Sender(android_api_key);


  gcmsender.send(gcmessage, {
      registrationTokens: regTokens
    },
    function(err, response) {
      if (err) console.error(err);
      else console.log(response);
    });
};

var readAllMessages = function(from_id, to_id, next) {
  console.log(from_id + ' ' + to_id);

  findConvFor(from_id, to_id, function(err, conversation) {
    if (conversation) {
      Message
        .find({
          conversation_id: conversation._id,
          is_read: false,
          from_id: to_id
        })
        .sort('created')
        .exec(function(err, messages) {
          if (!err) {
            messages.forEach(function(item) {
              if (!item.is_read && item.from_id == to_id) {
                item.is_read = true;
                item.save();
              }
            });
          }
          next(err, conversation)
        });
    } else {
      next(err, null);
    }
  });
};

/*||||||||||||||||||||||||||||||||||||||END FUNCTIONS||||||||||||||||||||||||||||||||||||||*/

/*||||||||||||||||||||||||||||||||||||||SOCKET||||||||||||||||||||||||||||||||||||||*/
//Listen for connection
io.on('connection', function(socket) {
  socket.emit('setup', {
    status: 'connected'
  });
  socket.on('new_user', function(data) {
    var token = data.token;

    findUserWithToken(token, function(err, user) {
      if (user) {
        console.log(user.userID);
        socket.join(user.userID);
      }
    });
  });

});
/*||||||||||||||||||||||||||||||||||||||END SOCKETS||||||||||||||||||||||||||||||||||||||*/
