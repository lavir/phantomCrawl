'use strict';

var saveFile = require('../utils/saveFile');

var getHtml = function() {
	'use strict';
	
	var doctype = '';
	if (document.doctype) {
		doctype = '<!DOCTYPE ' +
		document.doctype.name +
		(document.doctype.publicId ? ' PUBLIC "' +  document.doctype.publicId + '"' : '') +
		(document.doctype.systemId ? ' "' + document.doctype.systemId + '"' : '') + '>';
	}
	return doctype + document.documentElement.outerHTML;
};

var PageSave = function(crawler) {
	this.crawler = crawler;
	crawler.exec(getHtml, this.save.bind(this), 10);
};

PageSave.prototype.save = function(html) {
	saveFile(this.crawler.config.url.path, html);
};

module.exports = PageSave;
