'use strict';

let BMU = new (function(){

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
  
  this.debug = true;
  
  this.print = (message) => { this.debug && console.log(message) }
  
  this.isOpValid = function(obj){
    
    let initOps = this.operations;
    let rv = {ok:false};
    if(initOps.running){
      rv.message = `${initOps.running} is running`;
    }
    
    switch(obj.operation){
      case "scan":
        rv.ok = !rv.message;
        if(rv.ok){
          switch(obj.properties.type){
            case "protocol":
              initOps.type = "protocol";
              initOps.operands[0] = obj.properties.fromDomain || null;
              initOps.operands[1] = null;
              break;
            case "domain":
              initOps.type = "domain";
              initOps.operands[0] = obj.properties.fromDomain || null;
              initOps.operands[1] = obj.properties.toDomain || null;
              rv.ok = (initOps.operands[0] && initOps.operands[1]);
              if(!rv.ok){
                rv.message = "input or output domain is not defined"
              }
              break;
            case "regexp":
              initOps.type = "regexp";
              try{
                initOps.operands[0] = obj.properties.fromDomain.length > 0 ? new RegExp(obj.properties.fromDomain) : null;
              }catch(e){
                rv.ok = false;
                rv.message = "invalid regular expression"
              }
              initOps.operands[1] = obj.properties.toDomain || null;
              rv.ok = (initOps.operands[0] && initOps.operands[1]);
              if(!rv.ok){
                rv.message += ";input or output operand is not defined"
              }
              break;
            default:
              rv.message = "unknown scan type"; 
              rv.ok = false;
          }
        }
        break;
      case "status":
        rv.ok = true;
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
        break;
      case "reset":
        rv.ok = !initOps.running;
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
        sendResponse(result);
        result.ok && this.scan(request.properties);
        break;
      case "status":
        this.print("received status query");
        sendResponse(result);
        break;
      case "update":
        this.print("received update request");
        sendResponse(result);
        result.ok && this.update();
        break;
      case "list":
        this.print("received scanned list request");
        sendResponse(result);
        result.ok && this.createBookmarkList();
        break;
      case "reset":
        result.ok && this.reset();
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
    let domain = this.operations.operands[0]; // This has been set earlier by this.isOpValid()
    switch(ref.options.type){
      case "protocol":
        return (/^http:/).test(node.url) && (domain === null || this.parseDomain(node.url).endsWith(domain))
        break;
      case "domain":
        return this.parseDomain(node.url).endsWith(domain);
        break;
      case "regexp":
        return domain.test(node.url)
      default:
        break;
    }
    
    return rv
  }
    
  
  this.traverseBookmarkTree = async function(tree,ref){
    // skip scanning if operation is not supported
    if(ref.options.type != "protocol" && ref.options.type != "domain" && ref.options.type != "regexp"){
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
      }
    }
    return ref;
  }

  this.scan = async function(options){
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
  
  this.reset = function(){
    console.log("resetting...");
    if(!this.operations.running){
      this.operations.progress.current = null;
      this.operations.progress.target = null;
      this.scannedBookmarks = null
      this.operations.type = null;
    }
  }
  
  this.update = async function(){
    
    if(this.scannedBookmarks === null){
      return
    }
    this.operations.running = "update";
    this.operations.progress.target = this.scannedBookmarks.collection.length;
    
    let replacer = new Array(2);
    if(this.operations.type === "domain" || this.operations.type === "regexp"){
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
        
        this.operations.running = "";
        this.reset();
      })
      .catch((error) => {
        browser.runtime.sendMessage({type:"update",success:false,length:this.operations.progress.current});
        this.print("update error");
        console.log(error);
        
        this.operations.running = "";
        this.reset();
      })
    
    }catch(err){
      console.log(err);
      
      this.operations.running = "";
      this.reset();
    }
    
  }

  browser.runtime.onMessage.addListener(this.messageHandler.bind(this));

})();

