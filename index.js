var eejs = require('ep_etherpad-lite/node/eejs/');
var settings = require('ep_etherpad-lite/node/utils/Settings');
var formidable = require('ep_etherpad-lite/node_modules/formidable');
var clientIO = require('ep_etherpad-lite/node_modules/socket.io-client');
var commentManager = require('./commentManager');
var apiUtils = require('./apiUtils');
var _ = require('ep_etherpad-lite/static/js/underscore');

exports.padRemove = function(hook_name, context, callback) {
  commentManager.deleteCommentReplies(context.padID, function() {
    commentManager.deleteComments(context.padID, callback);
  });
  return callback();
}
exports.padCopy = function(hook_name, context, callback) {
  commentManager.copyComments(context.originalPad.id, context.destinationID, function() {
    commentManager.copyCommentReplies(context.originalPad.id, context.destinationID, callback);
  });
  return callback();
}

exports.handleMessageSecurity = function(hook_name, context, callback){
  if(context.message && context.message.data && context.message.data.apool){
    var apool = context.message.data.apool;
    if(apool.numToAttrib && apool.numToAttrib[0] && apool.numToAttrib[0][0]){
      if(apool.numToAttrib[0][0] === "comment"){
        // Comment change, allow it to override readonly security model!!
        return callback(true);
      }else{
        return callback();
      }
    }else{
      return callback();
    }
  }else{
    return callback();
  }
};

exports.socketio = function (hook_name, args, cb){
  var app = args.app;
  var io = args.io;
  var pushComment;
  var padComment = io;

  var commentSocket = io
  .of('/comment')
  .on('connection', function (socket) {

    // Join the rooms
    socket.on('getComments', (data, respond) => {
      var padId = data.padId;
      socket.join(padId);
      commentManager.getComments(padId, function (err, comments){
        respond(comments);
      });
    });

    socket.on('getCommentReplies', (data, respond) => {
      var padId = data.padId;
      commentManager.getCommentReplies(padId, function (err, replies){
        respond(replies);
      });
    });

    // On add events
    socket.on('addComment', (data, respond) => {
      var padId = data.padId;
      var content = data.comment;
      commentManager.addComment(padId, content, function (err, commentId, comment){
        socket.broadcast.to(padId).emit('pushAddComment', commentId, comment);
        respond(commentId, comment);
      });
    });

    socket.on('deleteComment', (data, respond) => {
      // delete the comment on the database
      commentManager.deleteComment(data.padId, data.commentId, function (){
        // Broadcast to all other users that this comment was deleted
        socket.broadcast.to(data.padId).emit('commentDeleted', data.commentId);
      });

    });

    socket.on('revertChange', (data, respond) => {
      // Broadcast to all other users that this change was accepted.
      // Note that commentId here can either be the commentId or replyId..
      var padId = data.padId;
      commentManager.changeAcceptedState(padId, data.commentId, false, function(){
        socket.broadcast.to(padId).emit('changeReverted', data.commentId);
      });
    });

    socket.on('acceptChange', (data, respond) => {
      // Broadcast to all other users that this change was accepted.
      // Note that commentId here can either be the commentId or replyId..
      var padId = data.padId;
      commentManager.changeAcceptedState(padId, data.commentId, true, function(){
        socket.broadcast.to(padId).emit('changeAccepted', data.commentId);
      });
    });

    socket.on('bulkAddComment', (padId, data, respond) => {
      commentManager.bulkAddComments(padId, data, function(error, commentsId, comments){
        socket.broadcast.to(padId).emit('pushAddCommentInBulk');
        var commentWithCommentId = _.object(commentsId, comments); // {c-123:data, c-124:data}
        respond(commentWithCommentId);
      });
    });

    socket.on('bulkAddCommentReplies', (padId, data, respond) => {
      commentManager.bulkAddCommentReplies(padId, data, function (err, repliesId, replies){
        socket.broadcast.to(padId).emit('pushAddCommentReply', repliesId, replies);
        var repliesWithReplyId = _.zip(repliesId, replies);
        respond(repliesWithReplyId);
      });
    });

    socket.on('updateCommentText', (data, respond) => {
      // Broadcast to all other users that the comment text was changed.
      // Note that commentId here can either be the commentId or replyId..
      var padId = data.padId;
      var commentId = data.commentId;
      var commentText = data.commentText;
      commentManager.changeCommentText(padId, commentId, commentText, function(err) {
        if(!err){
          socket.broadcast.to(padId).emit('textCommentUpdated', commentId, commentText);
        }
        respond(err);
      });
    });

    socket.on('addCommentReply', (data, respond) => {
      const padId = data.padId;
      commentManager.addCommentReply(padId, data, (err, replyId, reply) => {
        reply.replyId = replyId;
        socket.broadcast.to(padId).emit('pushAddCommentReply', replyId, reply);
        respond(replyId, reply);
      });
    });

    // comment added via API
    socket.on('apiAddComments', function (data) {
      var padId = data.padId;
      var commentIds = data.commentIds;
      var comments = data.comments;

      for (var i = 0, len = commentIds.length; i < len; i++) {
        socket.broadcast.to(padId).emit('pushAddComment', commentIds[i], comments[i]);
      }
    });

    // comment reply added via API
    socket.on('apiAddCommentReplies', function (data) {
      var padId = data.padId;
      var replyIds = data.replyIds;
      var replies = data.replies;

      for (var i = 0, len = replyIds.length; i < len; i++) {
        var reply = replies[i];
        var replyId = replyIds[i];
        reply.replyId = replyId;
        socket.broadcast.to(padId).emit('pushAddCommentReply', replyId, reply);
      }
    });

  });
  return cb();
};

exports.eejsBlock_dd_insert = function (hook_name, args, cb) {
  args.content = args.content + eejs.require("ep_comments_page/templates/menuButtons.ejs");
  return cb();
};

exports.eejsBlock_mySettings = function (hook_name, args, cb) {
  args.content = args.content + eejs.require("ep_comments_page/templates/settings.ejs");
  return cb();
};

exports.eejsBlock_editbarMenuLeft = function (hook_name, args, cb) {
  args.content = args.content + eejs.require("ep_comments_page/templates/commentBarButtons.ejs");
  return cb();
};

exports.eejsBlock_scripts = function (hook_name, args, cb) {
  args.content = args.content + eejs.require('ep_comments_page/templates/comments.html');
  args.content = args.content + eejs.require('ep_comments_page/templates/commentIcons.html');
  return cb();
};

exports.eejsBlock_styles = function (hook_name, args, cb) {
  args.content = args.content + eejs.require('ep_comments_page/templates/styles.html');
  return cb();
};

exports.clientVars = function (hook, context, cb) {
  var displayCommentAsIcon = settings.ep_comments_page ? settings.ep_comments_page.displayCommentAsIcon : false;
  var highlightSelectedText = settings.ep_comments_page ? settings.ep_comments_page.highlightSelectedText : false;
  return cb({
    "displayCommentAsIcon": displayCommentAsIcon,
    "highlightSelectedText": highlightSelectedText,
  });
};

exports.expressCreateServer = function (hook_name, args, callback) {
  args.app.get('/p/:pad/:rev?/comments', function(req, res) {
    var fields = req.query;
    // check the api key
    if(!apiUtils.validateApiKey(fields, res)) return;

    // sanitize pad id before continuing
    var padIdReceived = apiUtils.sanitizePadId(req);

    commentManager.getComments(padIdReceived, (err, data) => {
      if(err) {
        res.json({code: 2, message: "internal error", data: null});
      } else if (data != null) {
        res.json({code: 0, data: data});
      }
    });
  });

  args.app.post('/p/:pad/:rev?/comments', function(req, res) {
    new formidable.IncomingForm().parse(req, function (err, fields, files) {
      // check the api key
      if(!apiUtils.validateApiKey(fields, res)) return;

      // check required fields from comment data
      if(!apiUtils.validateRequiredFields(fields, ['data'], res)) return;

      // sanitize pad id before continuing
      var padIdReceived = apiUtils.sanitizePadId(req);

      // create data to hold comment information:
      try {
        var data = JSON.parse(fields.data);

        commentManager.bulkAddComments(padIdReceived, data, (err, commentIds, comments) => {
          if(err) {
            res.json({code: 2, message: "internal error", data: null});
          } else if (commentIds != null) {
            broadcastCommentsAdded(padIdReceived, commentIds, comments);
            res.json({code: 0, commentIds: commentIds});
          }
        });
      } catch(e) {
        res.json({code: 1, message: "data must be a JSON", data: null});
      }
    });
  });

  args.app.get('/p/:pad/:rev?/commentReplies', function(req, res){
    //it's the same thing as the formidable's fields
    var fields = req.query;
    // check the api key
    if(!apiUtils.validateApiKey(fields, res)) return;

    //sanitize pad id before continuing
    var padIdReceived = apiUtils.sanitizePadId(req);

    // call the route with the pad id sanitized
    commentManager.getCommentReplies(padIdReceived, (err, data) => {
      if(err) {
        res.json({code: 2, message: "internal error", data:null})
      } else if (data != null) {
        res.json({code: 0, data: data});
      }
    });
  });

  args.app.post('/p/:pad/:rev?/commentReplies', function(req, res) {
    new formidable.IncomingForm().parse(req, function (err, fields, files) {
      // check the api key
      if(!apiUtils.validateApiKey(fields, res)) return;

      // check required fields from comment data
      if(!apiUtils.validateRequiredFields(fields, ['data'], res)) return;

      // sanitize pad id before continuing
      var padIdReceived = apiUtils.sanitizePadId(req);

      // create data to hold comment reply information:
      try {
        var data = JSON.parse(fields.data);

        commentManager.bulkAddCommentReplies(padIdReceived, data, (err, replyIds, replies) => {
          if(err) {
            res.json({code: 2, message: "internal error", data: null});
          } else if (replyIds != null) {
            broadcastCommentRepliesAdded(padIdReceived, replyIds, replies);
            res.json({code: 0, replyIds: replyIds});
          }
        });
      } catch(e) {
        res.json({code: 1, message: "data must be a JSON", data: null});
      }
    });
  });
  return callback();
}

var broadcastCommentsAdded = function(padId, commentIds, comments) {
  var socket = clientIO.connect(broadcastUrl);

  var data = {
    padId: padId,
    commentIds: commentIds,
    comments: comments
  };

  socket.emit('apiAddComments', data);
}

var broadcastCommentRepliesAdded = function(padId, replyIds, replies) {
  var socket = clientIO.connect(broadcastUrl);

  var data = {
    padId: padId,
    replyIds: replyIds,
    replies: replies
  };

  socket.emit('apiAddCommentReplies', data);
}

var broadcastUrl = apiUtils.broadcastUrlFor("/comment");
