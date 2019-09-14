'use strict';

function messageHandler(request,sender,sendResponse){
  if(sender.id != browser.runtime.id || sender.envType != "addon_child"){
      return
  }
  
  switch(request.type){
    case "scan":
    let button = document.querySelector("#updateButton");
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
        setStatus(`Update success:${request.message}`)
      }else{
        setStatus(`Update failed:${request.message}`)
      }
      break;
    default:
      return
  }
  
}

function setStatus(str){
  document.querySelector("#statusbar").textContent = str;
}

function requestScan(e){
  e.target.textContent = "scanning...";
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

document.onreadystatechange = function () {
  if (document.readyState === "complete") {
    document.querySelector("#scanButton").addEventListener("click",requestScan);
    browser.runtime.onMessage.addListener(messageHandler);
  }
}