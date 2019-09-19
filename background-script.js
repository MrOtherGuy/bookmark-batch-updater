'use strict';

let BMU = new (function(){

  this.pendingOperations = "";
  this.scannedBookmarks = null;
  
  this.progress = { current:null, target:null, get : ()=> ((!this.progress.current || !this.progress.target) ? 0 : Math.ceil(100*(this.progress.current/this.progress.target))) };
  
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
        sendResponse({ok:true,busy:!!this.pendingOperations,message:`${this.pendingOperations} is in progress`,progress:`${this.progress.get()}%`});
        // TODO
        break;
      case "update":
        this.print("received update request");
        let ok = (!this.pendingOperations &&  (this.scannedBookmarks.collection && this.scannedBookmarks.collection.length > 0));
        sendResponse({ok:ok,message:this.pendingOperations?`${this.pendingOperations} is in progress`:!this.scannedBookmarks?"Bookmarks haven't been scanned yet":this.scannedBookmarks.collection.length > 0?"":"No bookmarks to update"});
        ok && this.update();
        // TODO
        break;
      case "list":
        this.print("received scanned list request");
        let shouldList = (!this.pendingOperations && !!this.scannedBookmarks);
        sendResponse({ok:shouldList,message:this.pendingOperations?"busy":!!this.scannedBookmarks?"":"Bookmarks haven't been scanned yet"})
        shouldList && this.createBookmarkList();
        break;
      default:
        this.print("received some random request");
        // TODO
        return
    }
    
  };
  
  this.createBookmarkList = async function(){
    if(this.pendingOperations || !this.scannedBookmarks.collection){
      return
    }
    this.pendingOperations = "listing";
    let bookmarks = this.scannedBookmarks.collection;
    let list = [];
    const END = Math.min(100,bookmarks.length);
    let idx = 0;
    while(idx < END){
      list.push(bookmarks[idx].url)
      idx++
    }
    if (bookmarks.length > END){
      list.push(`--- and ${bookmarks.length - END} more ---`);
    }
    this.pendingOperations = "";
    browser.runtime.sendMessage({type:"list",list:list});
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
  
  this.traverseBookmarkTree = async function(tree,ref){
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
    
    const clear = function(o){
      o.progress.current = null;
      o.progress.target = null;
      o.scannedBookmarks = null
      o.pendingOperations = "";
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
        clear(this);
      })
      .catch((error) => {
        browser.runtime.sendMessage({type:"update",success:false,length:this.progress.current});
        this.print("update error");
        console.log(error);
        clear(this)
      })
    
    }catch(err){
      console.log(err);
      clear(this);
    }
    
  }

  browser.runtime.onMessage.addListener(this.messageHandler.bind(this));

})();


// Listen for messages from frame_script.js

