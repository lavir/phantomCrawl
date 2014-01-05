'use strict';

var http = require('http');
var https = require('https');
var urlModule = require('url');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var smpl = require('smpl');

var saveFile = require('./utils/saveFile');
var urlStore = require('../url/urlStore');
var urlType = require('../url/urlType');

var CrawlerThread = function(config) {
	this.config = config;
	this.requestUrl();
};
util.inherits(CrawlerThread, EventEmitter);

CrawlerThread.prototype.requestUrl = function() {
	if (!this.urlRequestRunning) {
    var _this = this;
		urlStore.getRessource(this.startCrawling.bind(this)).then(function() {
      _this.urlRequestRunning = true;
    });

	}
};

CrawlerThread.prototype.startCrawling = function(url) {
	this.urlRequestRunning = false;
	
	this.crawling = true;
	
	var id = smpl.utils.uniq();
	
	console.log('[' + id + '] crawling ressource ' + url.url);
	
	var req = urlModule.parse(url.url);
	req.headers = {
		'User-Agent': this.config.userAgent
	};
	
	var get = (url.url.slice(0, 5) === 'https') ? https.get : http.get;
	get(req, this.crawlDone.bind(this, id, url)).on('error', this.crawlDone.bind(this, id, 'error'));
};

CrawlerThread.prototype.crawlDone = function(id, url, res) {
	this.crawling = false;
  console.log("• CrawlerThread.prototype.crawlDone: id, url, res", id, url, res);
	if (url === 'error') {
		console.log('[' + id + '] done (error ' + res.message + ')');
	} else if (res.statusCode >= 200 && res.statusCode < 300) {
		var mime = res.headers['content-type'];
		if (mime && urlType.isPageMime(mime)) {
			console.log('[' + id + '] done (bad type ' + mime + ')');
			url.mime = mime;
      var _this = this;
			urlStore.add(url, true).then(function() {
        _this.emit('idle');
	      _this.requestUrl();
      });
		} else {
			console.log('[' + id + '] receiving ressource');
			res.setEncoding('binary');
			
			var data = '';
			res.on('data', function (chunk) {
				data += chunk;
			});
			res.on('end', function () {
				console.log('[' + id + '] done');
				saveFile(url.path, data, 'binary');
			});
		}
		
	} else if (res.statusCode >= 300 && res.statusCode < 400) {
		console.log('[' + id + '] done (redirect to ' + res.headers.location + ')');
    var _this = this;
		urlStore.add({
			url: res.headers.location,
			level: url.level
		}).then(function() {
        _this.emit('idle');
	      _this.requestUrl();
      });
	} else {
		console.log('[' + id + '] done (error ' + res.statusCode + ')');
	}
	
	this.emit('idle');
	this.requestUrl();
};

CrawlerThread.prototype.isIdle = function() {
	return (!this.crawling);
};

CrawlerThread.prototype.exit = function() {
};

module.exports = CrawlerThread;
