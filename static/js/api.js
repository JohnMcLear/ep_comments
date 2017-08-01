var NEW_DATA_MESSAGE_TYPE = 'comments_data_changed';

/*
  message: {
    type: 'comments_data_changed',
    values: [
      {
        author: "a.dG8CtEvWhEmR3cf5",
        commentId: "c-b4WEFBNt7Bxu6Dhr",
        name: "Author Name",
        text: "the comment text",
        timestamp: 1501599806477,
      }
    ]
  }
*/
exports.triggerDataChanged = function(data) {
  var message = {
    type: NEW_DATA_MESSAGE_TYPE,
    values: data,
  };


  _triggerEvent(message);
}

var _triggerEvent = function _triggerEvent(message) {
  // if there's a wrapper to Etherpad, send data to it; otherwise use Etherpad own window
  var target = window.parent ? window.parent : window;
  target.postMessage(message, '*');
}
