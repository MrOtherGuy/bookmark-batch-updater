'use strict';

let INTERVAL = null;

function messageHandler(request,sender,sendResponse){
  if(sender.id != browser.runtime.id || sender.envType != "addon_child"){
      return
  }
  let button = DQ("#almostUpdateButton");
  switch(request.type){
    case "scan":
    
      document.body.setAttribute("style",`--bmb-bookmark-count:'${request.length}'`);
      
      if(request.success){
        button.removeAttribute("disabled");
        setStatus("Scan complete",false,"Number of matching bookmarks");
        DQ("#domainText").textContent = request.domain || "";
        browser.runtime.sendMessage({operation:"list"})
        // background will send the list soon after
      }else{
        button.setAttribute("disabled","true");
        setStatus("Scan failed");
      }
      DQ("#scanButton").textContent = "Scan bookmarks";
      
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
      DQ("#scanButton").removeAttribute("disabled");
      clearInterval(INTERVAL);
      break;
    case "list":
      listBookmarks(request.list);
      break;
    default:
      return
  }
  
}

function createListItem(bm){
  let container = document.createElement("div");
  container.classList.add("listItem");

  for(let prop in bm){
    let t = document.createElement("div");
    t.textContent = bm[prop];
    container.appendChild(t)
  }
  return container
}

function listBookmarks(list){
  
  let listParent = DQ("#bmList");
  let odd = true;
  while(listParent.children.length > 0){
    listParent.removeChild(listParent.children[0]);
  }
  for(let bm of list){
    let item = listParent.appendChild(createListItem(bm));
    odd && item.classList.add("odd");
    odd = !odd;
  }
}

function DQ(str){
  return document.querySelector(str)
}

function setStatus(message,progress,listContext){
  if(message){
    DQ("#messageBox").textContent = message;
  }
  if(progress){
    DQ("#progressBox").textContent = progress;
  }
  if(listContext){
    DQ("#nBookmarks").textContent = listContext;
  }
}

function selectType(){
  return DQ(".radio:checked").value
}

function requestScan(e){
  e.target.textContent = "Scanning...";
  
  let type = selectType();
  
  let op = {operation:"scan",properties:{type:type}};
  switch(type){
    case "domain":
      op.properties.toDomain = String(DQ("#domainReplace").value) || null;
    case "protocol":
      op.properties.fromDomain = String(DQ("#domainFilter").value) || null;
      break;
    case "regexp":
      op.properties.fromDomain = String(DQ("#regexpURLFilter").value);
      op.properties.toDomain = String(DQ("#regexpURLReplace").value);
      op.properties.fromTitle = String(DQ("#regexpTitleFilter").value);
      op.properties.toTitle = String(DQ("#regexpTitleReplace").value);
      break;
    default:
      op.properties.type = null;
  }
  
  browser.runtime.sendMessage(op)
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
    (error)=>(setStatus(`Error: ${error}`))
  );
}

function initView(state){
  setStatus(state.message,state.progress);
  DQ("#scanButton").setAttribute("disabled","true");
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
        DQ("#almostUpdateButton").setAttribute("disabled","true");
      }
      
    },
    (error)=>(setStatus(`something went wrong: ${error}`))
  )
  .finally(()=>(DQ("#updateWarning").classList.add("hidden")))
}

function showUpdateButton(){
  DQ("#updateWarning").classList.remove("hidden")
}

document.onreadystatechange = function () {
  if (document.readyState === "complete") {
    DQ("#scanButton").addEventListener("click",requestScan);
    DQ("#updateButton").addEventListener("click",requestUpdate);
    DQ("#almostUpdateButton").addEventListener("click",showUpdateButton);
    
    document.querySelectorAll(".radio").forEach((r)=>{
      r.addEventListener("change",()=>(r.checked&&DQ("#almostUpdateButton").setAttribute("disabled","true")))
      
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
