'use strict';

let INTERVAL = null;

function messageHandler(request,sender,sendResponse){
  if(sender.id != browser.runtime.id || sender.envType != "addon_child"){
      return
  }
  let button = document.querySelector("#updateButton");
  switch(request.type){
    case "scan":
    
      document.querySelector("#bookmarkCount").textContent = request.length; 
      if(request.success){
        button.removeAttribute("disabled");
        setStatus("Scan complete");
      }else{
        button.setAttribute("disabled","true");
        setStatus("Scan failed");
      }
      document.querySelector("#scanButton").textContent = "Scan bookmarks";
      break;
    case "update":
      if(request.success){
        setStatus(`Update success:${request.length} bookmarks were updated`," ");
      }else{
        setStatus(`Update failed: Failure @${request.length}`," ");
      }
      button.setAttribute("disabled","true");
      button.textContent = "Update bookmarks";
      document.querySelector("#scanButton").removeAttribute("disabled");
      clearInterval(INTERVAL);
      break;
    default:
      return
  }
  
}

function setStatus(str,progress){
  if(str){
    document.querySelector("#messageBox").textContent = str;
  }
  if(progress){
    document.querySelector("#progressBox").textContent = progress;
  }
}

function requestScan(e){
  e.target.textContent = "Scanning...";
  let domain = String(document.querySelector("#domainFilter").value) || null;
  //let scanning = initScan(domain);
  
  browser.runtime.sendMessage({operation:"scan",domain:domain})
  .then(
    (response)=>{
      setStatus(`${response.ok?"Please wait...":"Error"}:${response.message}`);
    },
    (error)=>(setStatus("something went wrong"))
    );
  /*
  scanning.then((bookmarks) => {
    e.target.textContent = "Scan bookmarks";
    document.querySelector("#domainText").textContent = domain || "";
    document.querySelector("#bookmarkCount").textContent = bookmarks.collection.length;
    //console.log(bookmarks.collection);
    
    let bmList = document.querySelector("#bmList");
    while(bmList.firstChild){
      bmList.removeChild(bmList.firstChild);
    }
    for(let bookmark of bookmarks.collection){
      let div = document.createElement("div");
      div.textContent=bookmark.url;
      bmList.appendChild(div);
    }
    let button = document.querySelector("#updateButton");
    button.removeAttribute("disabled");
    button.addEventListener("click",updateBookmarks);
    scannedBookmarks = bookmarks;
  },
  (error)=>(console.log(error),scannedBookmarks = null,document.querySelector("#updateButton").setAttribute("disabled","true"))
  );*/
}

function initView(state){
  setStatus(state.message,state.progress);
  document.querySelector("#updateButton").textContent = "Updating...";
  document.querySelector("#scanButton").setAttribute("disabled","true");
}

async function statusCheck(){
  browser.runtime.sendMessage({operation:"status"})
  .then(
    (message)=>(setStatus("",message.progress))
  )
}

function requestUpdate(e){
  e.target.textContent = "Updating...";
  browser.runtime.sendMessage({operation:"update"})
  .then(
    (response)=>{
      if(response.ok){
        initView(response);
        INTERVAL = setInterval(statusCheck,300)
      }else{
        setStatus(`Error:${response.message}`);
        let button = document.querySelector("#updateButton");
        button.textContent = "Update bookmarks";
        button.setAttribute("disabled","true");
      }
      
    },
    (error)=>(setStatus("something went wrong"))
    );
}
document.onreadystatechange = function () {
  if (document.readyState === "complete") {
    document.querySelector("#scanButton").addEventListener("click",requestScan);
    document.querySelector("#updateButton").addEventListener("click",requestUpdate);
    browser.runtime.onMessage.addListener(messageHandler);
    // Ask status from background
    browser.runtime.sendMessage({operation:"status"})
    .then((state)=>(state.busy&&initView(state)))
  }
}