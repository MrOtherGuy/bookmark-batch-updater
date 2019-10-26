'use strict';

let BMU = new (function(){

  //this.pendingOperations = "";
  this.scannedBookmarks = null;
  this.operations = {
    running:"",
    progress: {
      current:null,
      target:null,
      get : ()=> {
        let prog = this.operations.progress;
        return (!prog.current || !prog.target) ? 0 : Math.ceil(100*(prog.current/prog.target))
      }
    },
    type:null,
    operands: new Array(2)
    
    
  }
  /*
  this.progress = { current:null, target:null, get : ()=> ((!this.progress.current || !this.progress.target) ? 0 : Math.ceil(100*(this.progress.current/this.progress.target))) };*/
  
  this.debug = true;
  
  this.print = (message) => { this.debug && console.log(message) }
  
  this.isOpValid = function(obj){
    
    let initOps = this.operations;
    //let state = initOps.running;
    let rv = {ok:false};
    if(initOps.running){
      rv.message = `${initOps.running} is running`;
    }
    
    switch(obj.operation){
      case "scan":
        rv.ok = !rv.message;
        if(rv.ok){
          //console.log(obj.properties);
          if(obj.properties.type === "protocol"){
            initOps.type = "protocol";
            initOps.operands[0] = obj.properties.fromDomain || null;
            initOps.operands[1] = null;
          }else if(obj.properties.type === "domain"){
            initOps.type = "domain";
            initOps.operands[0] = obj.properties.fromDomain || null;
            initOps.operands[1] = obj.properties.toDomain || null;
            rv.ok = (initOps.operands[0] && initOps.operands[1]);
            if(!rv.ok){
              rv.message = "input or output domain is not defined"
            }
          }
          /*if(obj.properties.type === "protocol" || obj.properties.type === "domain"){
            this.operations.type = obj.properties.type;
            this.operations.operands[0] = obj.properties.fromDomain || null;
            this.operations.operands[1] = obj.properties.toDomain || null;
          }*/else{
            rv.message = "unknown scan type"; 
            rv.ok = false;
          }
        }
        break;
      case "status":
        rv.ok = true;
        //rv.message = ``;
        rv.busy = !!rv.message;
        rv.progress = `${initOps.progress.get()}%`;
        break;
      case "update":
        rv.ok = !initOps.running;
        if(rv.ok){
          if(!(this.scannedBookmarks.collection && this.scannedBookmarks.collection.length > 0)){
            rv.ok = false;
            rv.message = "no scanned bookmarks to update"
          }
          //rv.ok = this.scannedBookmarks.collection && this.scannedBookmarks.collection.length > 0));
          if(initOps.type === "domain"){
            rv.ok = initOps.operands[0] && initOps.operands[1];
            if(!rv.ok){
              rv.message = "input or output domain is not defined"
            }
          }
        }
        break;
      case "list":
        rv.ok = !initOps.running;
        if(rv.ok){
          if(!this.scannedBookmarks){
            rv.ok = false;
            rv.message = "Bookmarks haven't been scanned yet";
          }
        }
        //rv.ok = (!initOps.running && !!this.scannedBookmarks);
        break;
      default:
        this.print(`Error determining op ${obj.operation}`)
        rv.message = "unknown op"
        break;
    }
    return rv
  }
  
  this.messageHandler = function(request,sender,sendResponse){
    if(sender.id != browser.runtime.id || sender.envType != "addon_child" || !request.operation){
      return
    }
    
    let result = this.isOpValid(request);
    switch(request.operation){
      case "scan":
      
        this.print("received scan request");
        //let isOk = this.isOpValid(request);
        //sendResponse({ok:!this.operations.running,message:`${this.operations.running} is in progress`});
        //sendResponse({ok:isOk,message:`${this.operations.running} is in progress`});
        sendResponse(result);
        result.ok && this.scan(request.properties);
        break;
      case "status":
        this.print("received status query");
        //sendResponse({ok:true,busy:!!this.operations.running,message:`${this.operations.running} is in progress`,progress:`${this.operations.progress.get()}%`});
        sendResponse(result);
        break;
      case "update":
        this.print("received update request");
        //let ok = this.isOpValid(request);
        //sendResponse({ok:isOk,message:this.operations.running?`${this.operations.running} is in progress`:!this.scannedBookmarks?"Bookmarks haven't been scanned yet":this.scannedBookmarks.collection.length > 0?"":"No bookmarks to update"});
        sendResponse(result);
        result.ok && this.update();
        break;
      case "list":
        this.print("received scanned list request");
        //let shouldList = (!this.operations.running && !!this.scannedBookmarks);
        //sendResponse({ok:isOk,message:this.operations.running?"busy":!!this.scannedBookmarks?"":"Bookmarks haven't been scanned yet"})
        sendResponse(result);
        result.ok && this.createBookmarkList();
        break;
      default:
        this.print("received some random request");
        return
    }
    
  };
  
  this.createBookmarkList = async function(){
    if(this.operations.running || !this.scannedBookmarks.collection){
      return
    }
    this.operations.running = "listing";
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
    this.operations.running = "";
    browser.runtime.sendMessage({type:"list",list:list});
  };
  
  // This expects url that starts with "http://"
  this.parseDomain = function(url){
    let start = url.indexOf("//") + 2;
    let end = url.indexOf("/",start);
    if(start > 0 && end > start){
      return url.slice(start,end)
    }else{
      return url.slice(start)
    }
  };
  
  this.isBookmarkATarget = function(node,ref){
    let rv = false;
    let domain = this.operations.operands[0]; // This has been set before by this.isOpValid
    switch(ref.options.type){
      case "protocol":
        return (/^http:/).test(node.url) && (domain === null || this.parseDomain(node.url).endsWith(domain))
        break;
      case "domain":
        return this.parseDomain(node.url).endsWith(domain);
        break;
      default:
        break;
    }
    
    return rv
  }
    
  
  this.traverseBookmarkTree = async function(tree,ref){
    // skip scanning if operation is not supported
    if(ref.options.type != "protocol" && ref.options.type != "domain"){
      console.log("error traversing")
      return ref
    }
    for(let node of tree.children){
      if(node.children){
        this.traverseBookmarkTree(node,ref);
      }else if(node.type === "bookmark"){
        if( this.isBookmarkATarget(node,ref) ){
          ref.collection.push(node);
        }
        /*if((/^http:/).test(node.url)){
          let domain = this.parseDomain(node.url);
          if(ref.domain === null || domain.endsWith(ref.domain)){
            ref.collection.push(node);
          }
        }*/
      }
    }
    return ref;
  }
  /*
  Options should be
  {
    action: "protocol"||"domain",
    domain: <domain url>
    
  }
  
  
  */
  this.scan = async function(options/* domain */){
    this.operations.running = "scan";
    (function(){
      return new Promise((resolve,reject) => {
      browser.bookmarks.getTree().then(
        (success) => resolve(this.traverseBookmarkTree(success[0],{collection:[],options:options})),
        (error) => reject("for reasons")
      );
    });
    }).bind(this)()
    .then(
      (bookmarks)=>(this.scannedBookmarks = bookmarks),
      (error)=>(this.scannedBookmarks = null)
    )
    .finally(()=>{
      this.operations.running = "";
      browser.runtime.sendMessage({type:"scan",success:!(this.scannedBookmarks===null),length:this.scannedBookmarks.collection.length,domain:options.fromDomain});
    })
  }
  
  this.update = async function(){
    
    const clear = function(o){
      o.operations.progress.current = null;
      o.operations.progress.target = null;
      o.scannedBookmarks = null
      o.operations.running = "";
      o.operations.type = null;
    };
    if(this.scannedBookmarks === null){
      return
    }
    this.operations.running = "update";
    this.operations.progress.target = this.scannedBookmarks.collection.length;
    
    let replacer = new Array(2);
    if(this.operations.type === "domain"){
      replacer[0] = this.operations.operands[0];
      replacer[1] = this.operations.operands[1];
    }else if(this.operations.type === "protocol"){
      replacer[0] = /^http:/;
      replacer[1] = "https:";
    }
    
    
    try{
      let bookmarkPromises = [];
      for(let bm of this.scannedBookmarks.collection ){
        let updating = browser.bookmarks.update(bm.id,{url:bm.url.replace(replacer[0],replacer[1])});
        bookmarkPromises.push(updating);
        updating.then(()=>(this.operations.progress.current++))
      }
      Promise.all(bookmarkPromises)
      .then((values)=>{
        browser.runtime.sendMessage({type:"update",success:true,length:this.operations.progress.current});
        clear(this);
      })
      .catch((error) => {
        browser.runtime.sendMessage({type:"update",success:false,length:this.operations.progress.current});
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

