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

app.use(favicon(__dirname + '/favicon.ico'));
app.use(morgan('combined'));
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(methodOverride());

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
  room: String,
  from_id:Number
});

var ConversationSchema = mongoose.Schema({
	users:[Number],
	messages:[ChatSchema]
});

var UserSchema = mongoose.Schema({
	userID:Number,
	username:String,
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
 res.json({"main":"true"});
});

app.get('/messages',function(req,res) {

	var from_id = req.query.from_id;
	var to_id = req.query.to_id;

	findConvFor(from_id,to_id,function(err, conv) {
		if(!err){
		res.json(conv.messages);
	} else {
		res.json(err);
	}
	});

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

app.get('/conversations_between', function(req,res){

	var from_id = req.query.from_id;
	var to_id = req.query.to_id;

	findConvFor(from_id,to_id, function(conversation, error){
		if(error) {
			res.json(error);
		} else {
			res.json({"conversation":conversation});
		}
	})

});


//



app.post('/conversations', function(req, res){

	var message = req.body.message;
	var to_id = req.body.to_id;
	var from_id = req.body.from_id;

	messageWork(message, from_id,to_id, function(err, conv){
		if(err){
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
			io.in(to_id).emit('message created', msg);
			res.json(msg);
		}
	});
});


var messageWork = function(message,to_id,from_id,next) {

		findConvFor(from_id, to_id, function(err, conv){
			if(conv){
				saveMessage(message,function(err,msg){
					conv.messages.push(msg);
					conv.save(function(err,convers){
						next(err,convers,msg);
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
	var newMsg = new Chat({
   				   username: data.username,
      				content: data.message,
     				 created: new Date(),
     				 from_id: data.from_id  
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

  socket.on('new message', function(data) {

  	var message = data.message;
	var to_id = data.to_id;
	var from_id = data.from_id;

console.log (message);
console.log(to_id, from_id);
	messageWork(message,to_id,from_id, function(err, conv){
		if(conv){
			//socket.join(to_id);
			//socket.join(from_id);

			var msg = conv.messages[conv.messages.length - 1];
			io.in(to_id).emit('message created', msg);
			io.in(from_id).emit('message created', msg);
		}
	});

  });
});
/*||||||||||||||||||||||||||||||||||||||END SOCKETS||||||||||||||||||||||||||||||||||||||*/

