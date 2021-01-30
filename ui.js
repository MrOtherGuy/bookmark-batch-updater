'use strict';

let INTERVAL = null;
let currentScanLength = 0;
const excludeList = new Map();
const LOCAL_URL_PREFIXES = ["192.168.","127.0.","10.0.0.","10.10.1.","10.1"];
const SUPPORTED_PROPERTIES = ["url","title"];
const DQ = document.querySelector.bind(document);



function messageHandler(request,sender,sendResponse){
  if(sender.id != browser.runtime.id || sender.envType != "addon_child"){
      return
  }
  let button = DQ("#almostUpdateButton");
  switch(request.type){
    case "scan":
      currentScanLength = request.length;
      
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
        listFailures({list:request.failures});
      }
      button.setAttribute("disabled","true");
      DQ("#scanButton").removeAttribute("disabled");
      clearInterval(INTERVAL);
      break;
    case "list":
      listBookmarks(request);
      break;
    default:
      return
  }
  
}

function createListItem(bm,isChecked){
  function createCheckbox(bm){
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!isChecked;
    checkbox.setAttribute("data-id",bm.id);
    return checkbox
  }
  let container = document.createElement("div");
  container.classList.add("listItem");
  if(bm.hasOwnProperty("error")){
    container.appendChild(document.createElement("div")).textContent = bm.error;
    return container
  }
  container.appendChild(createCheckbox(bm));
  for(let prop in bm){
    if(SUPPORTED_PROPERTIES.includes(prop)){
      let t = document.createElement("div");
      t.appendChild(document.createElement("code")).textContent = "--";
      t.append(bm[prop].match);
      if(bm[prop].hasOwnProperty("replacement")){
        t.appendChild(document.createElement("br"));
        t.appendChild(document.createElement("code")).textContent = "++";
        t.append(bm[prop].replacement);
      }
      container.appendChild(t)
    }
  }
  return container
}



function listFailures(request){
  let listParent = DQ("#bmList");
  let odd = true;
  while(listParent.children.length > 0){
    listParent.removeChild(listParent.children[0]);
  }
  for(let fail of request.list){
    let item = listParent.appendChild(createListItem(fail,false));
    odd && item.classList.add("odd");
    odd = !odd;
  }
  document.body.setAttribute("style",`--bmb-bookmark-count:'${request.list.length}'`);
}

function listBookmarks(request){
  excludeList.clear();
  
  function shouldBMBeChecked(bm){
    if(!bm.url){
      return true
    }
    switch(request.operation){
      case "protocol":
        return LOCAL_URL_PREFIXES.every(url=>!bm.url.match.startsWith(`http://${url}`))
      case "regexp":
        return !bm.url.match.startsWith("javascript:") && !bm.url.match.startsWith("data:") ;
    }
    return true
  }
  
  let listParent = DQ("#bmList");
  let odd = true;
  while(listParent.children.length > 0){
    listParent.removeChild(listParent.children[0]);
  }
  
  for(let bm of request.list){
    let enabled = shouldBMBeChecked(bm);
    if(!enabled){
      excludeList.set(bm.id,true);
    }
    let item = listParent.appendChild(createListItem(bm,enabled));
    odd && item.classList.add("odd");
    odd = !odd;
  }
  document.body.setAttribute("style",`--bmb-bookmark-count:'${request.list.length - excludeList.size}'`);
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
        listBookmarks({list:[]});
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

function constructExcludeList(){
  excludeList.clear();
  let bookmarkList = Array.from(DQ("#bmList").children);
  for(let row of bookmarkList){
    let el = row.children[0];
    if(el.tagName != "INPUT"){ continue }
    if(!el.checked){
      let id = el.getAttribute("data-id");
      id && excludeList.set(id,true)
    }
  }
  return list
}

function onCheckboxToggle(ev){
  let target = ev.target;
  let dataid = target.getAttribute("data-id");
  if(dataid){
    if(target.checked){
      excludeList.delete(dataid)
    }else{
      excludeList.set(dataid,true)
    }
    document.body.setAttribute("style",`--bmb-bookmark-count:'${currentScanLength - excludeList.size}'`);
  }
}



function requestUpdate(e){
  browser.runtime.sendMessage({
    operation:"update",
    excludes:Array.from(excludeList.keys()),
    allowUrlFixup:DQ("#fixupCheckbox").checked
  })
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
    DQ("#bmList").addEventListener("change",onCheckboxToggle);
    document.querySelectorAll(".radio").forEach(
      (r) => {
        r.addEventListener("change",
          () => (r.checked&&DQ("#almostUpdateButton").setAttribute("disabled","true")))
      }
    );
    
    browser.runtime.onMessage.addListener(messageHandler);
    // Ask status from background
    browser.runtime.sendMessage({operation:"status"})
    .then( (state) => {
      if(state.busy){
        initView(state);
        INTERVAL = setInterval(statusCheck,300)
      }
    });
      
    window.addEventListener("unload",function(e){
      browser.runtime.sendMessage({operation:"reset"})
    })
  }
}
