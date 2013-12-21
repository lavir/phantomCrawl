'use strict';

var EventEmitter = require('events').EventEmitter;
var util = require('util');

var async = require('async');
var smpl = require('smpl');

var urlStore = require('../url/urlStore');

var DEFAULT_TRANSFORMS = ['cleanInlineCss', 'cleanJs', 'absoluteUrls', 'canvas', 'inputs', 'charset', 'white'];
var STANDARD_TRANSFORMS = {
	absoluteUrls: './transforms/absoluteUrls',
	canvas: './transforms/canvas',
	charset: './transforms/charset',
	cleanJs: './transforms/cleanJs',
	inputs: './transforms/inputs',
	cleanInlineCss: './transforms/cleanInlineCss',
	fixFocus: './transforms/fixFocus',
	white: './transforms/white'
};

var DEFAULT_PLUGINS = ['DetectRedirects', 'LinkExtractor', 'PageReady', 'PageRessources', 'PageType', 'PageSave'];
var STANDARD_PLUGINS = {
	'DetectRedirects': './plugins/DetectRedirects',
	'LinkExtractor': './plugins/LinkExtractor',
	'PageReady': './plugins/PageReady',
	'PageRessources': './plugins/PageRessources',
	'PageSave': './plugins/PageSave',
	'PageType': './plugins/PageType'
};

var FORWARDED_EVENTS = {
	'resourceRequested': 'onResourceRequested',
	'resourceReceived': 'onResourceReceived',
	'resourceError': 'onResourceError'
};

/**
 * @class Crawler
 * @constructor
 *
 * @param phantom {Object} Instance of phantom created by node-phantom
 * @param config {Object}
 * @param config.url {Object}
 * @param [config.pageTransform] {Array}
 * @param [config.plugins] {Array}
 * @param config.thread {CrawlerThread}
 * @param config.onComplete {function}
 */
var Crawler = function(phantom, config) {
	this.id = config.parentId + '-' + smpl.utils.uniq();
	this.config = config;
	
	console.log('[' + this.id + '] crawling page ' + config.url.url);

	this.executes = [];
	
	this.pageTransform = this.preprocessPlugins(config.pageTransform || DEFAULT_TRANSFORMS, STANDARD_TRANSFORMS, true);
	this.plugins = this.preprocessPlugins(config.plugins || DEFAULT_PLUGINS, STANDARD_PLUGINS);
	
	phantom.createPage(this.onPageCreated.bind(this));
	this.onCrash = this.crashed.bind(this);
	config.thread.on('crash', this.onCrash);
};
util.inherits(Crawler, EventEmitter);

Crawler.prototype.preprocessPlugins = function(list, standards, exec) {
	for (var i = 0; i < list.length; i++) {
		var plugin = list[i];
		if (typeof plugin === 'string') {
			plugin = standards[plugin] || plugin;
			list[i] = plugin = require(plugin);
		}
		if (exec) this.exec(plugin, null, 0);
	}
	return list;
};

Crawler.prototype.onNewListener = function(event) {
	if (event in FORWARDED_EVENTS){
		var pageEvent = FORWARDED_EVENTS[event];
		if (!this.page[pageEvent]) {
			this.page[pageEvent] = this.emit.bind(this, event);
		}
	}
};

Crawler.prototype.onRemoveListener = function(event) {
	if (event in FORWARDED_EVENTS && this.listeners(event).length === 0) {
		var pageEvent = FORWARDED_EVENTS[event];
		delete this.page[pageEvent];
	}
};

Crawler.prototype.onPageCreated = function(err, page) {
	console.log('[' + this.id + '] page created');
	this.page = page;
	page.get('settings', (function(e, settings) {
		settings.userAgent = this.config.userAgent;
		page.set('settings', settings, this.onPageSettings.bind(this));
	}).bind(this));
};

Crawler.prototype.onPageSettings = function() {
	this.on('newListener', this.onNewListener.bind(this));
	this.on('removeListener', this.onRemoveListener.bind(this));
	
	this.plugins.forEach(function(Plugin) {
		new Plugin(this);
	}, this);
	
	if (this.closed) return;
	
	this.page.open(this.config.url.url);	
};

Crawler.prototype.pageReady = function() {
	if (!this.isReady) {
		this.isReady = true;
		if (this.closed) return;
		
		console.log('[' + this.id + '] page ready');
		
		this.emit('pageReady');
		
		var order = 0;
		async.forever((function(callback) {
			if (order >= 11) return callback('done');
			var exec = this.executes[order] && this.executes[order].shift();
			if (!exec) {
				order++;
				return callback();
			}
			this.page.evaluate(exec[0], function(err, res) {
				if (exec[1]) exec[1](res);
				callback(err);
			});
		}).bind(this), this.close.bind(this));
	}
};

Crawler.prototype.close = function(reason) {
	if (!this.closed) {
		this.closed = true;
		
		if (reason === 'done') reason = '';
		
		this.emit('close');

		this.config.thread.removeListener('crash', this.onCrash);
		this.removeAllListeners();
		
		if (!this.phantomCrashed) {
			this.page.close(this.onClosed.bind(this, reason));
		} else {
			this.onClosed(reason);
		}
	}
};

Crawler.prototype.onClosed = function(reason) {
	console.log('[' + this.id + '] done' + (reason ? ': ' + reason : ''));
	this.config.onComplete();
};

Crawler.prototype.crashed = function() {
	this.phantomCrashed = true;
	
	var url = smpl.object.update({}, this.config.url);
	var _this = this;
  url.crashed++;
	urlStore.add(url, true).then(function(){
    _this.close('phantom crashed');
  });
};

Crawler.prototype.exec = function(fn, cb, order) {
	if (order == null) order = 5;
	if (!this.executes[order]) this.executes[order] = [];
	this.executes[order].push([fn, cb]);
};

module.exports = Crawler;
