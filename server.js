var express = require('express');
var favicon = require('serve-favicon');
var mongoose = require('mongoose');
var morgan = require('morgan');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var apn = require('apn');
var crypto = require('crypto');
var base64url = require('base64url');

var app = express();
app.set('port', (process.env.PORT || 5000));
//var server = require('http').Server(app);

var server = app.listen(app.get('port'), function () {
    console.log('Express server listening on port ' + app.get('port'));
});

var io = require('socket.io')(server);

app.use(favicon(__dirname + '/favicon.ico'));
app.use(morgan('combined'));
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(methodOverride());

//Connect to mongo DB database
var messager_api_key = 'this_is_my_awesome_api_key'; 

var uristring = 'mongodb://heroku_gchjr54d:kghikrooqpah31jt5f9bvhr7n2@ds041484.mongolab.com:41484/heroku_gchjr54d';

mongoose.connect(uristring, function(err,res) {
	 if (err) {
        console.log ('ERROR connecting to: ' + uristring + '. ' + err);
     //   trow err;
    } else {
        console.log ('Succeeded connected to: ' + uristring);
    }
});

var options = {production:false};

var apnConnection = new apn.Connection(options);

//Create a schema for chat

var MessageSchema = mongoose.Schema({
  created: Date,
  content: String,
  room: String,
  from_id:Number,
  is_read:Boolean
});


var UserSchema = mongoose.Schema({
	_id: Number,
	userID:Number,
	first_name:String,
	last_name:String,
	is_ios:Boolean,
	push_key:String,
	thumb_url:String,
	token:String
});

var ConversationSchema = mongoose.Schema({
	users:[Number],
	messages:[MessageSchema],
	users_refs: [{ type: Number, ref: 'User' }]
});


var User = mongoose.model('User',UserSchema);
var Message = mongoose.model('Message', MessageSchema);
var Conversation = mongoose.model('Conversation',ConversationSchema);

//Allow CORS
app.all('/*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
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
app.get('/', function(req, res) {
 res.json({"main":"true"});
});


app.post('/registration',function(req, res) {

	var messgeaApiKey = req.body.token;

	if(messgeaApiKey !== messager_api_key) {
		res.status(422).json({"error":"apiKey_error"})
	} else {
		var usr = req.body.user;
		saveUser(usr, function(err,user){

			console.log(user);

			if(err) {
				res.json(err);
			} else {
				res.json(user);
			}

		});
	}
});



app.get('/conversations', function(req,res) {

	findUserWithToken(req.query.token, function(err,user) {

		if(user) {
			var user_id =user.userID;

	Conversation
	.find({users: { "$in" : [user_id]}})
	.select({"messages": { "$slice": -10 }})
	.populate("users_refs")
	.sort("-messages.created")
	.exec(function(err, conversations) { 
		conversations.forEach(function(item){
			item.users.forEach(function(it){
				console.log("conversation types " + typeof(it));
			});
		});
		if(err){
			res.status(500).json(err);
		} else {
			res.json(conversations);
		}
	});
	 } else {
			res.status(500).json(err);
	}
}); 
});


app.get('/conversations_between', function(req,res){

	console.log("token " + req.query.token);

	findUserWithToken(req.query.token, function(err,user) {
	console.log("token " + req.query.token + user);
	if(user) {
		var from_id = user.userID;
		var to_id =req.query.to_id;

	console.log(from_id + "  " + to_id + " type from_id" + typeof(from_id) + "type to_id" + typeof(to_id));

	findConvFor(from_id, to_id, function(error, conversation){

		console.log("conversation beetween" + conversation);
		if(error) {
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


app.post('/messages',function(req,res){
	findUserWithToken(req.body.token, function(err,user) {

	if(user) {
	var message = req.body.message;
	var to_id = req.body.to_id;
	var from_id = parseInt(user.userID);

	messageWork(message, from_id,to_id, function(err,conv,msg) {
		if (err) {
			res.status(500).json(err);
		} else {
			sendPush(msg, to_id);
			io.in(to_id).emit('message created', msg);
			res.json(msg);
		}
	}); 
	} else {
		res.status(500).json(err);
	}
});
});

app.post('/read_messages', function(req, res){
findUserWithToken(req.body.token, function(err,user) {
	if(user) {
	var to_id = parseInt(req.body.to_id);
	var from_id = user.userID;

	console.log(user);

	read_all_messages(from_id,to_id,function(err,conversations) {

		if(!err) {
		res.json(conversations);
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

var messageWork = function(message,to_id,from_id,next) {

		findConvFor(from_id, to_id, function(err, conv){
			if(conv){
				conv.users_refs = [to_id,from_id];
				saveMessage(message,function(err,msg){

					conv.messages.push(msg);
					conv.save(function(err,convers){
						next(err,convers,msg);
					});
				});
			} else {
				saveMessage(message, function(err, msg){
					conv = new Conversation ({users : [to_id,from_id], users_refs:[to_id,from_id], messages :[msg]});
					conv.save(function(error,convers){
						// if(!error){
						// 	saveConversation(convers, to_id);
						// 	saveConversation(convers, from_id);
						// }
						next(err, convers, msg);
					});
				});
			}
		});
}

var findConvFor = function(from_id, to_id,next){
	Conversation.findOne({$or:[{"users":[to_id,from_id]},{"users":[from_id,to_id]}]})
	.populate("users_refs").exec(function(err, conv){
		next(err,conv);
	});
}

var saveMessage = function (data, next) {
	//console.log(data);
	var newMsg = new Message({
      				content: data.message,
     				 created: new Date(),
     				 from_id: data.from_id,
     				 is_read:false
     	      });
	newMsg.save(function(err,msg){
		next(err,msg);
	});
}

function randomStringAsBase64Url(size) {
  return base64url(crypto.randomBytes(size));
}

var saveUser = function(data,next) {
	var user_id = parseInt(data.user_id);
	User.findOne({userID:user_id}, function(err, user){
		if(!user) {
			user = new User({userID:user_id,_id:user_id});
		} 
		var is_ios = data.is_ios;
		var first_name = data.first_name;
		var last_name = data.last_name;
		var thumb_url = data.thumb_url;
		var user_api_key = randomStringAsBase64Url(16);
		user.is_ios = is_ios;
		user.first_name = first_name;
		user.last_name = last_name;
		user.thumb_url = thumb_url;
		user.token = user_api_key;

		if (is_ios) {
			var push_key = data.push_key;
			user.push_key = push_key;
		}
		user.save(function(err) {
			next(err,user);

		});
	 });
}

var findUserWithToken = function(token, next) {
	User.findOne({token:token}, function(err, user) {
		next(err, user);
	});
}

var sendPush = function (message,to_id) {

	User.findOne({userID:message.from_id}, function(err, sender){
		User.findOne({userID:to_id}, function(err, reciever){
			if(sender && reciever) {
				if(reciever.is_ios && reciever.push_key) {
					var myDevice = new apn.Device(reciever.push_key);
					var note = new apn.Notification();
					note.expiry = Math.floor(Date.now() / 1000) + 3600*6; // Expires 6 hour from now.
					note.sound = "ping.aiff";
					note.alert = sender.first_name + " " + sender.last_name +": "+message.content;
					note.payload = {'messageFrom': sender.userID};
					apnConnection.pushNotification(note, myDevice); 
				}
			}
		});
	});
}

var read_all_messages = function(from_id, to_id, next) {//REDO

	console.log(from_id + "  " + to_id); 

	Conversation.findOne({$or:[{"users":[to_id,from_id]},{"users":[from_id,to_id]}]}, function(err,conversation){

		console.log (conversation);

		conversation.messages.forEach(function(item){

			if(!item.is_read && item.from_id == to_id) {
				item.is_read = true;					
			}
		});

		conversation.save(function(err) {
				next(err,conversation);
		});
	});
}

/*||||||||||||||||||||||||||||||||||||||END FUNCTIONS||||||||||||||||||||||||||||||||||||||*/

/*||||||||||||||||||||||||||||||||||||||SOCKET||||||||||||||||||||||||||||||||||||||*/
//Listen for connection
io.on('connection', function(socket) {

  socket.emit('setup', {
    status:"connected"
  });

  socket.on('new user', function (data){

  	var user_id = data.user_id;

  	console.log(user_id);

  	socket.join(user_id);

  });


//   socket.on('new message', function(data) {

//   	var message = data.message;
// 	var to_id = data.to_id;
// 	var from_id = data.from_id;

// console.log (message);
// console.log(to_id, from_id);
// 	messageWork(message,to_id,from_id, function(err, conv){
// 		if(conv){
// 			//socket.join(to_id);
// 			//socket.join(from_id);

// 			var msg = conv.messages[conv.messages.length - 1];
// 			io.in(to_id).emit('message created', msg);
// 			io.in(from_id).emit('message created', msg);
// 		}
// 	});

//   });
});
/*||||||||||||||||||||||||||||||||||||||END SOCKETS||||||||||||||||||||||||||||||||||||||*/

