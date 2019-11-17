'use strict';

let INTERVAL = null;

function messageHandler(request,sender,sendResponse){
  if(sender.id != browser.runtime.id || sender.envType != "addon_child"){
      return
  }
  let button = document.querySelector("#almostUpdateButton");
  switch(request.type){
    case "scan":
    
      document.body.setAttribute("style",`--bmb-bookmark-count:'${request.length}'`);
      
      if(request.success){
        button.removeAttribute("disabled");
        setStatus("Scan complete",false,"Number of matching bookmarks");
        document.querySelector("#domainText").textContent = request.domain || "";
        browser.runtime.sendMessage({operation:"list"})
        // background will send the list soon after
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
        let fails = request.failures ? request.failures.length : 0;
        setStatus(`Update finished with ${request.length - fails} success and ${request.failures.length} failures`," ","Failed operations");
        listBookmarks(request.failures);
      }
      button.setAttribute("disabled","true");
      document.querySelector("#scanButton").removeAttribute("disabled");
      clearInterval(INTERVAL);
      break;
    case "list":
      listBookmarks(request.list);
      break;
    default:
      return
  }
  
}

function listBookmarks(list){
  
  let listParent = document.querySelector("#bmList");
  while(listParent.children.length > 0){
    listParent.removeChild(listParent.children[0]);
  }
  for(let url of list){
    let div = document.createElement("div");
    div.textContent = url;
    listParent.appendChild(div)
  }
}

function setStatus(message,progress,listContext){
  if(message){
    document.querySelector("#messageBox").textContent = message;
  }
  if(progress){
    document.querySelector("#progressBox").textContent = progress;
  }
  if(listContext){
    document.querySelector("#nBookmarks").textContent = listContext;
  }
}

function selectType(){
  return document.querySelector(".radio:checked").value
}

function requestScan(e){
  e.target.textContent = "Scanning...";
  
  let type = selectType();
  
  let domain = type === "regexp" ? String(document.querySelector("#regexpFilter").value) : String(document.querySelector("#domainFilter").value) || null;
  let replacer = String(document.querySelector("#domainReplace").value) || null;
  
  browser.runtime.sendMessage({operation:"scan",properties:{type:selectType(),fromDomain:domain,toDomain:replacer}})
  .then(
    (response)=>{
      if(response.ok){
        setStatus("Please wait");
      }else{
        e.target.textContent = "Scan Bookmarks";
        setStatus(`Error: ${response.message}`);
        listBookmarks([]);
        document.body.setAttribute("style","--bmb-bookmark-count:'0'");
      }
    },
    (error)=>(setStatus("something went wrong"))
  );
}

function initView(state){
  setStatus(state.message,state.progress);
  document.querySelector("#scanButton").setAttribute("disabled","true");
}

async function statusCheck(){
  browser.runtime.sendMessage({operation:"status"})
  .then(
    (message)=>(message.busy && setStatus("Progress: ",message.progress))
  )
}

function requestUpdate(e){
  browser.runtime.sendMessage({operation:"update"})
  .then(
    (response)=>{
      if(response.ok){
        initView(response);
        INTERVAL = setInterval(statusCheck,300)
      }else{
        setStatus(`Error:${response.message}`);
        document.querySelector("#almostUpdateButton").setAttribute("disabled","true");
      }
      
    },
    (error)=>(setStatus("something went wrong"))
  )
  .finally(()=>(document.querySelector("#updateWarning").classList.add("hidden")))
}

function showUpdateButton(){
  document.querySelector("#updateWarning").classList.remove("hidden")
}

document.onreadystatechange = function () {
  if (document.readyState === "complete") {
    document.querySelector("#scanButton").addEventListener("click",requestScan);
    document.querySelector("#updateButton").addEventListener("click",requestUpdate);
    document.querySelector("#almostUpdateButton").addEventListener("click",showUpdateButton);
    
    document.querySelectorAll(".radio").forEach((r)=>{
      r.addEventListener("change",()=>(r.checked&&document.querySelector("#almostUpdateButton").setAttribute("disabled","true")))
      
    })
    
    browser.runtime.onMessage.addListener(messageHandler);
    // Ask status from background
    browser.runtime.sendMessage({operation:"status"})
    .then((state)=>{if(state.busy){initView(state);INTERVAL=setInterval(statusCheck,300)}})
      
    window.addEventListener("unload",function(e){
      browser.runtime.sendMessage({operation:"reset"})
    })
  }
}
