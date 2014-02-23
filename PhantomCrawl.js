'use strict';

var fs = require('fs');
var redis = require("redis");
var client = redis.createClient();

var CrawlerThread = require('./crawler/CrawlerThread');
var RessourceCrawler = require('./crawler/RessourceCrawler');
var urlStore = require('./url/urlStore');
var urlToPath = require('./url/urlToPath');

var NRP = require('node-redis-pubsub')
  , psConfig = { port: 6379
             , scope: 'pubsub'
             }
  , nrp = new NRP(psConfig);

process.on('uncaughtException', function (error) {
   console.log("ERROR:", error.stack);
});
process.stderr.on('data', function(err){
  console.log(err);
});

/**
 * Subscribers
 */

// Waits a new task
var nn;
/*
nrp.on('echo:newTask', function (data) {
  client.lpop('tasks', function (err, reply) {
      var task_config = JSON.parse(reply);
      console.log('Got the new task', reply);
     nn = new PhantomCrawl(task_config);
    }
  );
});
*/

/**
*   Publishers
*/


/**
 * @class PhantomCrawl
 * @constructor
 *
 * @param config {Object}
 * @param config.url {string} Url to crawl
 * @param [config.base='extract'] {string} path of the folder to store extracts
 * @param [config.urlFilters] {Array}
 * @param [config.maxDepth=0] {integer}
 * @param [config.useragent] {string}
 * @param [config.nbThreads=1] {integer}
 * @param [config.crawlerPerThread=1] {integer}
 * @param [config.pageTransform] {Array}
 * @param [config.plugins] {Array}
 * @param [config.subDomains] {Boolean} Download resources from subdomains and third domains, Default is False
 * @param [config.phantomPath] {String} Path of the phantom executable. Default is to use the bundled phantomjs.
 */
var PhantomCrawl = function(config) {
  console.log("config", config);
	this.config = config;

	urlToPath.setBase(config.base || 'extract');
	urlStore.setFilters(config.urlFilters);
	urlStore.setSubdomains(config.subDomains || false);

  var _this = this;
  urlStore.add({
			url: config.url,
			primary: true,
			level: 0
		}).then(function() {
      console.log("TADA");
      // TODO: use reject or catch for this
      //	if (urlStore.isEmpty()) throw new Error('no urls to crawl');
      if (config.maxDepth) require('./url/filters/level').setMaxLevel(config.maxDepth);

      config.userAgent = config.userAgent || 'Mozilla/5.0 (PhantomCrawl/' + require('./package.json').version + '; bot) AppleWebKit/534.34(KHTML, like Gecko) Chrome/13.0.764.0';

      _this.threads = [];
      var nbThreads = config.nbThreads || 1;
      while (nbThreads--) {
      		_this.startThread();
      }

      var rc = new RessourceCrawler({
        userAgent: config.userAgent
      });
      rc.on('idle', _this.checkFinish.bind(_this));
      _this.threads.push(rc);
    }).catch(function(error) {
      console.log("Failed!", error);
    });
};

PhantomCrawl.prototype.startThread = function(crashRecover) {
  console.log("Starting the new thread");
	var thread = new CrawlerThread({
		crashRecover: crashRecover,
		nbCrawlers: crashRecover ? 1 : this.config.crawlerPerThread,
		userAgent: this.config.userAgent,
		pageTransform: this.config.pageTransform,
		plugins: this.config.plugins,
		phantomPath: this.config.phantomPath
	});
	thread.on('idle', this.checkFinish.bind(this));
	thread.on('crash', this.threadCrash.bind(this, thread));
	this.threads.push(thread);
	
};

PhantomCrawl.prototype.threadCrash = function(thread) {
	this.threads = this.threads.filter(function(t) {
		return t !== thread;
	});
	this.startThread(thread.crashRecover);
	if (!this.hasCrashRecoverThread) {
		this.hasCrashRecoverThread = true;
		this.startThread(true);
	}
};

PhantomCrawl.prototype.checkFinish = function() {
	for (var i = 0; i < this.threads.length; i++) {
		if (!this.threads[i].isIdle()) return;
	}

  urlStore.isEmpty().then(function(isEmpty){
    console.log("isEmpty: ", isEmpty);
    if (!isEmpty) return;

    console.log('Crawl done. Exiting');
    console.log("Opened thread:", this.threads.length);
    for (i = 0; i < this.threads.length; i++) {
      this.threads[i].exit();
      console.log("Thread #" + i + " exit");
    }
  });
};

module.exports = PhantomCrawl;

var nn = new PhantomCrawl(
  {
    url: 'http://www.verkkokauppa.com/',
    maxDepth: 1,
    subDomains: false
  }
);