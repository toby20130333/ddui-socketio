//导入socket.io模块
var io = require('socket.io');
//加载express服务框架
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var session = require('express-session');
//加载数据模型
global.dbHandel = require('./database/dbHandel');  // 全局handel获取数据库Model
//连接本地mongodb
global.db = mongoose.connect("mongodb://127.0.0.1:27017/dduidb");
//实例express服务
var app = express(),
    server = require('http').createServer(app) ,
    io = io.listen(server);

app.use(session({
    secret: 'secret',
    cookie:{
        maxAge: 1000*60*600
    }
}));

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(function(req,res,next){
    res.locals.user = req.session.user;
    var err = req.session.error;
    delete req.session.error;
    res.locals.message = "";
    if(err){
        res.locals.message = '<div class="alert alert-danger" style="margin-bottom:20px;color:red;">'+err+'</div>';
    }
    next();
});
// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

server.listen(8000);

//var server = require('socket.io');
// 存储所有客户端 socket 和 name
var clients = new Array();
function getTime(){   // 获取时间格式
	var date = new Date();
	var time = "["+date.getFullYear()+"/"+(date.getMonth()+1)+"/"+date.getDate()+" "+date.getHours()+":"+date.getMinutes()+":"+date.getSeconds()+"]";
	return time;
}
//保存聊天记录
function storeContent(_name,_content,_time){
	var Content = global.dbHandel.getModel('content');
	Content.create({
		name: _name,
		data:_content,
		time:_time
	},function(err,doc){
		if(err){
			console.log(err);
		}else{
			console.log("store content :  success ");
		}
	});
}
// 获取上线的用户
function getUserUp(ssocket){
var User = global.dbHandel.getModel('user');
       User.find({status: "up"},function(err,docs){
       	if(err){
       		console.log(err);
       	}else{
       		console.log('users list --default: '+docs);
       		// 因为是回调函数  socket.emit放在这里可以防止  用户更新列表滞后
       		ssocket.broadcast.emit('user_list',docs);   		//更新用户列表
       		ssocket.emit('user_list',docs);   		//更新用户列表

       	}
       });
}
//获取所有用户
function getAllUserList(ssocket){
  var User = global.dbHandel.getModel('user');
         User.find(function(err,docs){
         	if(err){
         		console.log(err);
         	}else{
         		console.log('users list --default: '+docs);
         		// 因为是回调函数  socket.emit放在这里可以防止  用户更新列表滞后
         		ssocket.broadcast.emit('all_list',docs);   		//更新用户列表
         		ssocket.emit('all_list',docs);   		//更新用户列表

         	}
         });
}
//监听客户端连接
io.sockets.on('connection',function(socket){   // server listening
	console.log('socket.id '+socket.id+ ':  connecting');  // console-- message
      getAllUserList(socket);//获取所有注册用户
      getUserUp(socket);	//获取在线用户
		 // 构造用户对象client
      var client = {
	     Socket: socket,
	     name: '----'
      };
      socket.on("message",function(name){
      		client.name = name;                    // 接收user name
      		clients.push(client);                     //保存此client
      		console.log("client-name:  "+client.name);
      		socket.broadcast.emit("userIn","system@: 【"+client.name+"】-- a newer ! Let's welcome him ~");
      });
      socket.emit("system","system@:  Welcome ! Now chat with others");

	//广播客户传来的数据并处理
  // 群聊阶段
	socket.on('say',function(content){
		console.log("server: "+client.name + "  say : " + content);
		//置入数据库
		var time = getTime();
		socket.emit('user_say',client.name,time,content);
		socket.broadcast.emit('user_say',client.name,time,content);
		storeContent(client.name,content,time);   //保存聊天记录
	});

  //私聊阶段
	socket.on("say_private",function(fromuser,touser,content){
		var toSocket = "";
		for(var n in clients){
			if(clients[n].name === touser){     // get touser -- socket
				toSocket = clients[n].Socket;
			}
		}
		console.log("toSocket:  "+toSocket.id);
		if(toSocket != ""){
		socket.emit("say_private_done",touser,content);   //数据返回给fromuser
		toSocket.emit("sayToYou",fromuser,content);     // 数据返回给 touser
		console.log(fromuser+" 给 "+touser+"发了份私信： "+content);
		}
	});
  // 更新用户信息
     function updateInfo(User,oldName,uname,usex){
       	User.update({name:oldName},{$set: {name: uname, sex: usex}},function(err,doc){   //更新用户名
				if(err){
					console.log(err);
				}else{
					for(var n in clients){                       //更新全局数组中client.name
						if(clients[n].Socket === socket){     // get socket match
							clients[n].name = uname;
						}
					}
					socket.emit("setInfoDone",oldName,uname,usex);   // 向客户端返回信息已更新成功
					socket.broadcast.emit("userChangeInfo",oldName,uname,usex);
		                   console.log("【"+oldName+"】changes name to "+uname);
		                   global.userName = uname;
		                   getUserUp(socket);      // 更新用户列表
				}
			});
    }

  // 接收客户端 更改信息请求
	socket.on("setInfo",function(oldName,uname,usex){
		console.log(oldName+"  "+uname+"  "+usex);
		// 查看昵称是否冲突并数据更新
	var User =global.dbHandel.getModel('user');
	User.findOne({name:uname},function(err,doc){    // 查看是否冲突
		if(err){
			console.log(err);
		}else if(doc){
			if(doc.name === oldName){
				console.log("用户名没有变化~");
				updateInfo(User,oldName,uname,usex);
			}else{
				console.log("用户名已存在");
				socket.emit("nameExists",uname);
			}
		}else{
			updateInfo(User,oldName,uname,usex);
		}
	});
	});

  //获取客户端用户名并从数据库拉取 聊天记录
	socket.on("getChatList",function(uname){
		var Content =global.dbHandel.getModel('content');
		Content.find({name: uname},function(err,docs){
			if(err){
				console.log(err);
			}else{     // 将docs 聊天记录返回给客户端处理
				socket.emit("getChatListDone",docs);
				console.log(uname+"  正在调取聊天记录");
				//console.log(docs);
			}
		});
	});
  //监听客户端断开
	socket.on('disconnect',function(){ 	  // Event:  disconnect
		var Name = "";
		for(var n in clients){
			if(clients[n].Socket === socket){     // get socket match
				Name = clients[n].name;
			}
		}
		statusSetDown(Name,socket);         // status  -->  set down

		socket.broadcast.emit('userOut',"system@: 【"+client.name+"】 leave ~");
		console.log(client.name + ':   disconnect');

	});
});
function statusSetDown(oName,ssocket){    //注销  下线处理
	var User = global.dbHandel.getModel('user');
	User.update({name:oName},{$set: {status: 'down'}},function(err,doc){
		if(err){
			console.log(err);
		}else{
			console.log(oName+ "  is  down");
			getUserUp(ssocket);    // 放在内部保证顺序
		}
	});
}
exports.listen = function(charServer){
	return server.listen(charServer);    // listening
};
