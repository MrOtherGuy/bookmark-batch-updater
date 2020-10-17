'use strict';

let BMU = new (function(){

  this.scannedBookmarks = null;
  
  this.State = function(){
    this.from = null;
    this.to = null;
    this.isValid = function(){ return !(this.from === null || this.from === undefined || this.to === null || this.to === undefined) }
    this.clear = function(){ return !(this.from = this.to = null) }
  };
  
  this.operations = {
    running:null,
    progress: {
      current:null,
      target:null,
      get : ()=> {
        let prog = this.operations.progress;
        return (!prog.current || !prog.target) ? 0 : Math.ceil(100*(prog.current/prog.target))
      }
    },
    type:null,
    operands: {
      url: new this.State(),
      title: new this.State(),
      clear: function(){this.url.clear() && this.title.clear()}
    }
  }
  
  this.debug = true;
  
  this.print = (message) => { this.debug && console.log(message) };

  this.sRegexp = function(a,rv){
    if(typeof a === "string" && a.length > 0){
      try{
        let s = new RegExp(a);
        return s
      }catch(e){
        rv.ok = false;
        rv.message = "invalid regular expression"
      }
    }
    return null
  }
  
  this.initializeOperation = function(ARGS,rv){
    
    const OPS = this.operations.operands;
    const STR = (a)=>{return typeof a === "string" ? a : null};
    
    switch(ARGS.type){
      case "protocol":
        this.operations.type = "protocol";
        OPS.url.from = STR(ARGS.fromDomain);
        OPS.url.to = null;
        OPS.title.from = null;
        OPS.title.to = null;
        break;
      case "domain":
        this.operations.type = "domain";
        OPS.url.from = STR(ARGS.fromDomain);
        OPS.url.to = STR(ARGS.toDomain) || null; // collapse to null if empty string
        OPS.title.from = null;
        OPS.title.to = null;
        rv.ok = (OPS.url.isValid());
        if(!rv.ok){
          rv.message = "input or output domain is not defined"
        }
        break;
      case "regexp":
        this.operations.type = "regexp";
        
        OPS.url.from = this.sRegexp(ARGS.fromDomain,rv);
        OPS.title.from = this.sRegexp(ARGS.fromTitle,rv);
        
        OPS.url.to = STR(ARGS.toDomain);
        OPS.title.to = STR(ARGS.toTitle);
        
        rv.ok = (OPS.url.isValid() || OPS.title.isValid());
            
        if(!rv.ok){
          rv.message += ";input or output operand is not defined"
        }
        break;
      default:
        rv.message = "unknown scan type"; 
        rv.ok = false;
    }
    return rv
  }
  
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
          this.initializeOperation(obj.properties,rv)
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
          if(!this.scannedBookmarks || this.scannedBookmarks.length === 0){
            rv.ok = false;
            rv.message = "no scanned bookmarks to update";
            break;
          }
          if(initOps.type === "domain"){
            rv.ok = (initOps.operands.url.isValid());
            if(!rv.ok){
              rv.message = "input or output domain is not defined"
            }
          }else if(initOps.type === "regexp"){
            rv.ok = (initOps.operands.url.isValid() || initOps.operands.title.isValid());
            if(!rv.ok){
              rv.message = "missing argument for replace operation"
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
        this.print("received reset request");
        result.ok && this.reset();
        break;
      default:
        this.print("received some random request");
        return
    }
    
  };
  
  
  this.createBookmarkList = async function(){
    
    const BM = function(bm,r,includeReplacement){
      const o = {};
      if(r.url[0] && typeof r.url[1] === "string"){
        o.url = { "match": bm.url };
        if(includeReplacement){
          o.url.replacement = bm.url.replace(r.url[0],r.url[1]);
        }
      }
      if(r.title[0] && typeof r.title[1] === "string"){
        o.title = { "match": bm.title };
        if(includeReplacement){
          o.title.replacement = bm.title.replace(r.title[0],r.title[1]);
        }
      }
      return o
    }
    
    if(this.operations.running || !this.scannedBookmarks){
      return
    }
    this.operations.running = "listing";
    let bookmarks = this.scannedBookmarks;
    
    let list = [];
    const END = Math.min(100,bookmarks.length);
    
    const REPLACER = this.getReplacers();
    
    END && list.push(BM(bookmarks[0],REPLACER,true));
    let idx = 1;
    while(idx < END){
      list.push(BM(bookmarks[idx],REPLACER,true))
      idx++
    }
    if (bookmarks.length > END){
      list.push({note:`--- and ${bookmarks.length - END} more ---`});
    }
    this.operations.running = null;
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
    let queries = {url:this.operations.operands.url.from,title:this.operations.operands.title.from}; // This has been set earlier by this.isOpValid()
    switch(ref.options.type){
      case "protocol":
        return (/^http:/).test(node.url) && (queries.url === null || this.parseDomain(node.url).endsWith(queries.url))
        break;
      case "domain":
        return this.parseDomain(node.url).endsWith(queries.url);
        break;
      case "regexp":
        return queries.url ? queries.url.test(node.url) : queries.title ? queries.title.test(node.title) : false
      default:
        break;
    }
    
    return rv
  }
    
  
  this.traverseBookmarkTree = async function(tree,ref){
    // skip scanning if operation is not supported
    if(ref.options.type != "protocol" && ref.options.type != "domain" && ref.options.type != "regexp"){
      console.error("error traversing")
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
      (bookmarks)=>(this.scannedBookmarks = bookmarks.collection),
      (error)=>(this.scannedBookmarks = null)
    )
    .finally(()=>{
      this.operations.running = null;
      browser.runtime.sendMessage({type:"scan",success:!(this.scannedBookmarks===null),length:this.scannedBookmarks?this.scannedBookmarks.length:0,domain:options.fromDomain});
    })
  }
  
  this.reset = function(force){
    this.print("resetting...");
    if(force || !this.operations.running){
      this.operations.progress.current = null;
      this.operations.progress.target = null;
      this.scannedBookmarks = null
      this.operations.type = null;
      this.operations.operands.clear();
    }else{
      this.print(`reset was ignored due to pending ${this.running} operation`)  
    }
  }
  
  this.isValidURL = function(url,hasNoBackslash){
    let rv = true;
    try{
      let d = new URL(url);
      rv =   !d.host.startsWith(".")
          && !d.host.endsWith(".")
          && d.host.indexOf("..") === -1
          && !d.pathname.startsWith("//");
    }catch(e){
      rv = false
    }
    return rv && (!hasNoBackslash || url.indexOf("\\") === -1)
  }
  
  this.getReplacers = function(){
    let rv = {url:new Array(2),title:new Array(2)};
    
    switch(this.operations.type){
      case "protocol":
        rv.url[0] = /^http:/;
        rv.url[1] = "https:";
        break;
      case "regexp":
        rv.title[0] = this.operations.operands.title.from;
        rv.title[1] = this.operations.operands.title.to;
      case "domain":
        rv.url[0] = this.operations.operands.url.from;
        rv.url[1] = this.operations.operands.url.to;
        break;
    }
    return rv
  }
  
  this.update = async function(){
    
    if(this.scannedBookmarks === null){
      return
    }
    this.operations.running = "update";
    this.operations.progress.target = this.scannedBookmarks.length;
    const IS_DOMAIN_OR_REGEXP = (this.operations.type === "domain" || this.operations.type === "regexp");
    let replacer = this.getReplacers();
    
    // This is necessary to get around an issue when Promise.all may resolve too fast is all bookmarks fail to update, which in turn confuses the popup ui.
    let bookmarkPromises = [new Promise((resolve)=>(setTimeout(()=>(resolve(1)),100)))];
    
    const CHANGES = {};
    CHANGES.url = replacer.url[0] && (this.operations.type === "regexp" || replacer.url[1]);
    CHANGES.title = this.operations.type === "regexp" && replacer.title[0] && (typeof replacer.title[1] === "string") ;
    
    let failures = [];
    let success = false;
    for(let bm of this.scannedBookmarks){
      
      let newProps = {};
      let failedURL;
      if(CHANGES.url){
        newProps.url = bm.url.replace(replacer.url[0],replacer.url[1]);
        if(IS_DOMAIN_OR_REGEXP && !this.isValidURL(newProps.url,bm.url.indexOf("\\" === -1))){
          failedURL = newProps.url;
          delete newProps.url
        }
      }
      if(CHANGES.title){
        newProps.title = bm.title.replace(replacer.title[0],replacer.title[1]);
      }

      if(newProps.url || newProps.title){
        const ID = bm.id;
        let updating = browser.bookmarks.update(ID,newProps);

        // This error should only happen if the bookmark to be updated is no longer available when the update is being run but it was available when scanning
        updating
        .catch((e)=>(failures.push({error:`invalid id: ${ID}`}),true))
        .finally(()=>(this.operations.progress.current++));
        
        bookmarkPromises.push(updating);
        
      }else{
        failures.push({error:`invalid url: ${failedURL}`});
        this.operations.progress.current++
      }
    }
    Promise.all(bookmarkPromises)
    .then(()=>{ success = true })
    // If we end up in this catch it implies error in the script
    .catch((e)=>{ console.error(e) })
    .then(()=>{
      browser.runtime.sendMessage({type:"update",success:(success && !failures.length),length:this.operations.progress.current,failures:failures.length?failures:null});
      this.operations.running = null;
      // reset() takes one "force" argument to fully reset status so we can recover from hard errors
      // note - success will be true if bookmark couldn't be updated due to no matching id
      this.reset(!success);
    })
  }

  browser.runtime.onMessage.addListener(this.messageHandler.bind(this));

})();

async function switchToOrOpenTab(){
  let views = await browser.extension.getViews({type:"tab"})
  if(!views.length){
    browser.tabs.create({url:"ui.html"})
  }else{
    let aTab = await views[0].browser.tabs.getCurrent()
    browser.tabs.update(aTab.id,{active:true})
  }
}

browser.browserAction.onClicked.addListener(switchToOrOpenTab)

