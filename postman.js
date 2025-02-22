export class PostMan{
  #connection;
  #type;
  #map;
  #listener;
  #deliveries;
  constructor(def){
    this.#type = def.type;
    if(this.#type === "port"){
      this.#map = new Map();
    }
  }
  #onMessage(msg){
    if(msg.portID){
      if(this.#deliveries){
        let deliveryAddress = this.#deliveries.get(msg.portID);
        if(deliveryAddress){
          let delivery = deliveryAddress.get(msg.type);
          if(delivery){
            delivery.resolve(msg);
            deliveryAddress.delete(msg.type)
          }
        }
      }
      return
    }
    let deferred = this.#map.get(msg.id);
    if(deferred){
      if(msg.handshake){
        deferred.resolve(msg.handshake);
      }else{
        deferred.resolve(msg.response);
        if(this.#listener){
          this.#listener(msg.response);
        }
      }
      this.#map.delete(msg.id)
    }
  }
  #getDeliveryMap(id){
    let map = this.#deliveries.get(id);
    if(!map){
      map = new Map();
      this.#deliveries.set(id,map)
    }
    return map
  }
  expectDelivery(type){
    if(!type){
      throw new Error("must have type")
    }
    if(!this.#deliveries){
      this.#deliveries = new Map();
    }
    let delivery = Promise.withResolvers();
    delivery.promise.finally(()=>this.#getDeliveryMap(this.#connection.name)?.delete(type));
    
    let address = this.#getDeliveryMap(this.#connection.name);
    let old = address.get(type);
    if(old){
      old.reject({error: "Stolen message"})
    }
    address.set(type,delivery);
    return delivery.promise
  }
  onMessage(fun){
    if(typeof fun != "function"){
      throw new Error("not a function")
    }
    this.#listener = fun
  }
  async send(obj){
    if(this.#type = "port"){
      if(!this.#connection){
        console.log("no connection yet")
        let msg = PostMan.createMessage({ handshake:"postman" });
        let port = browser.runtime.connect({ name: msg.id });
        this.#map.set(msg.id,msg.deferred);
        port.onMessage.addListener(m=>this.#onMessage(m));
        await msg.deferred.promise;
        console.log("got connection",msg.id);
        this.#connection = port;
        port.onDisconnect.addListener(()=>{
          console.log("postman disconnected")
          for(let deferred of this.#map.values()){
            deferred.reject({status: "disconnected"})
          }
          this.#map.clear();
        });
      }
      let msg = PostMan.createMessage(obj);
      this.#map.set(msg.id,msg.deferred);
      this.#connection.postMessage({id:msg.id,data:msg.data});
      let response = await msg.deferred.promise;
      return response
    }
    let response = await browser.runtime.sendMessage(obj);
    return response
  }
  static createMessage(obj){
    return {id: crypto.randomUUID(),data: obj, deferred: Promise.withResolvers()}
  }
}