'use strict';

let scannedBookmarks = null;

function getDomain(url){
  let end = url.indexOf("/",7);
  if(end > 7){
    return url.slice(7,end)
  }else{
    return url.slice(7)
  }
}

function traverseBookmarkTree(tree,ref){
  
  for(let node of tree.children){
    if(node.children){
      traverseBookmarkTree(node,ref);
    }else if(node.type === "bookmark"){
      if((/^http:/).test(node.url)){
        
        let domain = getDomain(node.url);
        if(ref.domain === null || domain === ref.domain){
          ref.collection.push(node);
        }
        
        /*
          node.domain = domain;
          if(!ref.domains.includes(domain)){
          ref.domains.push(domain);
        }*/
      }
    }
  }
  return ref;
}

function initScan(domain){
  return new Promise((resolve,reject) => {
    browser.bookmarks.getTree().then(
      (success) => resolve(traverseBookmarkTree(success[0],{collection:[],domain:domain})),
      (error) => reject("for reasons")
    );
  });
}

function scan(e){
  e.target.textContent = "scanning...";
  let domain = String(document.querySelector("#domainFilter").value) || null;
  let scanning = initScan(domain);
  scanning.then((bookmarks) => {
    e.target.textContent = "scan complete";
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
  );
}

function urlEquals(url1,url2){
  
  if(!url1.endsWith("/")){
    url1 += "/";
  }
  if(!url2.endsWith("/")){
    url2 += "/";
  }
  
  return url1 === url2
}
/*
function testNetwork(domain){
  return new Promise((resolve,reject) => {
    const xhr = new XMLHttpRequest();
    const url = `https://${domain}/`;
    xhr.open('GET',url,true);
    xhr.onreadystatechange = function(){
      //console.log(xhr.readyState);
      if (xhr.readyState === 3){
        //console.log(xhr.status);
        if(urlEquals(xhr.responseURL,url)){
          resolve(domain)
        }else{
          //console.log(xhr.responseURL);
          resolve(0);
        }
        xhr.abort();
      }
    };
    xhr.onerror = () => (resolve(0));
    xhr.send();
  })
}

function updateBookmarksWithNetworkTest(){
  if(scannedBookmarks === null){
    return
  }
  let bookmarkPromises = [];
  let domainQueries = [];
  for(let bm of scannedBookmarks.collection ){
    let idx = scannedBookmarks.domains.indexOf(bm.domain);
    if(idx != -1){
      scannedBookmarks.domains[idx] = null;
      domainQueries.push(testNetwork(bm.domain));
    }
  }
  let validDomains = [];
  Promise.all(domainQueries).then((values)=>{
    
    for(let domain of values){
      console.log(domain);
      if(domain){
        validDomains.push(domain);
      }
    }
    console.log(`${validDomains.length} unique domains`);
  })
  .then(()=>{
    for(let bm of scannedBookmarks.collection){
      if(validDomains.includes(bm.domain)){
        
        bookmarkPromises.push(browser.bookmarks.update(bm.id,{url:bm.url.replace(/^http:/,"https:")}))
      }
    }
  })
  .finally(
    Promise.all(bookmarkPromises)
    .then(
      ()=>(document.querySelector("#nBookmarks").textContent = `Update successful - ${bookmarkPromises.length} were updated`))
    .catch(error => (document.querySelector("#nBookmarks").textContent = `FAILURE:${error}`))
  )
}
*/
function updateBookmarks(){
  if(scannedBookmarks === null){
    return
  }
  let bookmarkPromises = [];
  for(let bm of scannedBookmarks.collection ){
   bookmarkPromises.push(browser.bookmarks.update(bm.id,{url:bm.url.replace(/^http:/,"https:")}))
  }
  Promise.all(bookmarkPromises)
  .then((values)=>{
    document.querySelector("#nBookmarks").textContent = `Update successful - ${bookmarkPromises.length} were updated`;
    
  })
  .catch(error => (document.querySelector("#nBookmarks").textContent = `FAILURE:${error}`))
}

document.onreadystatechange = function () {
  if (document.readyState === "complete") {
    document.querySelector("#scanButton").addEventListener("click",scan);
  }
}