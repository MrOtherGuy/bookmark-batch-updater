'use strict';

let bmupdater = (function(){

  this.pendingOperations = false;
  this.scannedBookmarks = null;
  
  this.messageHandler = function(request,sender){
    if(sender.id != browser.runtime.id || sender.envType != "addon_child" || !request.operation){
      return
    }
    switch(request.operation){
      case "scan":
        // TODO
        break;
      case "status":
        // TODO
        break;
      case "update":
        // TODO
        break;
      default:
        // TODO
    }
  };
  browser.runtime.onMessage.addListener(this.messageHandler);
  
  

})();


function handleMessage(request,sender){
  if(sender.id != browser.runtime.id){
    return
  }
  switch(sender.envType){
  // Pass progress message from sub-frame to top-frame
  case "content_child":
    browser.tabs.sendMessage(sender.tab.id,request.progress);
    break;
  // update options based on message from options document
  case "addon_child":
    //setOptions(request.SBOptions);
    break;
  default:
    console.log("unhandled message from:" + sender.envType);
  }
  return
};

// Listen for messages from frame_script.js

