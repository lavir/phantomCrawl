'use strict';

var urlModule = require('url');
var smpl = require('smpl');

var urlToPath = require('./urlToPath');
var urlType = require('./urlType');
var redis = require("redis");
var Promise = require('es6-promise').Promise;

var client = redis.createClient();

var DEFAULT_FILTERS = ['domain', 'level', 'crash'];
var STANDARD_FILTERS = {
	'domain': './filters/domain',
	'level': './filters/level',
	'crash': './filters/crash'
};

/**
 * @module urlStore
 * @class urlStore
 */
var urlStore = {
	urlMap: {},
	urlPages: [],
	urlCrashedPages: [],
	urlRessources: [],
	cbPages: [],
	cbCrashedPages: [],
	cbRessources: [],
	ongoingCallbacks: []
};

urlStore.setFilters = function(filters) {
	filters = filters || DEFAULT_FILTERS;
	
	for (var i = 0; i < filters.length; i++) {
		var filter = filters[i];
		if (typeof filter === 'string') {
			filter = STANDARD_FILTERS[filter] || filter;
			filters[i] = require(filter);
		}
	}
	
	this.urlFilters = filters;
};

urlStore.setSubdomains = function(subDomains) {
  this.subDomains = subDomains;
};

/**
 * Add an url to the list of URLs to crawl
 * 
 * @method add
 *
 * @param url {Object} Url to add
 * @param url.url {String} Url to add
 * @param url.level {number}
 * @param [url.crashed=0] {number}
 * @param [url.mime] {String} If mime type is known, it need to be set
 * @param force {boolean} Set it to true if ressubmiting an url that had the wrong type. `url.mime` is mandatory in that case
 */

urlStore.add = function(url, force) {
  var _this = this;
  return new Promise(function(resolve, reject) {
    console.log("urlStore.add, url:",url);

    _this.getUrlMap(url.path).then(function(urlConfig) {
      console.log("Ok!", urlConfig);

        if ((force || !urlConfig) && _this.isValid(url)) {
		      var type = url.crashed ? 'CrashedPages' :
		                 urlType.isPage(url) ? 'Pages' :
		                 'Ressources';
          console.log("url, type", url, type);
          return([url, type]);
        }
        reject(false);
    }).then(function(urlAndType) {
        var url = urlAndType[0];
        var type = urlAndType[1];
        console.log("dsadas url.path, type:",url, type);

        _this.setUrlMap(url.path, type).then(function() {
          console.log("dsadas -2");
          var cb = _this['cb' + type];
          if (cb.length) {
            _this.call(cb.shift(), url, type);
            resolve(true);
          } else {
            _this.setUrlX(type, url).then(function(){
            resolve(true);
            });
          }
        });
      });
  });
};

urlStore.isValid = function(url) {
  console.log("urlStore.isValid");
	this.normalise(url);
	for (var i = 0; i < this.urlFilters.length; i++) {
		if (!this.urlFilters[i].filter(url)) return false;
	}
	return true;
};

urlStore.normalise = function(url) {
  console.log(' •', url.url);
	url.url = urlModule.format(urlModule.parse(url.url));
  console.log('••', url.url);
	url.path = urlToPath.getPath(url.url);
	url.level = url.level || 0;
	url.crashed = url.crashed || 0;
	url.primary = url.primary || false;
	url.mime = url.mime || undefined;
	url.subDomains = this.subDomains;
};

urlStore.getPage = function(cb) {
  var _this = this;
  return new Promise(function(resolve, reject) {
    _this.get('Pages', cb);
  });

};

urlStore.cancelGetPage = function(cb) {
	this.cancelGet('Pages', cb);
};

urlStore.getCrashedPage = function(cb) {
  var _this = this;
  return new Promise(function(resolve, reject) {
	  _this.get('CrashedPages', cb);
  });
};

urlStore.cancelCrashedPage = function(cb) {
	this.cancelGet('CrashedPages', cb);
};

urlStore.getRessource = function(cb) {
  console.log("Get Ressources", cb);
  var _this = this;
  return new Promise(function(resolve, reject) {
    _this.get('Ressources', cb);
  });

};

/*
  Redis
 */
client.on("error", function (err) {
  console.log("Error:", err);
});

urlStore.setUrlMap = function(key, value) {
  console.log("Callback", key, value);
  return new Promise(function(resolve, reject){
    client.set('map' + '-' + key, value, function(err, replies) {
      console.log("setUrlMap:replies:", replies);
      if (replies === 'OK') {
        resolve(true);
      } else {
        console.log("Err", err);
        reject(false);
      }
    });
  });

};

urlStore.getUrlMap = function(key) {
  console.log("getUrlMap, key", key);
  return new Promise(function(resolve, reject) {
    client.get('map' + '-' + key, function (err, replies) {
      console.log("urlStore.getUrlMap", replies);
//      if (replies) {
        resolve(replies);
//      } else {
//        reject(Error(err));
//      }
    });
  });
};

urlStore.setUrlX = function(type, value) {
  console.log("urlStore.setUrlX", type, value);
  return new Promise(function(resolve, reject) {
    value = JSON.stringify(value);
    client.rpush(type, value, function(err, replies) {
      if (err) {
        reject(err);
      } else {
        resolve(replies);
      }
    });
  });
};

urlStore.getListUrlRnd = function(type, lenOfList) {
  console.log("urlStore.getListUrlRnd: type:", type, lenOfList);
  return new Promise(function(resolve, reject){
    var rndNum = smpl.number.randomInt(0, lenOfList-1);
    client.lrange(type, rndNum, rndNum, function(err, replies) {
      console.log("-client.lrange", replies, err, type);
      if (replies.length) {
        console.log("resolve(JSON.parse(replies));", replies);
        resolve(JSON.parse(replies));
      } else {
        reject(type + "is empty!");
      }
    })
  });
};

urlStore.getLenOfList = function(type) {
  console.log("getLenOfList type:", type);
  return new Promise(function(resolve, reject) {
    client.llen(type, function(err, replies) {
      if (err) {
        console.log("getLenOfList reject", err);
        reject(0);
      } else {
        console.log("getLenOfList return", replies);
        resolve(replies);
      }
    });
  });
}

/**
 *
 * @method get
 *
 * @private
 */
//urlStore.get = function(type, cb) {
//	var list = this['url' + type];
//
//	if (list.length) {
//		var url = list.splice(smpl.number.randomInt(0, list.length), 1)[0];
//		this.call(cb, url, type);
//	} else {
//		var cbList = this['cb' + type];
//		cbList.push(cb);
//	}
//};

urlStore.get = function(type, cb) {
  console.log("urlStore.get", type, cb);
  var _this = this;
  this.getLenOfList(type).then(function(lenOfList){
    console.log("got getLenOfList", lenOfList);
    if (lenOfList) {
      console.log("got getLenOfList - 2", type, lenOfList);
      urlStore.getListUrlRnd(type, lenOfList).then(function(url) {
        console.log("2. cb, url, type", cb, url, type);
        _this.call(cb, url, type);
      });
    } else {
      var cbList = this['cb' + type];
      cbList.push(cb);
    }
  });

};
/**
 * 
 * @method cancelGet
 *
 * @private
 */
urlStore.cancelGet = function(type, callback) {
	var cbList = this['cb' + type];
	this['cb' + type] = this['cb' + type].filter(function(cb) {
		return cb !== callback;
	});
	this.ongoingCallbacks = this.ongoingCallbacks.filter(function(cb) {
		return cb[0] !== callback || cb[2] !== type;
	});
};

urlStore.isEmpty = function() {
  var _this = this;
  return new Promise(function(resolve, reject) {
    _this.getLenOfList("Ressources").then(function(lenOfList) {
      _this.getLenOfList("Pages").then(function(lenOfList2) {
        return (lenOfList + lenOfList2);
      }).then(function(lenOfList) {
          _this.getLenOfList("CrashedPages").then(function(lenOfList2) {
            lenOfList = lenOfList + lenOfList2 + _this.ongoingCallbacks.length;
            if (lenOfList === 0) {
              resolve(true);
            } else {
              resolve(false);
            }
          })
        })
    })
  });
//	return this.getLenOfList("Ressources") + this.getLenOfList("Pages") + this.getLenOfList("CrashedPages") + this.ongoingCallbacks.length === 0;
};

/**
 * 
 * @method call
 *
 * @private
 */
urlStore.call = function(cb, url, type) {
	this.ongoingCallbacks.push([cb, url, type]);
	if (this.ongoingCallbacks.length === 1) {
		(global.setImmediate || process.nextTick)((function() { //setImmediate introduced in node 0.10
			var cb;
			while (cb = this.ongoingCallbacks.shift()) {
				cb[0](cb[1]);
			}
		}).bind(this));
	}
};

module.exports = urlStore;
