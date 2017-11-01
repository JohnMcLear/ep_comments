var _ = require('ep_etherpad-lite/static/js/underscore');
var utils = require('./utils');
var copyPasteHelper = require('./copyPasteHelper');
var htmlExtractor = require('./htmlExtractorFromSelection');

var addTextAndDataOfAllHelpersToClipboardAndDeleteSelectedContent = function(e) {
  addTextAndDataOfAllHelpersToClipboard(e);
  utils.getPadInner().get(0).execCommand('delete');
}

var addTextAndDataOfAllHelpersToClipboard = function(e) {
  var $copiedHtml = htmlExtractor.getHtmlOfSelectedContent();
  var clipboardData = e.originalEvent.clipboardData;

  var helpersHaveItemsOnSelection = _(pad.copyPasteHelpers).map(function(helper) {
    return helper.addTextAndDataToClipboard(clipboardData, $copiedHtml);
  });

  var atLeastOneItemChangedClipboard = _(helpersHaveItemsOnSelection).any();
  if (atLeastOneItemChangedClipboard) {
    // override the default copy behavior
    clipboardData.setData('text/html', $copiedHtml.html());
    e.preventDefault();
  }
}

var saveItemsAndSubItemsOfAllHelpers = function(e) {
  var clipboardData = e.originalEvent.clipboardData;
  _(pad.copyPasteHelpers).each(function(helper) {
    helper.saveItemsAndSubItems(clipboardData);
  });
}

exports.init = function() {
  // Override  copy, cut, paste events on Google chrome and Mozilla Firefox.
  if(browser.chrome || browser.firefox) {
    utils.getPadInner().
    on('copy' , addTextAndDataOfAllHelpersToClipboard).
    on('cut'  , addTextAndDataOfAllHelpersToClipboardAndDeleteSelectedContent).
    on('paste', saveItemsAndSubItemsOfAllHelpers);
  }
}

exports.listenToCopyCutPasteEventsOfItems = function(configs) {
  var helper = copyPasteHelper.init(configs);
  pad.copyPasteHelpers = pad.copyPasteHelpers || [];
  pad.copyPasteHelpers.push(helper)
}
