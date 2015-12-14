var express = require('express');
var favicon = require('serve-favicon');
var mongoose = require('mongoose');
var morgan = require('morgan');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var apn = require('apn');

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
	apns_key:String,
	android_key:String,
	thumb_url:String
});

var ConversationSchema = mongoose.Schema({
	users:[Number],
	messages:[MessageSchema],
	users_refs: [{ type: Number, ref: 'User' }]
});


var User =  mongoose.model('User',UserSchema);
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


	saveUser(req.body, function(err,user){

		if(err) {
			res.json(err);
		} else {
			res.json(user);
		}

	});
});


// Recommend.aggregate(
//     [
//         // Grouping pipeline
//         { "$group": { 
//             "_id": '$roomId', 
//             "recommendCount": { "$sum": 1 }
//         }},
//         // Sorting pipeline
//         { "$sort": { "recommendCount": -1 } },
//         // Optionally limit results
//         { "$limit": 5 }
//     ],
//     function(err,result) {

//        // Result is an array of documents
//     }
// );

app.get('/conversations', function(req,res) {

	var user_id = req.query.user_id;

	Conversation
	.find({users: { "$in" : [user_id]}})
	.select({"messages": { "$slice": -1 }})
	.populate("users_refs")
	.sort("-messages.created")
	.exec(function(err, conversations) { 

		conversations.forEach(function(item){

			item.users_refs.forEach(function(item){
				console.log(item.first_name);
			});

		});
	  	console.log(conversations);

		if(err){
			res.status(500).json(err);
		} else {
			res.json(conversations);
		}
	});
});


app.get('/conversations_between', function(req,res){

	var from_id = req.query.from_id;
	var to_id = req.query.to_id;

	findConvFor(from_id,to_id, function(conversation, error){
		if(error) {
			res.json(error);
		} else {
			res.json(conversation);
		}
	})

});

app.post('/conversations', function(req, res){

	var message = req.body.message;
	var to_id = req.body.to_id;
	var from_id = req.body.from_id;

	messageWork(message, from_id,to_id, function(err, conv){
		if(err){
			// sendPush(message,to_id);
			res.json(err);
		} else {
			res.json(conv);
		}
	});

});

app.post('/messages',function(req,res){
	var message = req.body.message;
	var to_id = req.body.to_id;
	var from_id = req.body.from_id;

	messageWork(message, from_id,to_id, function(err,conv,msg) {

		if (err) {
			res.json(err);
		} else {
			sendPush(msg, to_id);
			io.in(to_id).emit('message created', msg);
			res.json(msg);
		}
	});
});

app.post('/read_messages', function(req, res){
	var to_id = req.body.to_id;
	var from_id = req.body.from_id;


	read_all_messages(from_id,to_id,function(err,conversations) {

		res.json(conversations);

	});
	
});



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
	Conversation.findOne({$or:[{"users":[to_id,from_id]},{"users":[from_id,to_id]}]}, function(err, conv){
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

// var saveConversation = function (conversation, user_id) {

// 	// User.findOne({userID:user_id}, function(err, user){

// 	// 	if(user) {
// 	// 		console.log(user);
// 	// 		user.conversations.push(conversation);
// 	// 	} else {
// 	// 		var u = new User({userID:user_id,
// 	// 					conversations:[conversation]
// 	// 		});
// 	// 		u.save();
// 	// 	}

// 	// });
// }

var saveUser = function(data,next) {
	var user_id = data.user_id;
	User.findOne({userID:user_id}, function(err, user){
		if(!user) {
			user = new User({userID:user_id,_id:user_id});
		} 
		var is_ios = data.is_ios;
		var first_name = data.first_name;
		var last_name = data.last_name;
		var thumb_url = data.thumb_url;

		user.is_ios = is_ios;
		user.first_name = first_name;
		user.last_name = last_name;
		user.thumb_url = thumb_url;

		if (is_ios) {
			var apns_key = data.apns_key;
			user.apns_key = apns_key;
		}
		user.save(function(err) {
			next(err,user);

		});
	 });
}

var sendPush = function (message,to_id) {

	User.findOne({userID:message.from_id}, function(err, sender){
		User.findOne({userID:to_id}, function(err, reciever){
			if(sender && reciever) {
				if(reciever.is_ios && reciever.apns_key) {
					var myDevice = new apn.Device(reciever.apns_key);
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

var read_all_messages = function(from_id, to_id, next) {

	// findOne({$or:[{"users":[to_id,from_id]},{"users":[from_id,to_id]}]}

	Conversation.
	findOne({$or:[{"users":[to_id,from_id]},{"users":[from_id,to_id]}]}).
	select({$and:[{"messages.is_read":false},{"messages.from_id":to_id}]}).
	exec(function(err, conversations){
		console.log(conversations)
		next(err,conversations);
	});
}

/*||||||||||||||||||||||||||||||||||||||END ROUTES||||||||||||||||||||||||||||||||||||||*/

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

