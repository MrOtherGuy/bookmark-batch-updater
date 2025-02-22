'use strict';

let gEngine = null;
let connections = new Map();

function getConnection(){
  if(connections.size > 1){
    throw new Error("There should only be a single connection!")
  }
  let it = connections.entries().next().value;
  return { id: it[0], port: it[1] }
}

browser.runtime.onConnect.addListener(p => {
  connections.set(p.name,p);
  p.postMessage({ handshake: "greetings", id: p.name });
  p.onMessage.addListener(handleMessage);
  p.onDisconnect.addListener(() => {
    console.log(`Port ${p.name} disconnected`);
    connections.delete(p.name);
    console.log("Remaining connections:",connections.size)
  })
})
browser.runtime.onSuspend.addListener(() => {
  for(let c of connections.values()){
    c.postMessage({wakeUp:"wake up!", busted: gEngine?.task.isRunning});
    c.onMessage.removeListener(msgWrapper);
    c.disconnect();
  }
  gEngine = null;
  connections.clear()
});
browser.runtime.onSuspendCanceled.addListener(console.log);

async function switchToOrOpenTab(){
  let views = await browser.extension.getViews({type:"tab"});
  if(!views.length){
    if(!gEngine){
      gEngine = new BBU();
    }
    browser.tabs.create({url:"ui.html"})
  }else{
    let aTab = await views[0].browser.tabs.getCurrent()
    browser.tabs.update(aTab.id,{active:true})
  }
}
function handleMessage(message) {
  const {id, data} = message;
  let connection = getConnection();
  const port = connection.port;
  if(!data.operation){
    port.postMessage({id:id,data:null})
    return
  }
  if(data.operation === "ping"){
    port.postMessage({id: id, data: "pong"});
    return
  }
  let {engine, result} = BBU.isOpValid(data);
  if(!result.ok){
    console.warn(`received failed request: "${data.operation}"`);
    port.postMessage({id: id,data: result});
  }
  switch(data.operation){
    case "scan":
      console.log("received scan request");
      engine.scan(data.properties);
      break
    case "status":
      console.log("received status query");
      break
    case "update":
      console.log("received update request");
      engine.update(new Set(data.excludes),data.allowUrlFixup);
      break
    case "list":
      console.log("received scanned list request");
      result.value = engine.createBookmarkList();
      break
    case "reset":
      console.log("received reset request");
      engine.reset();
      break
    default:
      console.log("received some random request");
      return
  }
  result.id = id;
  port.postMessage({id: id,response: result});
}

browser.action.onClicked.addListener(switchToOrOpenTab)

function sleep(n){
  return new Promise(res => {
    setTimeout(res,n)
  })
}

class BBUState{
  constructor(){
    this.from = null;
    this.to = null;
  }
  isValid(){
    // this should work because bookmark url nor title should be "" or 0 or NaN
    // return !!(this.from && this.to)
    return !(
         this.from === null
      || this.from === undefined
      || this.to === null
      || this.to === undefined
    )
  }
  clear(){
    this.from = null;
    this.to = null;
  }
}

class BBUProgress{
  #current;
  constructor(){
    this.#current = null;
    this.target = null;
  }
  now(){
    return (!this.#current || !this.target)
           ? 0
           : Math.ceil(100*(this.#current/this.target))
  }
  get current(){
    return this.#current
  }
  advance(){
    if(this.#current === null){
      throw new Error("cannot increment null")
    }
    this.#current++
  }
  init(len){
    this.#current = 0;
    this.target = len;
  }
  reset(){
    this.#current = null;
    this.target = null;
  }
}

class BBUTask{
  #type;
  #progress;
  constructor(c,type){
    if(c !== BBUTask.#c){
      throw new Error("invalid constructor")
    }
    this.#type = type;
  }
  get isRunning(){
    return this.#type !== BBUTask.TYPE_NONE
  }
  get progress(){
    if(!this.#progress){
      this.#progress = new BBUProgress();
    }
    return this.#progress
  }
  get type(){
    return this.#type
  }
  get name(){
    switch(this.#type){
      case BBUTask.TYPE_NONE:
        return "None"
      case BBUTask.TYPE_SCAN:
        return "Scan"
      case BBUTask.TYPE_UPDATE:
        return "Update"
      case BBUTask.TYPE_LIST:
        return "List"
      case BBUTask.TYPE_STATUS:
        return "Status"
      default:
        throw new Error("unknown status: "+this.#type)
    }
  }
  static TYPE_NONE = 0;
  static TYPE_SCAN = 1;
  static TYPE_UPDATE = 2;
  static TYPE_LIST = 4;
  static TYPE_STATUS = 8;
  static #c = Symbol("guard");
  
  static{
    this.None = new this(this.#c,this.TYPE_NONE);
  }
  static Scan(){
    return new BBUTask(this.#c,this.TYPE_SCAN);
  }
  static List(){
    return new BBUTask(this.#c,this.TYPE_LIST);
  }
  static Update(){
    return new BBUTask(this.#c,this.TYPE_UPDATE);
  }
  static StatusCheck(){
    return new BBUTask(this.#c,this.TYPE_STATUS);
  }
}

class BBUOperationMode{
  #type;
  constructor(a){
    this.#type = a;
    this.operands = {
      url: new BBUState(),
      title: new BBUState()
    }
  }
  isOperationValid(){
    return false
  }
  clearState(){
    this.operands.url.clear();
    this.operands.title.clear();
    this.operands = null;
  }
  get type(){
    return this.#type
  }
  get typeAsString(){
    if(this.#type === BBUProtocolMode.TYPE){
      return "protocol"
    }
    if(this.#type === BBUDomainMode.TYPE){
      return "domain"
    }
    if(this.#type === BBURegExpMode.TYPE){
      return "regexp"
    }
    return null
  }
  static requireString(a){
    return typeof a === "string" ? a : null
  }
}

class BBUProtocolMode extends BBUOperationMode{
  constructor(args){
    super(BBUProtocolMode.TYPE);
    this.operands.url.from = BBUOperationMode.requireString(args.fromDomain)
  }
  isOperationValid(){
    return true
  }
  static TYPE = 32;
}
class BBUDomainMode extends BBUOperationMode{
  constructor(args){
    super(BBUDomainMode.TYPE);
    this.operands.url.from = BBUOperationMode.requireString(args.fromDomain);
    // collapse to null if empty string
    this.operands.url.to = BBUOperationMode.requireString(args.toDomain) || null;
  }
  isOperationValid(){
    return this.operands.url.isValid()
  }
  static TYPE = 64;
}
class BBURegExpMode extends BBUOperationMode{
  constructor(args){
    super(BBURegExpMode.TYPE);
    
    this.operands.url.from = BBURegExpMode.sRegexp(args.fromDomain);
    this.operands.title.from = BBURegExpMode.sRegexp(args.fromTitle);
    
    this.operands.url.to = BBUOperationMode.requireString(args.toDomain);
    this.operands.title.to = BBUOperationMode.requireString(args.toTitle);
    
  }
  isOperationValid(){
    return this.operands.url.isValid() || this.operands.title.isValid()
  }
  static TYPE = 128;
  static sRegexp(a,rv){
    return (typeof a === "string" && a.length > 0)
      ? new RegExp(a)
      : null
  }
}

class BookmarkScanData{
  constructor(options,operands){
    this.nodeset = new Set();
    this.options = options;
    this.queries = {
      url: operands.url.from,
      title: operands.title.from
    }
  }
  forget(){
    this.nodeset.clear()
  }
  getSize(){
    return this.nodeset.size
  }
  iter(){
    return this.nodeset.values()
  }
}

class BBU{
  constructor(){
    this.scannedBookmarks = null;
    this.task = BBUTask.None;
    this.matchMode = null
  }
  setMode(mode){
    if(!(mode instanceof BBUOperationMode)){
      throw new Error("invalid operation mode")
    }
    this.matchMode = mode
  }
  async scan(options){
    if(this.task.type !== BBUTask.TYPE_SCAN){
      throw new Error(`Unexpected engine state "${this.task.name}"`)
    }
    let connection = getConnection();
    const port = connection.port;
    // skip scanning if operation is not supported
    if(!["protocol","domain","regexp"].includes(options.type)){
      console.error("error traversing")
      port.postMessage({
        type: "scan",
        ok: false,
        length: 0,
        domain: options.fromDomain,
        portID: connection.id
      });
      this.task = BBUTask.None;
      return
    }
    let tree = await browser.bookmarks.getTree();
    try{
      this.scannedBookmarks = new BookmarkScanData(options,this.matchMode.operands);
      BBU.traverseBookmarkTree(tree[0],this.scannedBookmarks);
    }catch(ex){
      console.error(ex);
      this.scannedBookmarks = null;
    }
    port.postMessage({
      type: "scan",
      ok: !(this.scannedBookmarks===null),
      length: this.scannedBookmarks?this.scannedBookmarks.getSize():0,
      domain: options.fromDomain,
      portID: connection.id
    });
    this.task = BBUTask.None;
  }
  async update(excludes,allowfixup){
    if(this.scannedBookmarks === null || this.task.type !== BBUTask.TYPE_UPDATE){
      throw new Error(`Unexpected engine state "${this.task.name}"`)
    }
    this.task.progress.init(this.scannedBookmarks.getSize());
    const IS_DOMAIN_OR_REGEXP = (this.matchMode.type === BBUDomainMode.TYPE || this.matchMode.type === BBURegExpMode.TYPE);
    const REPLACER = this.getReplacers();
    let success = false;
    
    const CHANGES = {
      url: REPLACER.url[0] && (this.matchMode.type === BBURegExpMode.TYPE || REPLACER.url[1]),
      title: this.matchMode.type === BBURegExpMode.TYPE && REPLACER.title[0] && (typeof REPLACER.title[1] === "string")
    };
    
    // This is necessary to get around an issue when Promise.all may resolve too fast if all bookmarks fail to update, which in turn confuses the popup ui.
    await sleep(100);
  
    const failedOperations = [];
    let excludeCount = 0;
    
    let iter = this.scannedBookmarks.iter();
    const BATCH_SIZE = 100;
    
    
    try{
      while(true){
        let slice = Array.from(iter.take(BATCH_SIZE));
        if(slice.length === 0){
          break
        }
        let { exclusions, failures} = await this.#batchUpdate(slice,REPLACER,CHANGES,excludes,allowfixup, IS_DOMAIN_OR_REGEXP);
        excludeCount += exclusions
        failedOperations.push(failures);
        if(slice.length < BATCH_SIZE){
          break
        }
      }
      success = true
    }catch(ex){
      console.error(ex);
    }
    
    let connection = getConnection();
    let failures = failedOperations.flat();
    connection.port.postMessage({
      type: "update",
      ok: (success && !failures.length),
      length: this.task.progress.current - excludeCount,
      failures: failures,
      portID: connection.id
    });
    this.task = BBUTask.None;
    // reset() takes one "force" argument to fully reset status so we can recover from hard errors
    // note - success will be true if bookmark couldn't be updated due to no matching id
    this.reset(!success);
    
  }
  async #batchUpdate(aSet,REPLACER,CHANGES,excludes,allowfixup, IS_DOMAIN_OR_REGEXP){
    let exclusions = 0;
    let failures = [];
    let success = false;
    
    let updatePromises = [];
    
    for(let bm of aSet){
      //if(excludes.includes(bm.id)){
      if(excludes.has(bm.id)){
        this.task.progress.advance();
        exclusions++;
        continue
      }
      let newProps = {};
      let failedURL;
      if(CHANGES.url){
        newProps.url = bm.url.replace(REPLACER.url[0],REPLACER.url[1]);
        if(IS_DOMAIN_OR_REGEXP && !BBU.isValidURL(newProps.url,bm.url.indexOf("\\" === -1))){
          failedURL = newProps.url;
          delete newProps.url
        }
      }
      if(CHANGES.title){
        newProps.title = bm.title.replace(REPLACER.title[0],REPLACER.title[1]);
      }

      if(newProps.url || newProps.title){
        const ID = bm.id;
        // This path should handle an outcome where the resulting url is in
        // in encoded form and thus invalid. If such a scenario were to happen
        // then it's very likely that the url does not have a ":" in it
        // so use that as a simple detecting mechanism. Moreso, should
        // such a scenario occur, then it is likely that the correct url
        // was part of a query parameter
        if(allowfixup && newProps.url.indexOf(":") === -1){
          let queryIndex = newProps.url.indexOf("?");
          if(queryIndex > -1){
            newProps.url = BBU.reformatUrl(newProps.url,queryIndex);
          }else{
            newProps.url = BBU.reformatUrl(newProps.url,newProps.url.length);
          }
        }
        let updating = browser.bookmarks.update(ID,newProps);
        updatePromises.push(updating);
        // This error should only happen if the bookmark to be updated is no longer available when the update is being run but it was available when scanning
        updating
        .catch((e)=>(failures.push({error:e.message}),true))
        .finally(()=>(this.task.progress.advance()));
        
      }else{
        failures.push({error:`invalid url: ${failedURL}`});
        this.task.progress.advance()
      }
    }
    await Promise.allSettled(updatePromises);
    return {
      failures : failures,
      exclusions: exclusions
    }
  }
  
  createBookmarkList(){
    if(this.task.isRunning || !this.scannedBookmarks){
      throw new Error("cannot list anything")
    }
    const REPLACER = this.getReplacers();
    return Array.from(this.scannedBookmarks.nodeset).map(bm => BBU.BM(bm,REPLACER,true))
  }
  async reset(force){
    console.log("resetting...");
    if(force || !this.task.isRunning){
      this.task.progress.reset();
      this.scannedBookmarks = null;
      this.matchMode.clearState();
      this.task = BBUTask.None
    }else{
      console.warn(`reset was ignored due to pending ${this.task.name} operation`)  
    }
  }
  getReplacers(){
    let rv = {url:new Array(2),title:new Array(2)};
    
    switch(this.matchMode.type){
      case BBUProtocolMode.TYPE:
        rv.url[0] = /^http:/;
        rv.url[1] = "https:";
        break;
      case BBURegExpMode.TYPE:
        rv.title[0] = this.matchMode.operands.title.from;
        rv.title[1] = this.matchMode.operands.title.to;
      case BBUDomainMode.TYPE:
        rv.url[0] = this.matchMode.operands.url.from;
        rv.url[1] = this.matchMode.operands.url.to;
        break;
    }
    return rv
  }
  initializeScan(ARGS,rv){
    // Note ARGS here is the serialized object from request message
    switch(ARGS.type){
      case "protocol":{
        let mode = new BBUProtocolMode(ARGS);
        rv.ok = mode.isOperationValid();
        if(!rv.ok){
          rv.message = "somehow protocol upgrade definition failed"
        }
        return mode
      }
      case "domain":{
        let mode = new BBUDomainMode(ARGS);
        rv.ok = mode.isOperationValid();
        if(!rv.ok){
          rv.message = "input or output domain is not defined"
        }
        return mode
      }
      case "regexp":{
        try{
          let mode = new BBURegExpMode(ARGS);
          rv.ok = mode.isOperationValid();
          if(!rv.ok){
            rv.message += ";input or output operand is not defined"
          }
          return mode
        }catch(ex){
          rv.ok = false;
          rv.message = `Invalid regular expression: ${ex.message}`
          return null
        }
      }
      default:
        rv.message = "unknown scan type"; 
        rv.ok = false;
    }
    return null
  }
  static tryMakeUrl(base){
    try{
      return new URL(base)
    }catch(e){
      return null
    }
  }
  static isValidURL(url,hasNoBackslash){
    try{
      let d = BBU.tryMakeUrl(url) || BBU.tryMakeUrl(decodeURIComponent(url));
      let rv = !d.host.startsWith(".")
            && !d.host.endsWith(".")
            &&  d.host.indexOf("..") === -1
            && !d.pathname.startsWith("//");
      return rv && (!hasNoBackslash || url.indexOf("\\") === -1)
    }catch(e){
      console.log(`invalid url with error: ${e.message}`)
    }
    return false
  }
  static reformatUrl(url,index){
    try{
      return decodeURIComponent(url.slice(0,index)) + url.slice(index)
    }catch(e){
      // this will intentionally cause bookmarks.update() to fail
      return null
    }
  }
  static isBookmarkATarget(node,ref){
    let { queries } = ref;
    switch(ref.options.type){
      case "protocol":
        return (/^http:/).test(node.url) && (queries.url === null || BBU.parseDomain(node.url).endsWith(queries.url))
        break;
      case "domain":
        return BBU.parseDomain(node.url).endsWith(queries.url);
        break;
      case "regexp":
        return queries.url ? queries.url.test(node.url) : queries.title ? queries.title.test(node.title) : false
      default:
        break;
    }
    return false
  }
  static traverseBookmarkTree(tree,ref){
    for(let node of tree.children){
      if(node.children){
        BBU.traverseBookmarkTree(node,ref);
      }else if(node.type === "bookmark"){
        if( BBU.isBookmarkATarget(node,ref) ){
          ref.nodeset.add(node);
        }
      }
    }
    return ref;
  }
  static BM(bm,r,includeReplacement){
    const o = { id: bm.id };
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
  static parseDomain(url){
    let start = url.indexOf("//") + 2;
    let end = url.indexOf("/",start);
    if(start > 0 && end > start){
      return url.slice(start,end)
    }else{
      return url.slice(start)
    }
  }
  static getEngine(){
    if(!gEngine){
      gEngine = new BBU()
    }
    return gEngine
  }
  static isOpValid(obj){
    let rv = {ok:false};
    let engine = BBU.getEngine();
    // We can be doing some other task when this is called, such as status can be queried during update process
    if(engine && engine.task.isRunning){
      rv.message = `${engine.task.name} is running`;
    }
    switch(obj.operation){
      case "scan":
        rv.ok = !rv.message;
        if(rv.ok){
          engine.task = BBUTask.Scan();
          let mode = engine.initializeScan(obj.properties,rv);
          if(rv.ok){
            engine.setMode(mode)
          }
        }
        break;
      case "status":
        rv.ok = true;
        rv.busy = !!rv.message;
        rv.progress = `${engine.task.isRunning ? engine.task.progress.now() : 100}%`;
        break;
      case "update":
        rv.ok = !engine.task.isRunning;
        if(rv.ok){
          if(!engine.scannedBookmarks || engine.scannedBookmarks.length === 0){
            rv.ok = false;
            rv.message = "no scanned bookmarks to update";
            break;
          }
          engine.task = BBUTask.Update();
          if(engine.matchMode === BBUDomainMode.TYPE){
            rv.ok = (engine.matchMode.operands.url.isValid());
            if(!rv.ok){
              rv.message = "input or output domain is not defined"
            }
          }else if(engine.matchMode === BBURegExpMode.TYPE){
            rv.ok = (engine.matchMode.operands.url.isValid() || engine.matchMode.operands.title.isValid());
            if(!rv.ok){
              rv.message = "missing argument for replace operation"
            }
          }
        }
        break;
      case "list":
        rv.ok = !engine.task.isRunning;
        if(rv.ok){
          if(!engine.scannedBookmarks){
            rv.ok = false;
            rv.message = "Bookmarks haven't been scanned yet";
          }
        }
        break;
      case "reset":
        rv.ok = !engine.task.isRunning;
        break;
      default:
        console.warn(`Error determining op ${obj.operation}`)
        rv.message = "unknown op"
        break;
    }
    return {engine:engine,result:rv}
  }
}