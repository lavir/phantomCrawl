'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');

var smpl = require('smpl');

var Crawler = require('./Crawler');
var urlStore = require('../url/urlStore');

/**
 * @class CrawlerThread
 * @constructor
 *
 * @param config {Object}
 * @param [config.nbCrawlers] {integer} Number of pages to crawl in parallel
 * @param config.userAgent {string} User agent to use for the crawling
 * @param [config.crashRecover=false] {boolean} If true, will crawl the URLs from the previously crashed threads
 * @param [config.pageTransform] {Array}
 * @param [config.plugins] {Array}
 * @param [config.phantomPath] {String}
 */
var CrawlerThread = function(config) {
	this.config = config;
	this.id = smpl.utils.uniq();
	
	console.log('[' + this.id + '] Starting ' + (this.config.crashRecover ? 'crashRecover' : 'Crawler') + ' Thread');
	this.nbCrawlers = 0;
	this.maxCrawlers = config.nbCrawlers || 1;
	this.userAgent = config.userAgent;
	
	this.startCrawling = this.startCrawling.bind(this);

	require('node-phantom').create(this.phantomStarted.bind(this), {phantomPath: config.phantomPath || require('phantomjs').path});
  console.log("Phantom should been started");
};
util.inherits(CrawlerThread, EventEmitter);

CrawlerThread.prototype.phantomStarted = function(err, phantom) {
  console.log("CrawlerThread.prototype.phantomStarted");
	if (err) throw err;
	
	this.onPhantomExit = this.phantomExit.bind(this);
	phantom.on('exit', this.onPhantomExit);
	this.phantom = phantom;
	if (this.doExit) {
		this.exit();
	} else {
		this.requestUrl();
	}
};

CrawlerThread.prototype.requestUrl = function() {
	if (!this.urlRequestRunning && !this.exited) {
    var _this = this;
    if (this.config.crashRecover) {
      urlStore.getCrashedPage(this.startCrawling).then(function(err, replies) {
        _this.urlRequestRunning = true;
      });
    } else {
      urlStore.getPage(this.startCrawling).then(function(err, replies) {
        _this.urlRequestRunning = true;
      });
    }

	}
};

CrawlerThread.prototype.startCrawling = function(url) {
  console.log("startCrawling", url);
	this.urlRequestRunning = false;
	
	this.nbCrawlers++;
	var crawler = new Crawler(this.phantom, {
		url: url,
		onComplete: this.crawlDone.bind(this),
		userAgent: this.userAgent,
		parentId: this.id,
		thread: this,
		pageTransform: this.config.pageTransform,
		plugins: this.config.plugins
	});

	if (this.nbCrawlers < this.maxCrawlers) {
		this.requestUrl();
	}
};

CrawlerThread.prototype.crawlDone = function() {
	this.nbCrawlers--;
	if (this.nbCrawlers === 0) this.emit('idle');
	this.requestUrl();
};

CrawlerThread.prototype.isIdle = function() {
	return (this.nbCrawlers === 0);
};

CrawlerThread.prototype.exit = function() {
	console.log('[' + this.id + '] Exiting ' + (this.config.crashRecover ? 'crashRecover' : 'Crawler') + ' Thread');
	this.exited = true;
	if (!this.phantom) {
		// We might exit before phantom had time to start (eg. crawling only one image)
		this.doExit = true;
	} else {
		this.phantom.removeEventListener('exit', this.onPhantomExit);
		this.phantom.exit();
	}
};

CrawlerThread.prototype.phantomExit = function() {
	console.log('[' + this.id + '] Phantom crashed !');
	if (this.urlRequestRunning) {
		urlStore.cancelGetPage(this.startCrawling);
		this.urlRequestRunning = false;
	}
	this.exit();
	this.emit('crash');
};

module.exports = CrawlerThread;
