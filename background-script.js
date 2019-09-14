'use strict';

let BMU = new (function(){

  this.pendingOperations = "";
  this.scannedBookmarks = null;
  
  this.progress = { current:null, target:null, get : ()=> ((!this.current || !this.target) ? 0 : this.current/this.target) };
  
  this.debug = true;
  
  this.print = (message) => { this.debug && console.log(message) }
  
  this.messageHandler = function(request,sender,sendResponse){
    if(sender.id != browser.runtime.id || sender.envType != "addon_child" || !request.operation){
      return
    }
    //let response = { ok:!this.pendingOperations };
    
    
    switch(request.operation){
      case "scan":
      
        this.print("received scan request");
        sendResponse({ok:!this.pendingOperations,message:`${this.pendingOperations} is in progress`});
        this.scan(request.domain);
        // TODO
        break;
      case "status":
        this.print("received status query");
        sendResponse({ok:true,message:`${this.pendingOperations} is in progress`,progress:`${this.progress}%`});
        // TODO
        break;
      case "update":
        this.print("received update request");
        let ok = (!this.pendingOperations && this.scannedBookmarks != null);
        sendResponse({ok:ok,message:this.pendingOperations?`${this.pendingOperations} is in progress`:!this.scannedBookmarks?"Bookmarks haven't been scanned yet":""});
        ok && this.update();
        // TODO
        break;
      default:
        this.print("received some random request");
        // TODO
        return
    }
    
  };
  
  // This expects url that starts with "http://"
  this.parseDomain = function(url){
    let end = url.indexOf("/",7);
    if(end > 7){
      return url.slice(7,end)
    }else{
      return url.slice(7)
    }
  };
  
  this.traverseBookmarkTree = function(tree,ref){
    for(let node of tree.children){
      if(node.children){
        this.traverseBookmarkTree(node,ref);
      }else if(node.type === "bookmark"){
        if((/^http:/).test(node.url)){
          let domain = this.parseDomain(node.url);
          if(ref.domain === null || domain.endsWith(ref.domain)){
            ref.collection.push(node);
          }
        }
      }
    }
    return ref;
  }
  
  this.scan = async function(domain){
    this.pendingOperations = "scan";
    (function(){
      return new Promise((resolve,reject) => {
      browser.bookmarks.getTree().then(
        (success) => resolve(this.traverseBookmarkTree(success[0],{collection:[],domain:domain})),
        (error) => reject("for reasons")
      );
    });
    }).bind(this)()
    .then(
      (bookmarks)=>(this.scannedBookmarks = bookmarks),
      (error)=>(this.scannedBookmarks = null)
    )
    .finally(()=>{
      this.pendingOperations = "";
      browser.runtime.sendMessage({type:"scan",success:!(this.scannedBookmarks===null),length:this.scannedBookmarks.collection.length});
    })
  }
  
  this.update = async function(){
    
    const clear = function(){
      this.progress.current = null;
      this.progress.target = null;
      this.scannedBookmarks = null
      this.pendingOperations = "";
    };
    
    if(this.scannedBookmarks === null){
      return
    }
    this.pendingOperations = "update";
    this.progress.target = this.scannedBookmarks.collection.length;
    try{
      let bookmarkPromises = [];
      for(let bm of this.scannedBookmarks.collection ){
        let updating = browser.bookmarks.update(bm.id,{url:bm.url.replace(/^http:/,"https:")});
        bookmarkPromises.push(updating);
        updating.then(()=>(this.progress.current++))
      }
      Promise.all(bookmarkPromises)
      .then((values)=>{
        browser.runtime.sendMessage({type:"update",success:true,length:this.progress.current});
        clear();
      })
      .catch((error) => (browser.runtime.sendMessage({type:"update",success:false,length:this.progress.current})),this.print("update error"),clear())
    
    }catch(err){
      clear();
    }
    
  }

  browser.runtime.onMessage.addListener(this.messageHandler.bind(this));

})();


// Listen for messages from frame_script.js

