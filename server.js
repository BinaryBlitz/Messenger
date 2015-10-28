var express = require('express');
var favicon = require('serve-favicon');
var mongoose = require('mongoose');
var morgan = require('morgan');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var app = express();
app.set('port', (process.env.PORT || 5000));
//var server = require('http').Server(app);

var server = app.listen(app.get('port'), function () {
    console.log('Express server listening on port ' + app.get('port'));
});

var io = require('socket.io')(server);

//Set our static file directory to public
//app.use(express.static(__dirname + '/public'));


app.use(favicon(__dirname + '/favicon.ico'));
app.use(morgan('combined'));
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(methodOverride());

//app.set('port', (process.env.PORT || 80));
//app.use(express.static(path.join(__dirname, "public")));


//Connect to mongo DB database

var uristring = 'mongodb://heroku_gchjr54d:kghikrooqpah31jt5f9bvhr7n2@ds041484.mongolab.com:41484/heroku_gchjr54d'||
    process.env.MONGOLAB_URI ||
    process.env.MONGOHQ_URL ||
    'mongodb://localhost:27017/HelloMongoose';

mongoose.connect(uristring, function(err,res) {
	 if (err) {
        console.log ('ERROR connecting to: ' + uristring + '. ' + err);
     //   trow err;
    } else {
        console.log ('Succeeded connected to: ' + uristring);
    }
});

//Create a schema for chat

var ChatSchema = mongoose.Schema({
  created: Date,
  content: String,
  username: String,
  room: String
});

var ConversationSchema = mongoose.Schema({

	users:[Number],
	messages:[ChatSchema]

});

var UserSchema = mongoose.Schema({

	userID:Number,
	username:String,
	conversations:[ConversationSchema]

});



var User =  mongoose.model('User',UserSchema);
var Chat = mongoose.model('Chat', ChatSchema);
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
  //send the index.html in our public directory
 // res.sendfile('index.html');
 res.json({"main":"true"});
});


//This route is simply run only on first launch just to generate some chat history
// app.post('/setup', function(req, res) {
//   //Array of chat data. Each object properties must match the schema object properties
//   var chatData = [{
//     created: new Date(),
//     content: 'Hi',
//     username: 'Chris',
//     room: 'php'
//   }, {
//     created: new Date(),
//     content: 'Hello',
//     username: 'Obinna',
//     room: 'laravel'
//   }, {
//     created: new Date(),
//     content: 'Ait',
//     username: 'Bill',
//     room: 'angular'
//   }, {
//     created: new Date(),
//     content: 'Amazing room',
//     username: 'Patience',
//     room: 'socket.io'
//   }];

//   //Loop through each of the chat data and insert into the database
//   for (var c = 0; c < chatData.length; c++) {
//     //Create an instance of the chat model
//     var newChat = new Chat(chatData[c]);
//     //Call save to insert the chat
//     newChat.save(function(err, savedChat) {
//       console.log(savedChat);
//     });
//   }
//   //Send a resoponse so the serve would not get stuck
//   res.json({message: 'Point created!'});
//  // res.send('created');
// });

//This route produces a list of chat as filterd by 'room' query
// app.get('/msg', function(req, res) {
//   //Find
//   Chat.find({
//     'room': req.query.room.toLowerCase()
//   }).exec(function(err, msgs) {
//     //Send
//     res.json(msgs);
//   });
// });

// app.post('/users/registre', function(req,res){
// 	var user_id = req.query.user_id;
// 	var username = req.query.username;
// 	User.findOne({"userID":user_id}, function(err,user){
// 	if(err) {
// 		var u = new User({userID:user_id, username:username,conversations:[]});
// 		u.save(function(err,usr){
// 			if(!err){
// 			res.json({"user":usr});
// 		} else {
// 			res.json(err);
// 		}
// 		});
// 	} else {
// 		res.json({"user":user});
// 	}
// 	});
// });

//TODO
app.get('/messages',function(req,res) {

	var from_id = req.query.from_id;
	var to_id = req.query.to_id;



});



app.get('/conversations', function(req,res) {

	var user_id = req.query.user_id;

	Conversation.find ({users: { "$in" : [user_id]}}, function(err, conversations){

		if(err){
			res.json(err);
		} else {

			res.json(conversations);
		}
	});
});

app.post('/conversations', function(req, res){

	var message = req.body.message;
	var to_id = req.body.to_id;
	var from_id = req.body.from_id;

	// findConvFor(from_id, to_id, function(err, conv){
	// 	if(conv){
	// 		saveMessage(message,function(err,msg){
	// 			conv.messages.push(msg);
	// 			conv.save(function(err,converss){
	// 				res.json(converss);
	// 			});
	// 		});
	// 	} else {
	// 		saveMessage(message, function(err, msg){

	// 		conv = new Conversation ({users : [to_id,from_id],
	// 										messages :[msg]
	// 									});

	// 		conv.save(function(error,convers){
	// 			if(error){
	// 				res.json(error);
	// 			} else {
	// 				saveConversation(convers, to_id);
	// 				saveConversation(convers, from_id);
	// 				res.json(convers);
	// 			}
	// 		});
	// 	});
	// 	}
	// }

	// );

	messageWork(message, from_id,to_id, function(err, conv){
		if(err){
			res.json(err);
		} else {
			res.json(conv);
		}
	});

});


var messageWork = function(message,to_id,from_id,next) {

		findConvFor(from_id, to_id, function(err, conv){
			if(conv){
				saveMessage(message,function(err,msg){
					conv.messages.push(msg);
					conv.save(function(err,convers){
						next(err,convers);
					});
				});
			} else {
				saveMessage(message, function(err, msg){
					conv = new Conversation ({users : [to_id,from_id], messages :[msg] });
					conv.save(function(error,convers){
						if(!error){
							saveConversation(convers, to_id);
							saveConversation(convers, from_id);
						}
						next(err, convers);
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
	console.log(data);
	var newMsg = new Chat({
   				   username: data.username,
      				content: data.message,
     				 created: new Date() 
     	      });
	newMsg.save(function(err,msg){
		next(err,msg);
	});
}

var saveConversation = function (conversation, user_id) {

	User.findOne({userID:user_id}, function(err, user){

		if(user) {
			console.log(user);
			user.conversations.push(conversation);
		} else {
			var u = new User({userID:user_id,
						conversations:[conversation]
			});
			u.save();
		}

	});
}

// app.post('/conversations', function(req, res) {
// 	var from_id = req.query.from_id;
// 	var to_id = req.query.to_id;

// 	Conversation.find($or:[[]])

// }
// );
/*||||||||||||||||||||||||||||||||||||||END ROUTES||||||||||||||||||||||||||||||||||||||*/

/*||||||||||||||||||||||||||||||||||||||SOCKET||||||||||||||||||||||||||||||||||||||*/
//Listen for connection
io.on('connection', function(socket) {
  //Globals
  // var defaultRoom = 'general';
  // var rooms = ["General", "angular", "socket.io", "express", "node", "mongo", "PHP", "laravel"];


  //Emit the rooms array
  socket.emit('setup', {
    status:"connected"
  });

  socket.on('new user', function(data) {
  	socket.join(data.user_id);
  	socket.in(data.user_id).emit({status:'joined'});
  });

  //Listens for new user
  // socket.on('new user', function(data) {
  //   data.room = defaultRoom;
  //   //New user joins the default room
  //   socket.join(defaultRoom);
  //   //Tell all those in the room that a new user joined
  //   io.in(defaultRoom).emit('user joined', data);
  // });

  //Listens for switch room
  // socket.on('switch room', function(data) {
  //   //Handles joining and leaving rooms
  //   //console.log(data);
  //   socket.leave(data.oldRoom);
  //   socket.join(data.newRoom);
  //   io.in(data.oldRoom).emit('user left', data);
  //   io.in(data.newRoom).emit('user joined', data);

  // });

  //Listens for a new chat message
  socket.on('new message', function(data) {

  	var message = data.message;
	var to_id = data.to_id;
	var from_id = data.from_id;

console.log (message);
	messageWork(message,to_id,from_id, function(err, conv){
		if(conv){
			var msg = conv.messages[conv.messages.length - 1];
			io.in(to_id).emit('message created', msg);
			io.in(from_id).emit('message created', msg);
		}
	});
    //Create message
    // var newMsg = new Chat({
    //   username: data.username,
    //   content: data.message,
    //   room: data.room.toLowerCase(),
    //   created: new Date()
    // });
    // //Save it to database
    // newMsg.save(function(err, msg){
    //   //Send message to those connected in the room
    //   io.in(msg.room).emit('message created', msg);
    // });


  });
});
/*||||||||||||||||||||||||||||||||||||||END SOCKETS||||||||||||||||||||||||||||||||||||||*/

// app.listen(app.get('port'), function () {
//     console.log('Express server listening on port ' + app.get('port'));
// });
// console.log('It\'s going down in 2015');